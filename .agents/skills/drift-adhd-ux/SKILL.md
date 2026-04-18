---
name: drift-adhd-ux
description: ADHD 场景的 UX 设计原则。触发条件：新增 UI 组件、修改通知/提示行为、讨论用户交互模式。
---

# ADHD UX 设计原则

## 定位

Drift 的所有 UX 决策服务于一个原则：**零摩擦发散，低成本修正**。ADHD 用户不缺想法，缺的是不打断思维流的组织手段。

---

## 核心原则

### 1. 不打断思维流

**规则**：任何系统行为都不应要求用户停下来做决策。

- 自动 fork 不弹确认框 → 先 fork，事后可撤销
- Insight 用 inline 注解，不用弹窗/模态框
- Observer/Synthesizer 在后台运行，不显示"正在分析..."的阻塞 UI
- 所有通知 10 秒后自动消失

**Why**：ADHD 用户的注意力窗口很短。一次弹窗打断可能导致整个思路丢失。事后修正的成本永远低于思维流被打断的成本。

### 2. Progressive Disclosure

**规则**：默认隐藏复杂度，用户需要时才展开。

- 分支树默认折叠，只显示活跃分支
- GlobalMap 的 overallProgress 不强制展示
- Convergence 面板默认收起
- 跨分支导航建议只在 relevance > 阈值时展示

**Why**：ADHD 用户容易被视觉噪声分散注意力。屏幕上的元素越少，当前任务的注意力越集中。

### 3. 可预测性 > 智能

**规则**：系统行为必须可预测。宁可少做，不可做错。

- Intent Detector 用规则引擎而非 LLM → 行为一致可预测
- 自动 fork 有 cooldown → 不会突然连续 fork 三次
- Profile Agent 调参是渐进的 → 不会今天保守明天激进

**Why**：不可预测的系统行为会增加 ADHD 用户的焦虑。如果用户不知道"系统接下来会做什么"，他们会花认知资源去预测系统行为，而不是思考自己的任务。

### 4. 自进化但用户可控

**规则**：Profile Agent 学习用户偏好，但用户随时可以覆盖。

- 系统越用越懂你（autoForkTolerance、intentDetectorSensitivity 自动调整）
- 但用户始终可以手动 fork、手动撤销、手动调整设置
- Profile 的调参是建议性的，不是强制性的

**Why**：自进化让系统越来越好用，但掌控感是 ADHD 用户信任系统的前提。"系统在帮我"和"系统在替我做主"的边界很细——Profile Agent 只调参数，不替用户做决策。

---

## 具体 UX 模式

### Auto-Fork Notice

轻量顶部 banner，非模态。显示"已为你开了新分支「{label}」"+ [继续聊] [撤销] [改名]。10 秒自动消失。

**不可以改成**：模态框、全屏提示、需要点击才消失的 toast。

### Re-Entry Breadcrumb

用户切回已离开的分支时显示"上次你在这里：{currentTask}"。首条新消息后自动消失。

**Why**：ADHD 用户频繁在分支间跳转，每次回来都要花时间回忆上下文。Breadcrumb 用零 LLM 成本（读 T1 的 currentTask）解决了这个问题。

### Inline Insight

紫色注解卡片，嵌在对话流中。hover 触发 Quick Peek。

**不可以改成**：弹窗、侧边栏 notification、独立的 insight 面板。必须在对话流的上下文中出现，用户才能理解"这个 insight 和我正在讨论的话题有什么关系"。

### 跨分支导航 relevance 阈值

- 新用户：只展示 relevance > 0.8（保守，避免过多干扰）
- 老用户（Profile 显示 topicSwitchFrequency = 'high'）：展示 relevance > 0.5
- `contradiction` 类型：始终展示（两个分支结论矛盾，用户必须知道）

**Why**：导航建议太多 = 注意力分散。太少 = 用户错过有用信息。Profile Agent 动态调阈值解决这个 tension。
