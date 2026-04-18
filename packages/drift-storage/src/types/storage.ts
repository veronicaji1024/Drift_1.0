// ──────────────────────────────────────────────
// Drift Storage — 类型定义与存储接口
// ──────────────────────────────────────────────

// ─── 数据类型 ────────────────────────────────

/** 工具调用记录 */
export interface ToolCall {
  id: string
  name: string
  arguments: string
}

/** 消息移动历史条目 */
export interface MoveRecord {
  /** 源分支 ID */
  from: string
  /** 目标分支 ID */
  to: string
  /** 移动时间（ISO 8601） */
  at: string
}

/** 消息（独立于分支，branchId 可变以支持跨分支移动） */
export interface Message {
  id: string
  /** 当前所属分支 ID — 可变，支持跨分支移动 */
  branchId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** 创建时间（ISO 8601） */
  timestamp: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  /** 移动历史 */
  moveHistory?: MoveRecord[]
}

/** 分支状态 */
export type BranchStatus = 'active' | 'idle' | 'archived'

/** 分支 */
export interface Branch {
  id: string
  /** 父分支 ID，null 表示根分支 */
  parentId: string | null
  label: string
  status: BranchStatus
  /** 创建时间（ISO 8601） */
  createdAt: string
  /** 最后更新时间（ISO 8601） */
  updatedAt: string
  /** 最后活跃时间（ISO 8601） */
  lastActiveAt: string
  metadata: Record<string, unknown>
}

/** 分支树节点（UI 渲染用） */
export interface BranchTreeNode {
  id: string
  label: string
  status: BranchStatus
  children: BranchTreeNode[]
  correlations?: Array<{ targetId: string; relationship: string }>
}

/** Fork 记录（undo 栈） */
export interface ForkRecord {
  id: string
  parentBranchId: string
  childBranchId: string
  forkMessageId: string
  /** 创建时间（ISO 8601） */
  timestamp: string
  /** 是否为自动触发的 fork */
  auto: boolean
}

/** Observation — 分支级 T1 观测 */
export interface Observation {
  id: string
  branchId: string
  topics: string[]
  facts: string[]
  decisions: string[]
  openQuestions: string[]
  currentTask: string
  /** 消息索引范围 [start, end] */
  messageRange: [number, number]
  /** 创建时间（ISO 8601） */
  timestamp: string
  tokenCount: number
}

/** 分支摘要（GlobalMap 内部使用） */
export interface BranchSummary {
  branchId: string
  topicSentence: string
  relationToParent: string
  relationToRoot: string
  status: 'exploring' | 'converging' | 'concluded'
}

/** 跨分支洞察 */
export interface CrossBranchInsight {
  branchIds: string[]
  insight: string
}

/** 导航提示 */
export interface NavigationHint {
  fromBranchId: string
  toBranchId: string
  reason: string
  relevance: number
  trigger: 'topic_overlap' | 'open_question_answered' | 'contradiction' | 'dependency'
}

/** GlobalMap — 跨分支全局视图（T2） */
export interface GlobalMap {
  branchSummaries: BranchSummary[]
  crossBranchInsights: CrossBranchInsight[]
  navigationHints: NavigationHint[]
  overallProgress: string
  /** 创建时间（ISO 8601） */
  timestamp: string
}

/** 用户偏好的输出格式 */
export type OutputFormat = 'outline' | 'comparison' | 'decision-matrix' | 'checklist' | 'prose' | 'custom'

/** 用户画像（跨会话） */
export interface UserProfile {
  thinkingStyle: 'divergent-first' | 'linear' | 'jumping'
  topicSwitchFrequency: 'high' | 'medium' | 'low'
  preferredOutputFormat: OutputFormat
  autoForkTolerance: number
  detailLevel: 'concise' | 'detailed'
  intentDetectorSensitivity: number
  observerDebounceSec: number
  forkCooldownTurns: number
  domainExpertise: Record<string, 'expert' | 'intermediate' | 'novice'>
  /** 最后更新时间（ISO 8601） */
  lastUpdated: string
  sessionCount: number
  insights: string[]
}

/** 交付物（T3 收敛输出） */
export interface Deliverable {
  id: string
  branchIds: string[]
  format: OutputFormat
  content: string
  observationsUsed: string[]
  /** 创建时间（ISO 8601） */
  timestamp: string
}

// ─── 存储接口 ────────────────────────────────

/** 消息分页查询选项 */
export interface GetByBranchOptions {
  limit?: number
  offset?: number
}

/**
 * MessageStorage — 消息存储
 * 消息独立于分支，branchId 可变以支持跨分支移动和合并
 */
export interface MessageStorage {
  /** 追加一条消息 */
  append(message: Message): Promise<void>
  /** 按分支查询消息（按 timestamp 排序） */
  getByBranch(branchId: string, options?: GetByBranchOptions): Promise<Message[]>
  /** 按 ID 获取单条消息 */
  getById(id: string): Promise<Message | null>
  /** 修改消息的 branchId（单条移动） */
  updateBranchId(messageId: string, newBranchId: string): Promise<void>
  /** 批量修改消息的 branchId */
  bulkUpdateBranchId(messageIds: string[], newBranchId: string): Promise<void>
  /** 统计分支的 token 数（可选从某条消息之后开始） */
  countTokens(branchId: string, sinceMessageId?: string): Promise<number>
  /** 全文搜索消息 */
  search(query: string): Promise<Array<{ message: Message; score: number }>>
}

/**
 * BranchStorage — 分支存储
 * 维护分支的树状结构
 */
export interface BranchStorage {
  /** 创建分支（id 由存储层生成） */
  create(branch: Omit<Branch, 'id'>): Promise<Branch>
  /** 按 ID 获取分支 */
  get(id: string): Promise<Branch | null>
  /** 获取根分支 */
  getRoot(): Promise<Branch>
  /** 获取某分支的直接子分支 */
  getChildren(parentId: string): Promise<Branch[]>
  /** 获取完整分支树 */
  getTree(): Promise<BranchTreeNode>
  /** 更新分支字段 */
  update(id: string, updates: Partial<Pick<Branch, 'label' | 'status' | 'parentId'>>): Promise<Branch>
  /** 删除分支 */
  delete(id: string): Promise<void>
  /** 列举所有分支（可按状态过滤） */
  listAll(filter?: { status?: BranchStatus }): Promise<Branch[]>
}

/**
 * ObservationStorage — Observation（T1）存储
 * 每个分支可有多条 Observation
 */
export interface ObservationStorage {
  /** 追加一条 Observation */
  append(observation: Observation): Promise<void>
  /** 获取某分支的所有 Observation */
  getByBranch(branchId: string): Promise<Observation[]>
  /** 获取全部 Observation */
  getAll(): Promise<Observation[]>
  /** 删除某分支的所有 Observation */
  deleteByBranch(branchId: string): Promise<void>
  /** 统计 token 数（可选按分支） */
  countTokens(branchId?: string): Promise<number>
}

/**
 * GlobalMapStorage — GlobalMap（T2）存储
 * 保存历史版本，最新一条为当前
 */
export interface GlobalMapStorage {
  /** 保存一份 GlobalMap（追加到历史） */
  put(globalMap: GlobalMap): Promise<void>
  /** 获取最新的 GlobalMap */
  get(): Promise<GlobalMap | null>
  /** 获取历史 GlobalMap 列表（按时间倒序） */
  getHistory(limit?: number): Promise<GlobalMap[]>
}

/**
 * ProfileStorage — 用户画像存储
 * 按 userId 隔离，跨会话持久
 */
export interface ProfileStorage {
  /** 获取用户画像 */
  get(userId: string): Promise<UserProfile | null>
  /** 保存用户画像 */
  put(userId: string, profile: UserProfile): Promise<void>
}

/**
 * ForkRecordStorage — Fork 记录存储（LIFO 栈）
 * 用于 undo fork 操作
 */
export interface ForkRecordStorage {
  /** 压入一条 fork 记录 */
  push(record: ForkRecord): Promise<void>
  /** 弹出最近一条 fork 记录 */
  pop(): Promise<ForkRecord | null>
  /** 列出最近的 fork 记录 */
  list(limit?: number): Promise<ForkRecord[]>
  /** 清空所有 fork 记录 */
  clear(): Promise<void>
}

/**
 * DeliverableStorage — 交付物（T3）存储
 */
export interface DeliverableStorage {
  /** 保存交付物 */
  save(deliverable: Deliverable): Promise<void>
  /** 按 ID 获取交付物 */
  get(id: string): Promise<Deliverable | null>
  /** 列出所有交付物 */
  list(): Promise<Deliverable[]>
}

/**
 * DriftStorage — 聚合存储接口
 * 组合所有子存储，提供事务支持
 */
export interface DriftStorage {
  messages: MessageStorage
  branches: BranchStorage
  observations: ObservationStorage
  globalMap: GlobalMapStorage
  profile: ProfileStorage
  forkRecords: ForkRecordStorage
  deliverables: DeliverableStorage
  /** 在事务中执行操作（内存实现直接执行 fn） */
  transaction<T>(fn: () => Promise<T>): Promise<T>
}
