# Drift — Product Requirements Document

> 自由发散，自动收敛。为 ADHD 用户和所有"想得多、理得少"的人设计。

---

## 1. 产品定位

Drift 是一个非线性 AI 对话工具。用户随时开分支聊天，后台 agent 自动跨分支整理记忆，最终输出结构化结果。

**目标用户**：ADHD 用户及所有"想得多、理得少"的人。

**核心场景**：信息收集、方案调研、头脑风暴——需要大量发散但最终交付结构化结果的任务。

**与竞品差异**：

| 维度 | 传统 AI Chat | Stello (SDK) | Drift |
|------|-------------|--------------|-------|
| 对话结构 | 线性 | 树状（AI 驱动 fork） | 树状（AI 自动 fork + 用户可编辑） |
| 记忆管理 | 无 / 手动 | 开发者配置 | 自动 Observer/Synthesizer |
| 交付物 | 无 | 无 | Convergence Engine |
| 目标用户 | 通用 | 开发者 | ADHD / 发散型思维者 |

---

## 2. 核心功能

### 2.1 非线性对话

- 用户与 AI 的对话以**树状结构**组织
- AI 自动检测话题漂移并创建新分支（Intent Detector）
- 用户可以对分支进行**完整编辑**：
  - **Undo fork**：撤销最近的自动 fork，消息合并回父分支
  - **Rename**：修改分支标签
  - **Merge**：合并两个分支为一个（按时间戳交错排序）
  - **Move message**：拖拽单条消息到另一个分支
- 每个分支是独立的对话上下文，有自己的 AI 会话

### 2.2 后台记忆管理

四个 Agent 协同工作，用户无感知：

| Agent | 职责 | 触发 |
|-------|------|------|
| **Observer** | 压缩单个分支的对话为结构化观察 | 分支消息 token 超 20k |
| **Synthesizer** | 跨分支关联分析，生成全局认知地图 | 新 observation 产出时 |
| **Profile** | 学习用户行为模式，动态调参 | 会话结束 / 关键操作 |
| **Intent Detector** | 检测话题漂移，驱动自动 fork | 每条用户消息 |

### 2.3 收敛输出

- 用户随时可以选择分支 + 输出格式，生成结构化交付物
- 内置格式：大纲、对比表、决策矩阵、清单、自由摘要、自定义模板
- 数据源：T1 observations + GlobalMap（不读原始消息 → 快速）

### 2.4 跨分支导航

四层递进：

| 方式 | 主动性 | 说明 |
|------|--------|------|
| 手动切换 | 被动 | 用户点击树状图节点 |
| 语义搜索 | 半主动 | 搜索所有分支的 observations |
| Inline Insight | 主动 | Synthesizer 在对话中插入跨分支注解 |
| 主动推荐 | 最主动 | 建议用户跳转到高度相关的分支 |

Quick Peek：hover 预览目标分支摘要，不需要完整切换。

---

## 3. 用户交互流程

### 3.1 基础对话

```
用户打开 Drift → 看到一个空的根分支
              → 开始输入第一条消息
              → AI 回复
              → 继续对话...
```

### 3.2 自动分支

```
用户发消息 → Intent Detector 检测到话题漂移
           → 系统自动创建新分支
           → UI 显示轻提示："已为你开了新分支「{自动标签}」"
           → 用户继续在新分支中对话
           → 如果不满意：点击 [撤销] → 消息合并回原分支
```

### 3.3 手动分支编辑

```
用户长按/右键某条消息 → 菜单出现：
  - "从这里开分支"     → 手动 fork
  - "移动到其他分支"   → 拖拽 move
  
用户在分支树中右键某分支 → 菜单出现：
  - "重命名"
  - "与其他分支合并"
  - "归档"
```

### 3.4 收敛输出

```
用户点击 "收敛" 按钮 → Convergence 面板打开
                    → 自动选中当前分支及相关分支
                    → 用户选择输出格式
                    → 生成交付物
                    → 可导出/复制
```

### 3.5 跨分支导航

```
场景 A：Synthesizer 检测到分支 A 和分支 C 讨论同一话题
       → 在分支 A 的对话中出现注解：
         💡 「竞品分析」也讨论了这个定价模型 [查看]
       → 用户 hover [查看] → Quick Peek 弹出摘要
       → 用户点击 → 跳转到分支 C

场景 B：用户在搜索框输入 "定价"
       → 匹配到分支 B 和分支 C 的 observations
       → 高亮显示在树状图中
```

---

## 4. 记忆模型

### 四层记忆 (T0–T3)

| 层 | 名称 | 范围 | 触发 | 消费者 |
|----|------|------|------|--------|
| T0 | Raw Messages | Per-branch | 每条消息 | 该分支 LLM 上下文 |
| T1 | Observations | Per-branch | T0 token > 20k | 分支上下文 + Synthesizer |
| T2 | GlobalMap | Cross-branch | 新 T1 产出 | 所有分支 + Convergence + UI |
| T3 | Deliverables | 用户选择范围 | 用户触发 | 用户导出 |

### ObserverAgent 输出格式（T1）

```typescript
type BranchStage = 'exploring' | 'deepening' | 'concluding' | 'exhausted'

interface Observation {
  id: string
  branchId: string
  topic: string                 // 一句话概括分支在讨论什么
  stage: BranchStage            // 进展阶段
  keyPoints: string[]           // 已确认的关键结论（最多 5 条）
  openQuestions: string[]       // 待解问题（最多 3 条）
  directionSignal: string       // 走向信号
  messageRange: [number, number]
  timestamp: string
  tokenCount: number
}
```

### SynthesizerAgent 输出格式（T2）

```typescript
interface GlobalMap {
  overallTheme: {
    mainTopics: string[]        // 贯穿多个分支的核心议题
    sideTopics: string[]        // 局部探索的支线议题
  }
  branchLandscape: {
    summaries: BranchSummary[]  // 每个分支的一句话定位
    relations: BranchRelation[] // 分支间关系（7 种类型）
  }
  crossThemeConnections: CrossThemeConnection[]  // 跨主题隐含关联
  explorationCoverage: {
    wellExplored: string[]
    justStarted: string[]
    blindSpots: string[]
  }
  convergenceReadiness: {
    status: 'not_ready' | 'partially_ready' | 'ready'
    reason: string
  }
  navigationSuggestions: NavigationSuggestion[]   // 1-3 条导航建议
  timestamp: string
}
```

### ProfileAgent 输出格式

```typescript
interface UserProfile {
  thinkingStyle: { type: 'divergent' | 'convergent' | 'balanced'; description: string }
  depthPreference: { type: 'surface' | 'moderate' | 'deep'; description: string }
  interactionPattern: { type: 'questioner' | 'challenger' | 'collaborator' | 'director'; description: string }
  focusAreas: Array<{ topic: string; level: 'high' | 'medium' | 'low' }>
  responsePreference: 'concise' | 'detailed' | 'structured' | 'conversational'
  confidenceLevel: 'provisional' | 'developing' | 'stable'
  lastUpdated: string
}
```

### IntentDetector 输出格式

```typescript
interface IntentResult {
  intent: 'continue' | 'fork' | 'backtrack'
  confidence: 'high' | 'medium' | 'low'
  forkLabel?: string
  backtrackHint?: string
  reasoning: string
}
```

### 收敛输出格式

```typescript
type OutputFormat = 'outline' | 'structured-summary' | 'comparison' | 'decision-matrix' | 'full-report' | 'custom'
```

---

## 5. 分支编辑

### 5.1 消息与分支解耦

消息是独立实体，`branchId` 可变。分支通过查询获取消息列表。

### 5.2 Fork Undo 栈

记录最近 10 次自动 fork，支持一键撤销。

### 5.3 Merge 策略

默认按时间戳交错。合并后触发 Observer 重新观察。

### 5.4 Move Message

拖拽单条消息到其他分支。移动后记录 `moveHistory`，受影响分支触发 Observer 重新观察。

---

## 6. ADHD 专属设计

| 设计 | 说明 | 技术实现 |
|------|------|---------|
| Attention-Aware 调度 | Observer 优先处理活跃分支 | AgentScheduler 优先级队列 |
| Re-Entry Breadcrumbs | 返回分支时显示上次进展 | 读 T1 的 currentTask |
| Auto-Fork + Easy Undo | 零摩擦发散，一键修正 | Intent Detector + Fork Undo 栈 |
| Progressive Disclosure | 树默认折叠，insight 轻量注解 | UI 状态管理 |
| 自进化 | 系统越用越懂你 | Profile Agent 行为反馈闭环 |

---

## 7. 验收标准

1. Intent Detector 检测到话题漂移时自动 fork，UI 显示轻提示
2. 用户可以撤销自动 fork、合并分支、拖拽消息到其他分支
3. Observer 在分支 T0 超 20k token 后自动触发，产出结构化 observation
4. Synthesizer 产出 GlobalMap：分支主题句 + 关系 + 跨分支关联 + 导航建议
5. 用户可以选择分支 + 格式，生成结构化交付物
6. 所有 agent 工作不阻塞用户对话
7. 分支编辑后自动触发受影响分支的 Observer 重新观察
8. 返回已离开分支时显示 re-entry breadcrumb
9. Profile Agent 动态调整 Intent Detector 灵敏度
10. 跨分支导航：inline insight + 主动推荐 + 语义搜索 + Quick Peek

## 8. 失败条件

1. Agent 运行阻塞用户对话响应
2. Observer 产出非结构化自由文本
3. 用户需要手动整理才能获得有用的收敛输出
4. 自动 fork 无法撤销或撤销后消息丢失
5. 自动 fork 过于频繁导致用户反感
6. 消息移动后数据不一致

---

## 9. V2 规划（V1 跑通后）

以下功能不在 V1 范围内，V1 目标是用 InMemoryAdapter + 免费 LLM API 跑通完整流程。

### 9.1 用户认证与登录

- 第三方 OAuth（Google / GitHub / 微信）
- 邮箱 + 密码注册
- JWT session 管理
- 多用户隔离（Profile 按 userId 隔离已在接口层预留）

### 9.2 持久化存储

- SQLite 本地存储（单用户桌面版）
- PostgreSQL 托管存储（多用户 SaaS 版）
- 数据迁移工具（InMemory → SQLite → PG）
- 接口已通过 DriftStorage 抽象，切换存储只需实现新 adapter

### 9.3 LLM 升级

- V1：免费/低成本模型（千问 Turbo、DeepSeek Chat、SiliconFlow 开源模型）
- V2：分层模型策略（Observer 用 Haiku、Synthesizer 用 Sonnet、Convergence 用 Opus）
- LLMRouter 已支持多 adapter，按 agent 类型路由到不同模型

### 9.4 部署

- 前端：Vercel / Cloudflare Pages
- 后端 API：Node.js 服务 + PG
- 实时通信：WebSocket（agent 运行进度推送）
