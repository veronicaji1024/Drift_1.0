/** 浏览器兼容的 UUID 生成 */
const randomUUID = (): string => crypto.randomUUID()
import type {
  DriftStorage,
  MessageStorage,
  BranchStorage,
  ObservationStorage,
  GlobalMapStorage,
  ProfileStorage,
  ForkRecordStorage,
  DeliverableStorage,
  Message,
  Branch,
  BranchStatus,
  BranchTreeNode,
  Observation,
  GlobalMap,
  UserProfile,
  ForkRecord,
  Deliverable,
  GetByBranchOptions,
} from '../types/storage.js'

// ─── InMemoryMessageStorage ──────────────────

/** 内存消息存储实现 */
class InMemoryMessageStorage implements MessageStorage {
  private messages = new Map<string, Message>()

  /** 追加一条消息 */
  async append(message: Message): Promise<void> {
    this.messages.set(message.id, { ...message })
  }

  /** 按分支查询消息，按 timestamp 排序 */
  async getByBranch(branchId: string, options?: GetByBranchOptions): Promise<Message[]> {
    let result = Array.from(this.messages.values())
      .filter((m) => m.branchId === branchId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    const offset = options?.offset ?? 0
    result = result.slice(offset)
    if (options?.limit !== undefined) {
      result = result.slice(0, options.limit)
    }

    return result.map((m) => ({ ...m }))
  }

  /** 按 ID 获取单条消息 */
  async getById(id: string): Promise<Message | null> {
    const msg = this.messages.get(id)
    return msg ? { ...msg } : null
  }

  /** 修改单条消息的 branchId，记录移动历史 */
  async updateBranchId(messageId: string, newBranchId: string): Promise<void> {
    const msg = this.messages.get(messageId)
    if (!msg) return
    const moveHistory = msg.moveHistory ?? []
    moveHistory.push({ from: msg.branchId, to: newBranchId, at: new Date().toISOString() })
    msg.branchId = newBranchId
    msg.moveHistory = moveHistory
  }

  /** 批量修改消息的 branchId */
  async bulkUpdateBranchId(messageIds: string[], newBranchId: string): Promise<void> {
    for (const id of messageIds) {
      await this.updateBranchId(id, newBranchId)
    }
  }

  /** 估算分支的 token 数（简单按字符数 / 4 估算） */
  async countTokens(branchId: string, sinceMessageId?: string): Promise<number> {
    let messages = Array.from(this.messages.values())
      .filter((m) => m.branchId === branchId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    if (sinceMessageId) {
      const idx = messages.findIndex((m) => m.id === sinceMessageId)
      if (idx >= 0) {
        messages = messages.slice(idx + 1)
      }
    }

    return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0)
  }

  /** 简单全文搜索（子串匹配，score 为匹配次数） */
  async search(query: string): Promise<Array<{ message: Message; score: number }>> {
    const lowerQuery = query.toLowerCase()
    const results: Array<{ message: Message; score: number }> = []

    for (const msg of this.messages.values()) {
      const lowerContent = msg.content.toLowerCase()
      if (lowerContent.includes(lowerQuery)) {
        // 简单计算匹配出现次数作为 score
        let score = 0
        let pos = 0
        while ((pos = lowerContent.indexOf(lowerQuery, pos)) !== -1) {
          score++
          pos += lowerQuery.length
        }
        results.push({ message: { ...msg }, score })
      }
    }

    return results.sort((a, b) => b.score - a.score)
  }
}

// ─── InMemoryBranchStorage ───────────────────

/** 内存分支存储实现 */
class InMemoryBranchStorage implements BranchStorage {
  private branches = new Map<string, Branch>()

  /** 创建分支，自动生成 id */
  async create(branch: Omit<Branch, 'id'>): Promise<Branch> {
    const id = randomUUID()
    const full: Branch = { ...branch, id }
    this.branches.set(id, full)
    return { ...full }
  }

  /** 按 ID 获取分支 */
  async get(id: string): Promise<Branch | null> {
    const b = this.branches.get(id)
    return b ? { ...b } : null
  }

  /** 获取根分支（parentId === null） */
  async getRoot(): Promise<Branch> {
    for (const b of this.branches.values()) {
      if (b.parentId === null) return { ...b }
    }
    throw new Error('No root branch found')
  }

  /** 获取某分支的直接子分支 */
  async getChildren(parentId: string): Promise<Branch[]> {
    return Array.from(this.branches.values())
      .filter((b) => b.parentId === parentId)
      .map((b) => ({ ...b }))
  }

  /** 递归构建分支树 */
  async getTree(): Promise<BranchTreeNode> {
    const root = await this.getRoot()
    return this.buildTreeNode(root)
  }

  /** 递归构建子树节点 */
  private buildTreeNode(branch: Branch): BranchTreeNode {
    const children = Array.from(this.branches.values()).filter((b) => b.parentId === branch.id)
    return {
      id: branch.id,
      label: branch.label,
      status: branch.status,
      children: children.map((c) => this.buildTreeNode(c)),
    }
  }

  /** 更新分支字段 */
  async update(id: string, updates: Partial<Pick<Branch, 'label' | 'status' | 'parentId'>>): Promise<Branch> {
    const branch = this.branches.get(id)
    if (!branch) throw new Error(`Branch not found: ${id}`)
    const updated = { ...branch, ...updates, updatedAt: new Date().toISOString() }
    this.branches.set(id, updated)
    return { ...updated }
  }

  /** 删除分支 */
  async delete(id: string): Promise<void> {
    this.branches.delete(id)
  }

  /** 列举所有分支，可按状态过滤 */
  async listAll(filter?: { status?: BranchStatus }): Promise<Branch[]> {
    let all = Array.from(this.branches.values())
    if (filter?.status) {
      all = all.filter((b) => b.status === filter.status)
    }
    return all.map((b) => ({ ...b }))
  }
}

// ─── InMemoryObservationStorage ──────────────

/** 内存 Observation 存储实现 */
class InMemoryObservationStorage implements ObservationStorage {
  private observations: Observation[] = []

  /** 追加一条 Observation */
  async append(observation: Observation): Promise<void> {
    this.observations.push({ ...observation })
  }

  /** 获取某分支的所有 Observation */
  async getByBranch(branchId: string): Promise<Observation[]> {
    return this.observations
      .filter((o) => o.branchId === branchId)
      .map((o) => ({ ...o }))
  }

  /** 获取全部 Observation */
  async getAll(): Promise<Observation[]> {
    return this.observations.map((o) => ({ ...o }))
  }

  /** 删除某分支的所有 Observation */
  async deleteByBranch(branchId: string): Promise<void> {
    this.observations = this.observations.filter((o) => o.branchId !== branchId)
  }

  /** 统计 token 数 */
  async countTokens(branchId?: string): Promise<number> {
    let list = this.observations
    if (branchId) {
      list = list.filter((o) => o.branchId === branchId)
    }
    return list.reduce((sum, o) => sum + o.tokenCount, 0)
  }
}

// ─── InMemoryGlobalMapStorage ────────────────

/** 内存 GlobalMap 存储实现 */
class InMemoryGlobalMapStorage implements GlobalMapStorage {
  private history: GlobalMap[] = []

  /** 保存一份 GlobalMap（追加到历史） */
  async put(globalMap: GlobalMap): Promise<void> {
    this.history.push({ ...globalMap })
  }

  /** 获取最新的 GlobalMap */
  async get(): Promise<GlobalMap | null> {
    if (this.history.length === 0) return null
    const latest = this.history[this.history.length - 1]
    return latest ? { ...latest } : null
  }

  /** 获取历史记录（按时间倒序） */
  async getHistory(limit?: number): Promise<GlobalMap[]> {
    const reversed = [...this.history].reverse()
    const sliced = limit !== undefined ? reversed.slice(0, limit) : reversed
    return sliced.map((g) => ({ ...g }))
  }
}

// ─── InMemoryProfileStorage ──────────────────

/** 内存用户画像存储实现 */
class InMemoryProfileStorage implements ProfileStorage {
  private profiles = new Map<string, UserProfile>()

  /** 获取用户画像 */
  async get(userId: string): Promise<UserProfile | null> {
    const p = this.profiles.get(userId)
    return p ? { ...p } : null
  }

  /** 保存用户画像 */
  async put(userId: string, profile: UserProfile): Promise<void> {
    this.profiles.set(userId, { ...profile })
  }
}

// ─── InMemoryForkRecordStorage ───────────────

/** 内存 ForkRecord 存储实现（LIFO 栈） */
class InMemoryForkRecordStorage implements ForkRecordStorage {
  private stack: ForkRecord[] = []

  /** 压入一条记录 */
  async push(record: ForkRecord): Promise<void> {
    this.stack.push({ ...record })
  }

  /** 弹出最近一条记录 */
  async pop(): Promise<ForkRecord | null> {
    const record = this.stack.pop()
    return record ? { ...record } : null
  }

  /** 按 ID 移除一条记录 */
  async removeById(id: string): Promise<boolean> {
    const idx = this.stack.findIndex((r) => r.id === id)
    if (idx === -1) return false
    this.stack.splice(idx, 1)
    return true
  }

  /** 列出最近的记录（按栈顶到栈底顺序） */
  async list(limit?: number): Promise<ForkRecord[]> {
    const reversed = [...this.stack].reverse()
    const sliced = limit !== undefined ? reversed.slice(0, limit) : reversed
    return sliced.map((r) => ({ ...r }))
  }

  /** 清空所有记录 */
  async clear(): Promise<void> {
    this.stack = []
  }
}

// ─── InMemoryDeliverableStorage ──────────────

/** 内存交付物存储实现 */
class InMemoryDeliverableStorage implements DeliverableStorage {
  private deliverables = new Map<string, Deliverable>()

  /** 保存交付物 */
  async save(deliverable: Deliverable): Promise<void> {
    this.deliverables.set(deliverable.id, { ...deliverable })
  }

  /** 按 ID 获取交付物 */
  async get(id: string): Promise<Deliverable | null> {
    const d = this.deliverables.get(id)
    return d ? { ...d } : null
  }

  /** 列出所有交付物 */
  async list(): Promise<Deliverable[]> {
    return Array.from(this.deliverables.values()).map((d) => ({ ...d }))
  }
}

// ─── InMemoryAdapter ─────────────────────────

/**
 * InMemoryAdapter — 完整的内存存储实现
 * 组合所有子存储，用于测试和开发环境
 */
export class InMemoryAdapter implements DriftStorage {
  readonly messages: MessageStorage
  readonly branches: BranchStorage
  readonly observations: ObservationStorage
  readonly globalMap: GlobalMapStorage
  readonly profile: ProfileStorage
  readonly forkRecords: ForkRecordStorage
  readonly deliverables: DeliverableStorage

  constructor() {
    this.messages = new InMemoryMessageStorage()
    this.branches = new InMemoryBranchStorage()
    this.observations = new InMemoryObservationStorage()
    this.globalMap = new InMemoryGlobalMapStorage()
    this.profile = new InMemoryProfileStorage()
    this.forkRecords = new InMemoryForkRecordStorage()
    this.deliverables = new InMemoryDeliverableStorage()
  }

  /** 内存实现直接执行 fn（无真正事务） */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn()
  }
}
