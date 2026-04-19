---
name: drift-storage-flow
description: 存储层数据流、接口分层、消息与分支解耦的持久化策略。触发条件：新增存储适配器、修改数据模型、理解数据在存储层的流转。
---

# 存储层 — 数据流与持久化策略

## 定位

Drift 的存储层是**按数据类型分接口**的扁平结构，不像 Stello 按消费者分层（SessionStorage / MainStorage）。因为 Drift 没有 MainSession 的概念——所有组件都可能读写多种数据。

---

## 7 个存储接口

| 接口 | 数据 | 核心特征 |
|------|------|---------|
| MessageStorage | T0 消息 | **branchId 可变**（支持 move/merge） |
| BranchStorage | 分支树 | 树结构 CRUD + 递归查询 |
| ObservationStorage | T1 观察 | per-branch append-only |
| GlobalMapStorage | T2 全局地图 | 全局唯一，带历史版本 |
| ProfileStorage | 用户画像 | per-user，跨会话持久 |
| ForkRecordStorage | Fork undo 栈 | LIFO 栈，最近 10 条 |
| DeliverableStorage | T3 交付物 | append-only，用户可导出 |

DriftStorage 是聚合接口，组合以上 7 个 + `transaction()`。

---

## 核心设计决策

### 消息独立于分支存储

**vs Stello**：Stello 的 Record 通过 `appendRecord(sessionId, record)` 绑定到 Session，之后不可移动。Drift 的 Message 是独立实体，`branchId` 是可变字段。

**Why**：用户需要 move message 和 undo fork。如果消息硬绑定分支，这两个操作需要删除+重建，丢失消息 ID 和历史。branchId 可变使得移动是原子操作。

**代价**：查询 "某分支的所有消息" 需要走索引扫描而非直接关联。InMemory 实现用全表扫描，SQLite/PG 实现需要在 `messages.branch_id` 上建索引。

### 消息移动记录 moveHistory

每次 `updateBranchId()` 自动追加 `{ from, to, at }` 到消息的 `moveHistory`。

**Why**：undo fork 需要知道消息的原始分支。如果用户 undo fork 后又 undo，需要完整的移动历史才能正确回溯。

### GlobalMap 保留历史版本

`GlobalMapStorage.put()` 不覆盖，而是追加到历史数组。`get()` 返回最新版本。

**Why**：Synthesizer 每次运行都产出新 GlobalMap。保留历史版本使得：
1. 可以对比 "上一次 GlobalMap vs 当前" 来检测变化
2. 前端可以展示进度变化（"从 3 个探索中分支变成 2 个已收敛"）
3. 调试时可以回溯 Synthesizer 的决策轨迹

### ForkRecord 是 LIFO 栈

**Why**：undo 的自然语义是"撤销最近一次"。栈结构使得 `pop()` 就是 undo。限制 10 条是因为超过 10 次的 undo 已经超出"修正"的范畴——用户应该用 merge 而非连续 undo。

---

## 数据流转图

```
用户发消息
  → MessageStorage.append({ branchId, role, content })

自动 fork
  → BranchStorage.create({ parentId, label })
  → ForkRecordStorage.push({ parentBranchId, childBranchId, ... })
  → MessageStorage.append({ branchId: newBranchId, ... })

undo fork
  → ForkRecordStorage.pop()
  → MessageStorage.bulkUpdateBranchId(childMessages, parentBranchId)
  → BranchStorage.delete(childBranchId)

merge
  → MessageStorage.bulkUpdateBranchId(sourceMessages, targetBranchId)
  → BranchStorage.delete(sourceBranchId)
  → ObservationStorage.deleteByBranch(sourceBranchId)  ← T1 失效

move message
  → MessageStorage.updateBranchId(messageId, targetBranchId)  ← 自动记录 moveHistory

Observer 运行
  → MessageStorage.getByBranch(branchId) + .countTokens()
  → ObservationStorage.append(observation)

Synthesizer 运行
  → ObservationStorage.getAll()
  → BranchStorage.getTree()
  → GlobalMapStorage.put(globalMap)

Convergence
  → ObservationStorage.getByBranch(branchId)  ← 选中分支
  → GlobalMapStorage.get()
  → DeliverableStorage.save(deliverable)
```

---

## 适配器实现策略

### InMemoryAdapter
- Map-based，用于测试
- `transaction()` 直接执行（无回滚）
- 消息查询用全表扫描 + filter

### IndexedDBAdapter
- 浏览器原生 IndexedDB，7 个 object store 对应 7 个存储接口
- `messages` store 在 `branchId` 上建索引（高频查询）
- `transaction()` 用 IndexedDB 的 transaction（支持 readwrite + 自动回滚）
- GlobalMap 历史用 `globalMaps` store append-only + index on `timestamp`

### SQLiteAdapter / PGAdapter（V2 计划中）
- V2 阶段按需实现，接口已通过 DriftStorage 抽象预留
