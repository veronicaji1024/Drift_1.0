---
name: drift-fork-model
description: 自动 fork + 完整编辑的设计理由。触发条件：修改 ForkManager、Intent Detector 的 fork 触发逻辑、分支编辑操作、消息移动。
---

# Fork 模型 — 自动 Fork + 完整编辑

## 定位

Drift 的 fork 是"AI 自动 fork + 用户事后修正"，不是 Stello 的"AI tool call 主动 fork"，也不是"用户手动 fork"。

---

## 做什么 / 不做什么

**做**：Intent Detector 检测话题漂移 → 自动创建分支 → UI 轻提示 + 撤销按钮。用户可以 undo fork、merge 分支、拖拽消息。

**不做**：
- 不让用户在 fork 前做决策（不弹确认框，先 fork 再说）
- 不阻止频繁 fork（靠 cooldown 而非 SplitGuard 的 minTurns）
- 不级联删除（undo fork 只移消息回父分支，不影响子分支的子分支）

---

## 核心设计决策

### 为什么自动 fork 而非用户手动

**Why**：ADHD 用户的核心问题是"想不到要组织"。等他们意识到该 fork 时，一个分支已经混了 5 个话题。自动 fork 把组织成本从用户转移到系统。

### 为什么不用 Stello 的 AI tool call 方式

Stello 让 LLM 在推理过程中调用 `stello_create_session` tool。问题：
1. LLM 的 fork 判断不稳定（依赖 prompt 质量）
2. 每次推理都带 tool 定义，增加 token 消费
3. Fork 时机受 LLM 推理延迟影响

Drift 用规则引擎做 Intent Detection：零 LLM 成本、延迟 <1ms、行为可预测。

### 为什么事后修正而非事前确认

事前确认（弹框问"要 fork 吗？"）打断思维流。对 ADHD 用户来说，每次打断都是认知负荷。事后修正（先 fork，不满意再撤销）的认知成本更低——大多数时候用户不需要做任何操作。

### 消息与分支解耦

消息的 `branchId` 是可变字段，不是 readonly。这是 move message 和 undo fork 的前提。

**Why**：Stello 的消息（Record）绑定到 Session 后不可移动，因为 Stello 是 SDK——消息归属确定性对开发者很重要。Drift 是终端用户产品——用户需要"这条消息放错分支了"的修正能力。

### Merge 默认按时间戳交错

**Why**：还原真实时间线。用户经常在两个分支间交替发消息，按时间排序能看到自己的完整思考路径。追加模式作为备选，适合"分支 B 是 A 的延续"场景。

### Merge/Move 后触发 Observer 重新观察

**Why**：消息序列变了，原有 T1 observation 的 messageRange 失效。必须重新观察以保持 T1 数据一致性。这是完整编辑能力的架构成本。

---

## Fork Undo 栈

记录最近 10 次自动 fork。为什么是栈而不是列表？因为 undo 的自然语义是"撤销最近一次"，LIFO 最符合直觉。

## Cooldown 机制

自动 fork 被用户撤销后，同一分支内等 N 轮再触发。N 由 Profile Agent 的 `forkCooldownTurns` 动态调整。新用户 N 较大（保守），老用户根据接受率调整。
