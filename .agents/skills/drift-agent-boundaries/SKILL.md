---
name: drift-agent-boundaries
description: 4 个 Agent + Intent Detector 的职责边界。触发条件：新增 agent、修改 agent 输入输出、不确定功能该放哪个 agent。
---

# Agent 职责边界

## 定位

Drift 有 4 个 agent + 1 个规则引擎，各自有严格的"做什么/不做什么"边界。职责蔓延是系统腐化的主要原因。

---

## Observer（per-branch，压缩型）

**做**：读单个分支的 T0 raw messages → 产出结构化 T1 observation（topics/facts/decisions/openQuestions/currentTask）

**不做**：
- 不读其他分支的任何数据（完全隔离）
- 不读 T2 GlobalMap（不知道全局状态）
- 不推送 insight 给任何分支（那是 Synthesizer 的事）
- 不决定何时运行自己（那是 AgentScheduler 的事）

**Why 隔离**：Observer 是最高频运行的 agent（每 ~20k token 触发一次 per branch），必须快、便宜、无副作用。如果它读跨分支数据，运行时间和成本都会飙升。

---

## Synthesizer（全局唯一，关联型）

**做**：读所有分支的 T1 observations + 树结构 → 产出 GlobalMap（branchSummaries + crossBranchInsights + navigationHints + overallProgress）→ 推送 insights 到相关分支

**不做**：
- 不读 T0 raw messages（只读 T1，靠 Observer 先压缩）
- 不生成交付物（那是 Convergence Engine 的事）
- 不决定何时 fork（那是 Intent Detector 的事）
- 不修改分支结构（只读树结构，不写）

**Why 不读 T0**：Synthesizer 的输入是所有分支的 T1 总和，如果读 T0 则输入规模是 T1 的 5-40 倍，成本不可接受。Observer 的结构化压缩是 Synthesizer 可行的前提。

---

## Profile Agent（跨会话，建模型）

**做**：读用户行为信号（fork 撤销率、切换频率、输出格式偏好等）→ 产出 UserProfile → 反馈调参（intentDetectorSensitivity, observerDebounceSec, forkCooldownTurns）

**不做**：
- 不读对话内容（只读行为信号，保护隐私）
- 不直接修改系统行为（通过 UserProfile 间接影响 Intent Detector 和 AgentScheduler）
- 不在对话中运行（会话结束时或关键操作时运行）

**Why 行为信号不是内容**：Profile Agent 的目的是学习"这个用户怎么思考"，不是"这个用户在想什么"。行为信号（撤销频率、切换模式）比内容更能反映认知风格，且不触及隐私。

---

## Intent Detector（inline，零成本）

**做**：判断当前消息是否偏离分支主题 → 输出 drift/converge/continue + confidence → 驱动自动 fork 或浮出 Convergence

**不做**：
- 不调用 LLM（纯规则 + 关键词 + topic overlap）
- 不自己执行 fork（只返回判断结果，由 ForkManager 执行）
- 不做跨分支分析（只看当前分支的 T1 topics）

**Why 不用 LLM**：Intent Detector 每条用户消息都运行，如果用 LLM 则每条消息多一次 LLM 调用。对 ADHD 用户来说延迟感知极敏感，任何额外等待都会打断思维流。规则引擎延迟 <1ms。

---

## Convergence Engine（按需，生成型）

**做**：读选中分支的 T1 + GlobalMap → 按用户指定格式生成结构化交付物

**不做**：
- 不读 T0（除非 T1 不存在的 fallback 场景）
- 不自动触发（只响应用户主动请求）
- 不修改任何分支状态

**Why 不自动触发**：ADHD 用户需要掌控感。自动生成交付物会让用户感觉"系统在替我做决定"。收敛是用户主动选择的行为。

---

## AgentScheduler

**做**：监听 EventBus 事件 → 根据阈值和优先级决定运行哪个 agent → fire-and-forget 执行

**不做**：不实现任何 agent 逻辑，只做调度决策

优先级：active branch Observer > Synthesizer > new branch Observer > idle branch Observer > Profile Agent
