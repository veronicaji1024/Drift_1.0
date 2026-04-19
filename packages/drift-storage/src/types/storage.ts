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

// ─── BranchContext 输出 ────────────────────────

/** 分支进展阶段 */
export type BranchStage = 'exploring' | 'deepening' | 'concluding' | 'exhausted'

/** Observation — 分支上下文摘要（对应 BranchContext agent 输出） */
export interface Observation {
  id: string
  branchId: string
  /** 一句话概括分支在讨论什么 */
  topic: string
  /** 进展阶段 */
  stage: BranchStage
  /** 已确认的关键结论（最多 5 条），被推翻的标注 [已推翻] 前缀 */
  keyPoints: string[]
  /** 待解问题（最多 3 条） */
  openQuestions: string[]
  /** 走向信号 — 基于最近对话判断分支演进方向 */
  directionSignal: string
  /** 消息索引范围 [start, end] */
  messageRange: [number, number]
  /** 创建时间（ISO 8601） */
  timestamp: string
  tokenCount: number
}

// ─── ContextKeeper 输出 ────────────────────────

/** 分支摘要（GlobalMap 内部使用） */
export interface BranchSummary {
  branchId: string
  /** 一句话概括该分支主题 */
  topicSentence: string
  /** 分支进展阶段 */
  stage: BranchStage
  /** 该分支在整体对话中扮演的角色（一句话定位） */
  role: string
}

/** 分支间关系类型 */
export type BranchRelationType =
  | 'complementary'   // 互补：从不同角度探讨同一问题
  | 'competing'       // 竞争：探讨了互斥的方案
  | 'progressive'     // 递进：一个是另一个的深入或延展
  | 'derived'         // 派生：基于另一个的结论去探索新问题
  | 'contradictory'   // 矛盾：各自得出了不兼容的结论
  | 'supporting'      // 支撑：一个的结论为另一个提供论据
  | 'independent'     // 独立：讨论不同话题，无明显关联

/** 分支间关系 */
export interface BranchRelation {
  branchIdA: string
  branchIdB: string
  types: BranchRelationType[]
}

/** 跨主题关联 — 不同分支/议题间未被显式讨论但逻辑上相关的联系 */
export interface CrossThemeConnection {
  branchIds: string[]
  /** 关联的性质 */
  nature: string
  /** 为什么值得关注 */
  significance: string
}

/** 导航建议动作类型 */
export type NavigationAction = 'deep_dive' | 'new_direction' | 'jump' | 'converge'

/** 导航建议 */
export interface NavigationSuggestion {
  action: NavigationAction
  /** 目标描述（deep_dive 的话题 / new_direction 的方向 / jump 的分支 / converge 的文档类型） */
  target: string
  /** 面向用户的理由 */
  reasoning: string
}

/** 收敛就绪度 */
export type ConvergenceReadiness = 'not_ready' | 'partially_ready' | 'ready'

/** GlobalMap — 全局对话地图（对应 ContextKeeper agent 输出） */
export interface GlobalMap {
  /** 整体主题（按主次区分） */
  overallTheme: {
    mainTopics: string[]
    sideTopics: string[]
  }
  /** 分支全景 */
  branchLandscape: {
    summaries: BranchSummary[]
    relations: BranchRelation[]
  }
  /** 跨主题关联 */
  crossThemeConnections: CrossThemeConnection[]
  /** 探索覆盖度 */
  explorationCoverage: {
    wellExplored: string[]
    justStarted: string[]
    blindSpots: string[]
  }
  /** 收敛就绪度 */
  convergenceReadiness: {
    status: ConvergenceReadiness
    reason: string
  }
  /** 导航建议（1-3 条） */
  navigationSuggestions: NavigationSuggestion[]
  /** 创建时间（ISO 8601） */
  timestamp: string
}

// ─── ProfileAgent 输出 ────────────────────────

/** 思维风格 */
export type ThinkingStyle = 'divergent' | 'convergent' | 'balanced'
/** 深度偏好 */
export type DepthPreference = 'surface' | 'moderate' | 'deep'
/** 交互模式 */
export type InteractionPattern = 'questioner' | 'challenger' | 'collaborator' | 'director'
/** 回复偏好 */
export type ResponsePreference = 'concise' | 'detailed' | 'structured' | 'conversational'
/** 画像置信度 */
export type ProfileConfidence = 'provisional' | 'developing' | 'stable'

/** 用户画像（对应 ProfileAgent agent 输出） */
export interface UserProfile {
  thinkingStyle: { type: ThinkingStyle; description: string }
  depthPreference: { type: DepthPreference; description: string }
  interactionPattern: { type: InteractionPattern; description: string }
  focusAreas: Array<{ topic: string; level: 'high' | 'medium' | 'low' }>
  responsePreference: ResponsePreference
  confidenceLevel: ProfileConfidence
  /** 最后更新时间（ISO 8601） */
  lastUpdated: string
}

// ─── ConvergenceEngine 输出 ────────────────────

/** 输出格式（对应 ConvergenceEngine 的 6 种格式） */
export type OutputFormat =
  | 'outline'             // 层级大纲
  | 'structured-summary'  // 结构化摘要（默认）
  | 'comparison'          // 对比表格
  | 'decision-matrix'     // 决策矩阵
  | 'full-report'         // 完整报告
  | 'custom'              // 自定义

/** 交付物（收敛输出） */
export interface Deliverable {
  id: string
  branchIds: string[]
  format: OutputFormat
  /** 生成的完整内容（含 title / overview / body / gaps / sources） */
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
 * ObservationStorage — Observation 存储
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
 * GlobalMapStorage — GlobalMap 存储
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
 * DeliverableStorage — 交付物存储
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
