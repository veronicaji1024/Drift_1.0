/**
 * IndexedDB 持久化存储适配器
 *
 * 使用浏览器原生 IndexedDB API，数据在刷新页面后保留。
 * 7 个 object store 对应 DriftStorage 的 7 个子存储接口。
 */
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

/** 数据库名称 */
const DB_NAME = 'drift-storage'
/** 数据库版本 */
const DB_VERSION = 1

/** object store 名称常量 */
const STORES = {
  messages: 'messages',
  branches: 'branches',
  observations: 'observations',
  globalMap: 'globalMap',
  profiles: 'profiles',
  forkRecords: 'forkRecords',
  deliverables: 'deliverables',
} as const

// ─── 工具函数 ───

/** 浏览器兼容的 UUID 生成 */
const randomUUID = (): string => crypto.randomUUID()

/** 打开（或创建）IndexedDB 数据库 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      // messages: 按 id 索引，按 branchId 查询
      if (!db.objectStoreNames.contains(STORES.messages)) {
        const store = db.createObjectStore(STORES.messages, { keyPath: 'id' })
        store.createIndex('branchId', 'branchId', { unique: false })
      }

      // branches: 按 id 索引，按 parentId 查询
      if (!db.objectStoreNames.contains(STORES.branches)) {
        const store = db.createObjectStore(STORES.branches, { keyPath: 'id' })
        store.createIndex('parentId', 'parentId', { unique: false })
      }

      // observations: 按 id 索引，按 branchId 查询
      if (!db.objectStoreNames.contains(STORES.observations)) {
        const store = db.createObjectStore(STORES.observations, { keyPath: 'id' })
        store.createIndex('branchId', 'branchId', { unique: false })
      }

      // globalMap: 自增 key（历史记录）
      if (!db.objectStoreNames.contains(STORES.globalMap)) {
        db.createObjectStore(STORES.globalMap, { autoIncrement: true })
      }

      // profiles: 按 userId 索引
      if (!db.objectStoreNames.contains(STORES.profiles)) {
        db.createObjectStore(STORES.profiles, { keyPath: 'userId' })
      }

      // forkRecords: 自增 key（栈顺序）
      if (!db.objectStoreNames.contains(STORES.forkRecords)) {
        db.createObjectStore(STORES.forkRecords, { autoIncrement: true })
      }

      // deliverables: 按 id 索引
      if (!db.objectStoreNames.contains(STORES.deliverables)) {
        db.createObjectStore(STORES.deliverables, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** 执行一次读写事务 */
async function withStore<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const request = fn(store)

    if (request) {
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () => reject(request.error)
    } else {
      tx.oncomplete = () => resolve(undefined as T)
      tx.onerror = () => reject(tx.error)
    }
  })
}

/** 获取 store 中的所有值 */
async function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return withStore<T[]>(db, storeName, 'readonly', (store) => store.getAll())
}

/** 通过索引查询 */
async function getByIndex<T>(db: IDBDatabase, storeName: string, indexName: string, value: IDBValidKey): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const index = store.index(indexName)
    const request = index.getAll(value)
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

// ─── IndexedDB 子存储实现 ───

/** IndexedDB 消息存储 */
class IDBMessageStorage implements MessageStorage {
  constructor(private db: IDBDatabase) {}

  async append(message: Message): Promise<void> {
    await withStore(this.db, STORES.messages, 'readwrite', (store) => store.put(message))
  }

  async getByBranch(branchId: string, options?: GetByBranchOptions): Promise<Message[]> {
    let result = await getByIndex<Message>(this.db, STORES.messages, 'branchId', branchId)
    result.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    const offset = options?.offset ?? 0
    result = result.slice(offset)
    if (options?.limit !== undefined) {
      result = result.slice(0, options.limit)
    }
    return result
  }

  async getById(id: string): Promise<Message | null> {
    const result = await withStore<Message | undefined>(this.db, STORES.messages, 'readonly', (store) => store.get(id))
    return result ?? null
  }

  async updateBranchId(messageId: string, newBranchId: string): Promise<void> {
    const msg = await this.getById(messageId)
    if (!msg) return
    const moveHistory = msg.moveHistory ?? []
    moveHistory.push({ from: msg.branchId, to: newBranchId, at: new Date().toISOString() })
    msg.branchId = newBranchId
    msg.moveHistory = moveHistory
    await withStore(this.db, STORES.messages, 'readwrite', (store) => store.put(msg))
  }

  async bulkUpdateBranchId(messageIds: string[], newBranchId: string): Promise<void> {
    for (const id of messageIds) {
      await this.updateBranchId(id, newBranchId)
    }
  }

  async countTokens(branchId: string, sinceMessageId?: string): Promise<number> {
    let messages = await this.getByBranch(branchId)
    if (sinceMessageId) {
      const idx = messages.findIndex((m) => m.id === sinceMessageId)
      if (idx >= 0) messages = messages.slice(idx + 1)
    }
    return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0)
  }

  async search(query: string): Promise<Array<{ message: Message; score: number }>> {
    const all = await getAllFromStore<Message>(this.db, STORES.messages)
    const lowerQuery = query.toLowerCase()
    const results: Array<{ message: Message; score: number }> = []

    for (const msg of all) {
      const lowerContent = msg.content.toLowerCase()
      if (lowerContent.includes(lowerQuery)) {
        let score = 0
        let pos = 0
        while ((pos = lowerContent.indexOf(lowerQuery, pos)) !== -1) {
          score++
          pos += lowerQuery.length
        }
        results.push({ message: msg, score })
      }
    }
    return results.sort((a, b) => b.score - a.score)
  }
}

/** IndexedDB 分支存储 */
class IDBBranchStorage implements BranchStorage {
  constructor(private db: IDBDatabase) {}

  async create(branch: Omit<Branch, 'id'>): Promise<Branch> {
    const id = randomUUID()
    const full: Branch = { ...branch, id }
    await withStore(this.db, STORES.branches, 'readwrite', (store) => store.put(full))
    return full
  }

  async get(id: string): Promise<Branch | null> {
    const result = await withStore<Branch | undefined>(this.db, STORES.branches, 'readonly', (store) => store.get(id))
    return result ?? null
  }

  async getRoot(): Promise<Branch> {
    const all = await getAllFromStore<Branch>(this.db, STORES.branches)
    const root = all.find((b) => b.parentId === null)
    if (!root) throw new Error('No root branch found')
    return root
  }

  async getChildren(parentId: string): Promise<Branch[]> {
    return getByIndex<Branch>(this.db, STORES.branches, 'parentId', parentId)
  }

  async getTree(): Promise<BranchTreeNode> {
    const root = await this.getRoot()
    const all = await getAllFromStore<Branch>(this.db, STORES.branches)
    return this.buildTreeNode(root, all)
  }

  private buildTreeNode(branch: Branch, allBranches: Branch[]): BranchTreeNode {
    const children = allBranches.filter((b) => b.parentId === branch.id)
    return {
      id: branch.id,
      label: branch.label,
      status: branch.status,
      children: children.map((c) => this.buildTreeNode(c, allBranches)),
    }
  }

  async update(id: string, updates: Partial<Pick<Branch, 'label' | 'status' | 'parentId'>>): Promise<Branch> {
    const branch = await this.get(id)
    if (!branch) throw new Error(`Branch not found: ${id}`)
    const updated = { ...branch, ...updates, updatedAt: new Date().toISOString() }
    await withStore(this.db, STORES.branches, 'readwrite', (store) => store.put(updated))
    return updated
  }

  async delete(id: string): Promise<void> {
    await withStore(this.db, STORES.branches, 'readwrite', (store) => store.delete(id))
  }

  async listAll(filter?: { status?: BranchStatus }): Promise<Branch[]> {
    let all = await getAllFromStore<Branch>(this.db, STORES.branches)
    if (filter?.status) {
      all = all.filter((b) => b.status === filter.status)
    }
    return all
  }
}

/** IndexedDB Observation 存储 */
class IDBObservationStorage implements ObservationStorage {
  constructor(private db: IDBDatabase) {}

  async append(observation: Observation): Promise<void> {
    await withStore(this.db, STORES.observations, 'readwrite', (store) => store.put(observation))
  }

  async getByBranch(branchId: string): Promise<Observation[]> {
    return getByIndex<Observation>(this.db, STORES.observations, 'branchId', branchId)
  }

  async getAll(): Promise<Observation[]> {
    return getAllFromStore<Observation>(this.db, STORES.observations)
  }

  async deleteByBranch(branchId: string): Promise<void> {
    const obs = await this.getByBranch(branchId)
    for (const o of obs) {
      await withStore(this.db, STORES.observations, 'readwrite', (store) => store.delete(o.id))
    }
  }

  async countTokens(branchId?: string): Promise<number> {
    let list = await this.getAll()
    if (branchId) list = list.filter((o) => o.branchId === branchId)
    return list.reduce((sum, o) => sum + o.tokenCount, 0)
  }
}

/** IndexedDB GlobalMap 存储 */
class IDBGlobalMapStorage implements GlobalMapStorage {
  constructor(private db: IDBDatabase) {}

  async put(globalMap: GlobalMap): Promise<void> {
    await withStore(this.db, STORES.globalMap, 'readwrite', (store) => store.add(globalMap))
  }

  async get(): Promise<GlobalMap | null> {
    const all = await getAllFromStore<GlobalMap>(this.db, STORES.globalMap)
    return all.length > 0 ? all[all.length - 1]! : null
  }

  async getHistory(limit?: number): Promise<GlobalMap[]> {
    const all = await getAllFromStore<GlobalMap>(this.db, STORES.globalMap)
    const reversed = all.reverse()
    return limit !== undefined ? reversed.slice(0, limit) : reversed
  }
}

/** IndexedDB Profile 存储 */
class IDBProfileStorage implements ProfileStorage {
  constructor(private db: IDBDatabase) {}

  async get(userId: string): Promise<UserProfile | null> {
    const result = await withStore<{ userId: string } & UserProfile | undefined>(
      this.db, STORES.profiles, 'readonly', (store) => store.get(userId),
    )
    if (!result) return null
    const { userId: _id, ...profile } = result
    return profile
  }

  async put(userId: string, profile: UserProfile): Promise<void> {
    await withStore(this.db, STORES.profiles, 'readwrite', (store) =>
      store.put({ userId, ...profile }),
    )
  }
}

/** IndexedDB ForkRecord 存储（LIFO 栈） */
class IDBForkRecordStorage implements ForkRecordStorage {
  constructor(private db: IDBDatabase) {}

  async push(record: ForkRecord): Promise<void> {
    await withStore(this.db, STORES.forkRecords, 'readwrite', (store) => store.add(record))
  }

  async pop(): Promise<ForkRecord | null> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.forkRecords, 'readwrite')
      const store = tx.objectStore(STORES.forkRecords)
      const cursorReq = store.openCursor(null, 'prev')

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (cursor) {
          const record = cursor.value as ForkRecord
          cursor.delete()
          resolve(record)
        } else {
          resolve(null)
        }
      }
      cursorReq.onerror = () => reject(cursorReq.error)
    })
  }

  async list(limit?: number): Promise<ForkRecord[]> {
    const all = await getAllFromStore<ForkRecord>(this.db, STORES.forkRecords)
    const reversed = all.reverse()
    return limit !== undefined ? reversed.slice(0, limit) : reversed
  }

  async clear(): Promise<void> {
    await withStore(this.db, STORES.forkRecords, 'readwrite', (store) => store.clear())
  }
}

/** IndexedDB 交付物存储 */
class IDBDeliverableStorage implements DeliverableStorage {
  constructor(private db: IDBDatabase) {}

  async save(deliverable: Deliverable): Promise<void> {
    await withStore(this.db, STORES.deliverables, 'readwrite', (store) => store.put(deliverable))
  }

  async get(id: string): Promise<Deliverable | null> {
    const result = await withStore<Deliverable | undefined>(
      this.db, STORES.deliverables, 'readonly', (store) => store.get(id),
    )
    return result ?? null
  }

  async list(): Promise<Deliverable[]> {
    return getAllFromStore<Deliverable>(this.db, STORES.deliverables)
  }
}

// ─── IndexedDBAdapter ───

/**
 * IndexedDBAdapter — 浏览器端 IndexedDB 持久化存储
 *
 * 数据在页面刷新后保留。使用 `IndexedDBAdapter.create()` 异步创建实例。
 */
export class IndexedDBAdapter implements DriftStorage {
  readonly messages: MessageStorage
  readonly branches: BranchStorage
  readonly observations: ObservationStorage
  readonly globalMap: GlobalMapStorage
  readonly profile: ProfileStorage
  readonly forkRecords: ForkRecordStorage
  readonly deliverables: DeliverableStorage

  private db: IDBDatabase

  private constructor(db: IDBDatabase) {
    this.db = db
    this.messages = new IDBMessageStorage(db)
    this.branches = new IDBBranchStorage(db)
    this.observations = new IDBObservationStorage(db)
    this.globalMap = new IDBGlobalMapStorage(db)
    this.profile = new IDBProfileStorage(db)
    this.forkRecords = new IDBForkRecordStorage(db)
    this.deliverables = new IDBDeliverableStorage(db)
  }

  /** 异步创建 IndexedDBAdapter 实例（打开数据库） */
  static async create(): Promise<IndexedDBAdapter> {
    const db = await openDB()
    return new IndexedDBAdapter(db)
  }

  /** IndexedDB 事务（简单包装，不支持嵌套） */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn()
  }

  /** 清空所有数据（用于重置） */
  async clear(): Promise<void> {
    const storeNames = Object.values(STORES)
    const tx = this.db.transaction(storeNames, 'readwrite')
    for (const name of storeNames) {
      tx.objectStore(name).clear()
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}
