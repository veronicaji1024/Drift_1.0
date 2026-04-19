---
name: drift-session-management
description: 分支对话的生命周期管理、上下文组装规则、跨分支信息流转。触发条件：修改 BranchManager、上下文组装逻辑、insight 推送机制。
---

# 分支对话管理

## 定位

Drift 的"分支"对应 Stello 的"Session"，但有根本差异：Drift 没有 MainSession，跨分支协调由 Synthesizer Agent 完成而非一个特殊的对话会话。

---

## 分支生命周期

```
created → active ←→ idle → archived
           ↑                    │
           └────────────────────┘  (用户可以重新激活)
```

| 状态 | 含义 | 触发条件 |
|------|------|---------|
| active | 用户正在交互 | 用户发消息 / switchTo |
| idle | 无近期消息 | 超过一定时间无交互（由 UI 判断） |
| archived | 用户主动关闭 | 用户点击"归档" |

**vs Stello**：Stello 只有 active / archived，没有 idle。Drift 的 idle 状态影响 AgentScheduler 的优先级（idle 分支的 Observer 优先级最低）。

---

## 上下文组装规则

每个分支是独立的 LLM 对话上下文：

```
[system prompt]
  ← 全局共享，所有分支相同

[insight]（如有）
  ← Synthesizer 推送的跨分支发现
  ← 消费后清除（一次性注入）

[T1 observations 摘要]（如有）
  ← 当前分支的最新 observation 的 topic/stage/keyPoints/openQuestions
  ← 帮助 LLM 知道"我们在讨论什么、进展到哪里"

[T0 recent messages]
  ← 当前分支的原始消息历史
  ← 受 token budget 限制，超出时截断旧消息

[user message]
  ← 用户当前输入
```

### 关键决策

### 没有 MainSession

**vs Stello**：Stello 有一个特殊的 MainSession 持有 synthesis，作为全局意识层参与对话。Drift 没有这个概念。

**Why**：Drift 是终端用户产品，用户不需要和"全局意识"对话。跨分支关联由 Synthesizer Agent 在后台完成，通过 insight 推送到各分支。用户感知到的是"这个分支的 AI 知道其他分支的信息"，不需要一个独立的全局对话窗口。

### Insight 替换策略（不追加）

每次 Synthesizer 运行产出新 insights，覆盖之前的。和 Stello 相同。

**Why**：insight 是"当前最新的跨分支发现"，不是历史记录。追加会导致 insight 越来越长，稀释最新信息。如果用户需要历史，GlobalMap 有版本记录。

### Insight 消费后清除

分支的下一次 LLM 调用会读取 insight 注入上下文，然后清除。

**Why**：insight 是一次性的上下文补充。如果不清除，同一个 insight 会在每次对话中重复出现，浪费 token 且困扰 LLM。

---

## 跨分支信息流转

```
Branch A ──T0──→ Observer A ──T1──→ Synthesizer ──insight──→ Branch B
Branch B ──T0──→ Observer B ──T1──↗                          ↑
Branch C ──T0──→ Observer C ──T1──↗                          │
                                                              │
                                            Synthesizer 决定推送给谁
```

**单向流动**：信息只从分支 → Observer → Synthesizer → 其他分支。分支之间永远不直接通信。

**vs Stello**：完全一致的原则。Stello 的子 Session 之间也不感知，只通过 MainSession 的 insights 间接通信。Drift 把 MainSession 换成了 Synthesizer Agent，但信息流向不变。

---

## 分支切换与串行执行

同一分支内的操作串行执行（防止 race condition），不同分支可以并行。

**vs Stello**：直接复用 SessionOrchestrator 的 per-session promise chain 模式。

分支切换时触发：
1. 旧分支标记为 idle（如果没有其他活跃操作）
2. 新分支标记为 active
3. AgentScheduler 调整优先级（新活跃分支的 Observer 提升为 high）
4. UI 显示 ReEntryBreadcrumb（如果新分支有 T1 observation）

---

## Fork 时的上下文继承

从某条消息 fork 时：
1. 新分支继承父分支到 fork 点的 T0 消息（可选）
2. `trimIncompleteToolCallGroup` 裁掉不完整的 tool call 组（复用 Stello 逻辑）
3. 新分支的 system prompt 继承父分支
4. 新分支**不继承**父分支的 T1 observations 或 insight（独立的记忆空间）

**Why 不继承 T1**：T1 是父分支完整对话的压缩，包含 fork 点之后的内容。子分支应该从 fork 点开始积累自己的 T1，不需要父分支后续讨论的信息。
