# Drift — Architecture Document

---

## 1. 系统架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  drift-ui (Presentation Layer)                               │
│  React + TypeScript                                          │
│  NetworkGraph · ConversationPanel · ConvergencePanel · Nav   │
├─────────────────────────────────────────────────────────────┤
│  drift-agents (Agent Layer)                                  │
│  Observer · Synthesizer · ProfileAgent · IntentDetector      │
│  · ConvergenceEngine · AgentScheduler                        │
├─────────────────────────────────────────────────────────────┤
│  drift-core (Dialogue Core)                                  │
│  BranchManager · MessageStore · ForkManager · EventBus       │
│  · LLMRouter · TokenCounter                                  │
├─────────────────────────────────────────────────────────────┤
│  drift-storage (Infrastructure)                              │
│  StorageAdapter interface · InMemoryAdapter · IndexedDBAdapter│
└─────────────────────────────────────────────────────────────┘
```

依赖方向：`drift-storage` ← `drift-core` ← `drift-agents` ← `drift-ui`

---

## 2. 包职责

### 2.1 drift-storage

**职责**：定义存储接口 + 提供实现。所有数据持久化的唯一出口。

**核心接口**：

```typescript
/** 消息存储 */
interface MessageStorage {
  append(message: Message): Promise<void>
  getByBranch(branchId: string, options?: { limit?: number; offset?: number }): Promise<Message[]>
  getById(id: string): Promise<Message | null>
  updateBranchId(messageId: string, newBranchId: string): Promise<void>
  bulkUpdateBranchId(messageIds: string[], newBranchId: string): Promise<void>
  countTokens(branchId: string, sinceMessageId?: string): Promise<number>
  search(query: string): Promise<Array<{ message: Message; score: number }>>
}

/** 分支存储 */
interface BranchStorage {
  create(branch: Omit<Branch, 'id'>): Promise<Branch>
  get(id: string): Promise<Branch | null>
  getRoot(): Promise<Branch>
  getChildren(parentId: string): Promise<Branch[]>
  getTree(): Promise<BranchTreeNode>
  update(id: string, updates: Partial<Pick<Branch, 'label' | 'status' | 'parentId'>>): Promise<Branch>
  delete(id: string): Promise<void>
  listAll(filter?: { status?: BranchStatus }): Promise<Branch[]>
}

/** Observation 存储 */
interface ObservationStorage {
  append(observation: Observation): Promise<void>
  getByBranch(branchId: string): Promise<Observation[]>
  getAll(): Promise<Observation[]>
  deleteByBranch(branchId: string): Promise<void>
  countTokens(branchId?: string): Promise<number>
}

/** GlobalMap 存储 */
interface GlobalMapStorage {
  put(globalMap: GlobalMap): Promise<void>
  get(): Promise<GlobalMap | null>
  getHistory(limit?: number): Promise<GlobalMap[]>
}

/** UserProfile 存储 */
interface ProfileStorage {
  get(userId: string): Promise<UserProfile | null>
  put(userId: string, profile: UserProfile): Promise<void>
}

/** ForkRecord 存储 */
interface ForkRecordStorage {
  push(record: ForkRecord): Promise<void>
  pop(): Promise<ForkRecord | null>
  list(limit?: number): Promise<ForkRecord[]>
  clear(): Promise<void>
}

/** Deliverable 存储 */
interface DeliverableStorage {
  save(deliverable: Deliverable): Promise<void>
  get(id: string): Promise<Deliverable | null>
  list(): Promise<Deliverable[]>
}

/** 聚合存储接口 */
interface DriftStorage {
  messages: MessageStorage
  branches: BranchStorage
  observations: ObservationStorage
  globalMap: GlobalMapStorage
  profile: ProfileStorage
  forkRecords: ForkRecordStorage
  deliverables: DeliverableStorage
  transaction<T>(fn: () => Promise<T>): Promise<T>
}
```

**实现**：
- `InMemoryAdapter`：Map-based，用于测试和开发
- `IndexedDBAdapter`：浏览器原生 IndexedDB，7 个 object store，页面刷新后数据保留

### 2.2 drift-core

**职责**：业务逻辑层。管理分支、消息、fork、合并、事件分发。

**核心模块**：

| 模块 | 职责 | 关键 API |
|------|------|---------|
| `BranchManager` | 分支 CRUD + 树结构操作 | `create()`, `archive()`, `getTree()` |
| `MessageStore` | 消息 CRUD + 跨分支移动 | `append()`, `move()`, `getByBranch()` |
| `ForkManager` | Fork/undo/merge 编排 | `fork()`, `undoFork()`, `mergeBranches()` |
| `EventBus` | 事件分发（解耦 core ↔ agents） | `emit()`, `on()`, `off()` |
| `LLMRouter` | LLM 调用抽象 | `chat()`, `stream()` |
| `TokenCounter` | Token 估算 | `estimate(text)`, `countBranch(id)` |

**事件类型**：

```typescript
type DriftEvent =
  | { type: 'message:appended'; branchId: string; messageId: string }
  | { type: 'message:moved'; messageId: string; from: string; to: string }
  | { type: 'branch:created'; branch: Branch; auto: boolean }
  | { type: 'branch:merged'; sourceId: string; targetId: string }
  | { type: 'branch:archived'; branchId: string }
  | { type: 'fork:undone'; forkRecord: ForkRecord }
  | { type: 'fork:created'; forkRecord: ForkRecord }
  | { type: 'observation:created'; observation: Observation }
  | { type: 'globalmap:updated'; globalMap: GlobalMap }
  | { type: 'branch:switched'; from: string; to: string }
```

**ForkManager 详细逻辑**：

```
fork(parentBranchId, forkMessageId, options?):
  1. 创建新 Branch（parentId = parentBranchId）
  2. 如果 options.inheritContext：
     a. 复制 parentBranch 的消息到 forkMessageId 为止
     b. trimIncompleteToolCallGroup（复用 Stello 逻辑）
  3. 记录 ForkRecord 到 undo 栈
  4. emit('fork:created', record)
  5. emit('branch:created', { branch, auto })

undoFork(forkRecordId?):
  1. pop 最近的 ForkRecord（或指定 ID）
  2. 将 childBranch 的所有消息 bulkUpdateBranchId → parentBranch
  3. 删除 childBranch
  4. emit('fork:undone', record)

mergeBranches(sourceId, targetId, strategy = 'interleave'):
  1. 获取两个分支的所有消息
  2. 如果 strategy === 'interleave'：按 timestamp 排序合并
  3. 如果 strategy === 'append'：source 消息追加到 target 末尾
  4. bulkUpdateBranchId(sourceMessages, targetId)
  5. 删除 sourceBranch
  6. emit('branch:merged', { sourceId, targetId })
```

### 2.3 drift-agents

**职责**：所有 AI agent 的实现 + 调度器。

**各 Agent 详情**：

| Agent | 输入 | 输出 | 触发条件 | LLM 层级 |
|-------|------|------|---------|---------|
| ObserverAgent | 分支的原始 messages | Observation | message:appended 事件 | Haiku / 4o-mini |
| SynthesizerAgent | 所有分支的 observations + 树结构 | GlobalMap | observation:created (debounce 30s) | Sonnet / 4o |
| ProfileAgent | 用户行为信号 | UserProfile (增量) | 会话结束 / undo fork / merge | Haiku / 4o-mini |
| IntentDetector | 当前消息 + 分支上下文 | IntentResult | 每条用户消息 | 无 LLM（规则引擎） |
| ConvergenceEngine | 选中分支 observations + GlobalMap + 格式 | Deliverable | 用户主动触发 | Opus / 4 |

**AgentScheduler**：

```typescript
interface AgentScheduler {
  /** 注入 agent 实例 */
  injectAgents(deps: AgentSchedulerDeps): void
  /** 注册 agent 任务 */
  schedule(task: AgentTask): void
  /** 处理事件，决定触发哪些 agent */
  handleEvent(event: DriftEvent): void
  /** 注册事件监听 */
  listen(): void
  /** 清理资源 */
  dispose(): void
}

interface AgentSchedulerDeps {
  observer?: ObserverAgent
  synthesizer?: SynthesizerAgent
}

interface AgentTask {
  agent: string
  priority: 'high' | 'medium' | 'low'
  branchId?: string
  debounceMs?: number
  run: () => Promise<void>
}
```

优先级队列：
1. **high**：活跃分支的 Observer
2. **medium**：Synthesizer、新 fork 分支的 Observer
3. **low**：idle 分支的 Observer、ProfileAgent

所有任务 fire-and-forget，不阻塞用户对话。AgentScheduler 在 agent 执行完成后负责发射 `observation:created` 和 `globalmap:updated` 事件。

### 2.4 drift-ui

**职责**：React 前端组件。

**组件树**：

```
<DriftApp>
  ├── <NetworkGraph />          // D3-force 力导向网络图（单击节点切换分支）
  ├── <ResizeHandle />          // 拖拽调节面板宽度
  ├── <ConversationPanel>       // 右侧固定对话面板（可隐藏/拖拽宽度）
  │     ├── <ReEntryBreadcrumb />   // 返回时显示上次进展
  │     ├── <MessageList />         // 消息列表
  │     ├── <AutoForkNotice />      // 自动 fork 提示 + 撤销按钮
  │     ├── <InlineInsightList />   // 跨主题关联注解
  │     └── <ChatInput />           // 输入框 + 导航建议浮层
  ├── <ConvergencePanel />    // 收敛输出面板
  ├── <SearchPanel />         // 语义搜索面板
  └── <QuickPeek />           // hover 预览弹窗
```

**状态管理**：Zustand store（服务注入模式）

```typescript
interface DriftStore {
  // 分支状态
  branches: Record<string, Branch>
  activeBranchId: string | null
  tree: BranchTreeNode | null

  // 消息状态
  messagesByBranch: Record<string, Message[]>

  // Agent 状态
  globalMap: GlobalMap | null
  observations: Record<string, Observation[]>
  profile: UserProfile | null

  // UI 状态
  autoForkNotice: AutoForkNoticeData | null
  convergenceResult: Deliverable | null
  convergenceLoading: boolean
  convergenceError: string | null
  quickPeekBranchId: string | null
  loadingBranches: Set<string>
  errorByBranch: Record<string, string>
  rightPanelVisible: boolean        // 默认 true
  rightPanelWidth: number           // 默认 400px, min 320 / max 50vw

  // Actions
  switchBranch(id: string): void
  sendMessage(branchId: string, content: string): void
  undoFork(): void
  mergeBranches(sourceId: string, targetId: string): void
  moveMessage(messageId: string, targetBranchId: string): void
  renameBranch(branchId: string, newLabel: string): void
  archiveBranch(branchId: string): void
  requestConvergence(branchIds: string[], format: OutputFormat): void
  dismissAutoForkNotice(): void
  toggleRightPanel(): void
  setRightPanelWidth(width: number): void
}

interface AutoForkNoticeData {
  branchId: string
  parentBranchId: string
  forkRecordId: string
  label: string
}
```

---

## 3. 数据模型

### 3.1 核心类型

```typescript
/** 消息（独立于分支） */
interface Message {
  id: string
  branchId: string              // 可变 — 支持跨分支移动
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string             // ISO 8601
  toolCalls?: ToolCall[]
  toolCallId?: string
  moveHistory?: MoveRecord[]    // 移动历史
}

interface MoveRecord {
  from: string                  // 源 branchId
  to: string                    // 目标 branchId
  at: string                    // ISO 8601
}

/** 分支 */
interface Branch {
  id: string
  parentId: string | null       // null = 根分支
  label: string
  status: BranchStatus
  createdAt: string
  updatedAt: string
  lastActiveAt: string
  metadata: Record<string, unknown>
}

type BranchStatus = 'active' | 'idle' | 'archived'

/** 分支树节点（UI 渲染用） */
interface BranchTreeNode {
  id: string
  label: string
  status: BranchStatus
  children: BranchTreeNode[]
}

/** Fork 记录（undo 栈） */
interface ForkRecord {
  id: string
  parentBranchId: string
  childBranchId: string
  forkMessageId: string
  timestamp: string
  auto: boolean
}

/** 分支进展阶段 */
type BranchStage = 'exploring' | 'deepening' | 'concluding' | 'exhausted'

/** Observation — 分支上下文摘要（ObserverAgent 输出） */
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

/** GlobalMap — 全局对话地图（SynthesizerAgent 输出） */
interface GlobalMap {
  overallTheme: {
    mainTopics: string[]
    sideTopics: string[]
  }
  branchLandscape: {
    summaries: BranchSummary[]
    relations: BranchRelation[]
  }
  crossThemeConnections: CrossThemeConnection[]
  explorationCoverage: {
    wellExplored: string[]
    justStarted: string[]
    blindSpots: string[]
  }
  convergenceReadiness: {
    status: ConvergenceReadiness   // 'not_ready' | 'partially_ready' | 'ready'
    reason: string
  }
  navigationSuggestions: NavigationSuggestion[]
  timestamp: string
}

interface BranchSummary {
  branchId: string
  topicSentence: string
  stage: BranchStage
  role: string                  // 该分支在整体对话中的角色
}

interface BranchRelation {
  branchIdA: string
  branchIdB: string
  types: BranchRelationType[]
}

type BranchRelationType =
  | 'complementary' | 'competing' | 'progressive'
  | 'derived' | 'contradictory' | 'supporting' | 'independent'

interface CrossThemeConnection {
  branchIds: string[]
  nature: string                // 关联的性质
  significance: string          // 为什么值得关注
}

type NavigationAction = 'deep_dive' | 'new_direction' | 'jump' | 'converge'

interface NavigationSuggestion {
  action: NavigationAction
  target: string
  reasoning: string
}

/** UserProfile — 用户画像（ProfileAgent 输出） */
interface UserProfile {
  thinkingStyle: { type: ThinkingStyle; description: string }
  depthPreference: { type: DepthPreference; description: string }
  interactionPattern: { type: InteractionPattern; description: string }
  focusAreas: Array<{ topic: string; level: 'high' | 'medium' | 'low' }>
  responsePreference: ResponsePreference
  confidenceLevel: ProfileConfidence
  lastUpdated: string
}

type ThinkingStyle = 'divergent' | 'convergent' | 'balanced'
type DepthPreference = 'surface' | 'moderate' | 'deep'
type InteractionPattern = 'questioner' | 'challenger' | 'collaborator' | 'director'
type ResponsePreference = 'concise' | 'detailed' | 'structured' | 'conversational'
type ProfileConfidence = 'provisional' | 'developing' | 'stable'

type OutputFormat = 'outline' | 'structured-summary' | 'comparison' | 'decision-matrix' | 'full-report' | 'custom'

/** Deliverable（收敛输出） */
interface Deliverable {
  id: string
  branchIds: string[]
  format: OutputFormat
  content: string
  observationsUsed: string[]
  timestamp: string
}

/** IntentResult（IntentDetector 规则引擎输出） */
interface IntentResult {
  intent: IntentType            // 'continue' | 'fork' | 'backtrack'
  confidence: IntentConfidence  // 'high' | 'medium' | 'low'
  forkLabel?: string
  backtrackHint?: string
  reasoning: string
}

/** LLM 适配器 */
interface LLMAdapter {
  chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>
  stream?(messages: LLMMessage[], options?: LLMOptions): AsyncIterable<LLMChunk>
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LLMOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  tools?: ToolDefinition[]
}
```

---

## 4. 数据流

```
用户输入
  │
  ├──→ IntentDetector.detect(message, branchContext?)
  │      │
  │      ├─ fork → ForkManager.fork(currentBranch, lastMessage, { auto: true })
  │      │          → emit('branch:created') + emit('fork:created')
  │      │          → UI: AutoForkNotice
  │      │
  │      ├─ backtrack → UI: 提示用户可能想返回之前的话题
  │      │
  │      └─ continue → 留在当前分支
  │
  ├──→ MessageStore.append(message) → emit('message:appended')
  │
  ├──→ LLM.chat(context) → MessageStore.append(response)
  │
  └──→ AgentScheduler.handleEvent('message:appended')
         │
         ├─ Observer.run(branchId)
         │    → ObservationStorage.append()
         │    → AgentScheduler emit('observation:created')
         │
         └─ [observation event, debounce 30s] → Synthesizer.run()
              → GlobalMapStorage.put()
              → AgentScheduler emit('globalmap:updated')

用户编辑操作
  │
  ├─ undoFork → ForkManager.undoFork()
  │              → messages 移回父分支
  │              → 删除子分支
  │              → 触发 Observer 重新观察受影响分支
  │
  ├─ merge → ForkManager.mergeBranches()
  │           → 消息按策略合并
  │           → 触发 Observer 重新观察合并后分支
  │
  └─ move → MessageStore.move()
             → 触发 Observer 重新观察两个受影响分支

用户收敛
  │
  └─ ConvergenceEngine.generate(branchIds, format)
       → 读 observations + GlobalMap
       → LLM 生成交付物
       → DeliverableStorage.save()
```

---

## 5. 技术栈

| 层 | 技术 |
|----|------|
| 语言 | TypeScript (strict) |
| 包管理 | pnpm monorepo |
| 前端 | React 19 + Zustand + TailwindCSS |
| 网络图可视化 | D3-force（力导向图） |
| 存储 | IndexedDB（浏览器端持久化） |
| LLM | OpenAI Compatible / Anthropic SDK（通过 LLMAdapter） |
| 测试 | Vitest |
| 构建 | tsup (ESM + CJS + DTS) |

---

## 6. 文件结构

```
new_project/
├── docs/
│   ├── PRD.md
│   ├── architecture.md
│   ├── agent-system-prompts.md
│   └── drift-design-system.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
│
├── packages/
│   ├── drift-storage/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types/
│   │       │   └── storage.ts          # DriftStorage 接口 + 所有数据类型定义
│   │       └── adapters/
│   │           ├── in-memory.ts        # InMemoryAdapter（测试用）
│   │           └── indexeddb.ts        # IndexedDBAdapter（浏览器持久化）
│   │
│   ├── drift-core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types/
│   │       │   └── index.ts            # DriftEvent, LLMAdapter, ForkOptions 等类型
│   │       ├── branch/
│   │       │   └── branch-manager.ts   # BranchManager
│   │       ├── message/
│   │       │   └── message-store.ts    # MessageStore
│   │       ├── fork/
│   │       │   └── fork-manager.ts     # ForkManager (fork/undo/merge)
│   │       ├── event/
│   │       │   └── event-bus.ts        # EventBus
│   │       └── llm/
│   │           ├── llm-router.ts       # LLMRouter
│   │           ├── token-counter.ts    # TokenCounter
│   │           ├── openai-compatible-adapter.ts  # OpenAI Compatible 适配器
│   │           └── anthropic-adapter.ts          # Anthropic 适配器
│   │
│   ├── drift-agents/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types/
│   │       │   └── index.ts            # IntentResult, AgentTask, BehaviorSignals
│   │       ├── observer/
│   │       │   └── observer-agent.ts   # ObserverAgent (BranchContext)
│   │       ├── synthesizer/
│   │       │   └── synthesizer-agent.ts # SynthesizerAgent (ContextKeeper)
│   │       ├── profile/
│   │       │   └── profile-agent.ts    # ProfileAgent
│   │       ├── intent-detector/
│   │       │   └── intent-detector.ts  # IntentDetector（规则引擎，无 LLM）
│   │       ├── convergence/
│   │       │   └── convergence-engine.ts # ConvergenceEngine
│   │       ├── scheduler/
│   │       │   └── agent-scheduler.ts  # AgentScheduler（优先级队列）
│   │       └── __tests__/
│   │           ├── observer-agent.test.ts
│   │           └── intent-detector.test.ts
│   │
│   └── drift-ui/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── src/
│           ├── index.ts
│           ├── main.tsx                # 入口：初始化服务 + 挂载 React
│           ├── App.tsx                 # 根布局：左侧图 + 右侧面板
│           ├── store/
│           │   └── drift-store.ts      # Zustand store + 服务注入
│           ├── hooks/
│           │   ├── use-branch.ts
│           │   ├── use-messages.ts
│           │   └── use-navigation.ts
│           └── components/
│               ├── graph/
│               │   └── NetworkGraph.tsx      # D3-force 力导向网络图
│               ├── panel/
│               │   ├── ConversationPanel.tsx  # 右侧对话面板
│               │   └── ResizeHandle.tsx       # 面板宽度拖拽手柄
│               ├── branch-panel/
│               │   ├── MessageList.tsx
│               │   ├── ChatInput.tsx
│               │   ├── AutoForkNotice.tsx
│               │   ├── InlineInsight.tsx
│               │   └── ReEntryBreadcrumb.tsx
│               ├── convergence/
│               │   └── ConvergencePanel.tsx
│               └── navigation/
│                   ├── SearchPanel.tsx
│                   └── QuickPeek.tsx
```
