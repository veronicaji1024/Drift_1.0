---
name: drift-self-evolution
description: Profile Agent 驱动的自进化机制：行为信号采集 → 画像更新 → 参数反馈闭环。触发条件：修改 Profile Agent、调整 Intent Detector/Observer 的动态参数、新增行为信号。
---

# 自进化机制 — 个性化驱动的参数自适应

## 定位

Drift 的自进化不是"AI 自己变聪明"，而是**系统参数随用户行为模式自适应**。Profile Agent 是唯一的进化驱动器，通过行为反馈闭环调整其他组件的运行参数。

---

## 做什么 / 不做什么

**做**：采集行为信号 → 更新 UserProfile → 输出调参值 → 影响 Intent Detector / Observer / 导航展示

**不做**：
- 不读对话内容（只读行为信号，隐私安全）
- 不替用户做决策（只调参数，用户始终可覆盖）
- 不在对话过程中运行（会话结束时或关键操作时触发）
- 不一次性大幅调参（渐进式，避免系统行为突变）

---

## 行为反馈闭环

```
用户行为
  │
  ├─ fork 被撤销 ──→ thinkingStyle 偏 convergent ──→ Intent Detector 灵敏度 ↓
  │
  ├─ fork 被接受 ──→ thinkingStyle 偏 divergent ──→ Intent Detector 灵敏度 ↑
  │
  ├─ 频繁切换分支 ──→ interactionPattern 偏 questioner/collaborator
  │                   → 导航建议展示阈值 ↓（展示更多建议）
  │
  ├─ 深钻单分支 ──→ depthPreference 偏 deep
  │                 → 导航建议展示阈值 ↑（减少干扰）
  │
  ├─ 收敛时选表格 ──→ responsePreference = 'structured'
  │                   → Convergence 默认格式偏结构化
  │
  └─ 消息简短直接 ──→ responsePreference = 'concise'
                      → AI 回复偏简洁
```

### 关键设计决策

### 信号是行为不是内容

**Why**：认知风格体现在行为模式中（切换频率、撤销率、打字节奏），不需要分析对话内容。行为信号采集零 LLM 成本，且不触及用户隐私。

### 渐进信任模型

新用户的 `confidenceLevel` 为 `provisional`（数据不足），随会话积累从 developing → stable。不会因为一次会话的异常行为大幅改变画像维度。

**Why**：ADHD 用户的行为模式在不同任务间可能差异很大。一次"频繁撤销"可能只是因为任务类型不适合分支，不代表用户不喜欢自动 fork。渐进调参避免过拟合。

### Profile 参数是建议不是强制

其他组件（Intent Detector、AgentScheduler）读取 Profile 参数作为默认值，但：
- 用户手动 fork 不受 Profile 画像限制
- 用户可以在设置中覆盖任何 Profile 推导的行为调整

**Why**：自进化的目的是"越来越好用"，不是"越来越难控制"。掌控感是 ADHD 用户信任系统的前提。

---

## 与其他组件的关系

| 组件 | Profile 画像维度 | 影响 |
|------|-----------------|------|
| Intent Detector | `thinkingStyle` | divergent → 灵敏度高（多 fork），convergent → 灵敏度低 |
| AgentScheduler | `depthPreference` | deep → Observer debounce 更长（等用户深入后再观察） |
| Convergence Engine | `responsePreference` | structured → 默认格式偏结构化 |
| UI 导航 | `interactionPattern` | questioner → 展示更多导航建议 |
| 对话 LLM | `responsePreference` | concise/detailed → 调整回复长度和风格 |

---

## 存储

UserProfile 跨会话持久化。每次更新是增量合并（merge），不是覆盖（replace）。`confidenceLevel` 随数据量从 provisional → developing → stable，用于判断画像可靠度。`lastUpdated` 记录最后更新时间。
