import type { DriftStorage, Branch, BranchTreeNode } from '@drift/storage'
import type { EventBus } from '../event/event-bus.js'

/** 创建分支的选项 */
export interface CreateBranchOptions {
  parentId?: string
  label: string
  auto?: boolean
}

/**
 * BranchManager
 *
 * 分支的 CRUD 和树结构操作。
 * 通过 EventBus 发射分支相关事件，不直接与上层耦合。
 */
export class BranchManager {
  /** 当前活跃分支 ID */
  private activeBranchId: string | null = null

  constructor(
    private readonly storage: DriftStorage,
    private readonly eventBus: EventBus,
  ) {}

  /** 创建新分支并发射事件 */
  async create(options: CreateBranchOptions): Promise<Branch> {
    const now = new Date().toISOString()
    const branch = await this.storage.branches.create({
      parentId: options.parentId ?? null,
      label: options.label,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
      metadata: {},
    })

    this.eventBus.emit({
      type: 'branch:created',
      branch,
      auto: options.auto ?? false,
    })

    return branch
  }

  /** 根据 ID 获取分支 */
  async get(id: string): Promise<Branch | null> {
    return this.storage.branches.get(id)
  }

  /** 获取根分支 */
  async getRoot(): Promise<Branch> {
    return this.storage.branches.getRoot()
  }

  /** 获取完整的分支树 */
  async getTree(): Promise<BranchTreeNode> {
    return this.storage.branches.getTree()
  }

  /** 获取指定父分支的子分支列表 */
  async getChildren(parentId: string): Promise<Branch[]> {
    return this.storage.branches.getChildren(parentId)
  }

  /** 归档分支 */
  async archive(id: string): Promise<Branch> {
    const branch = await this.storage.branches.update(id, { status: 'archived' })

    this.eventBus.emit({
      type: 'branch:archived',
      branchId: id,
    })

    return branch
  }

  /** 重命名分支 */
  async rename(id: string, label: string): Promise<Branch> {
    return this.storage.branches.update(id, { label })
  }

  /** 切换活跃分支，发射 branch:switched 事件 */
  async switchTo(id: string): Promise<void> {
    const branch = await this.storage.branches.get(id)
    if (!branch) {
      throw new Error(`分支不存在: ${id}`)
    }

    const previousId = this.activeBranchId
    this.activeBranchId = id

    // 旧分支设为 idle
    if (previousId && previousId !== id) {
      await this.storage.branches.update(previousId, { status: 'idle' })
    }

    // 新分支设为 active
    await this.storage.branches.update(id, { status: 'active' })

    if (previousId && previousId !== id) {
      this.eventBus.emit({
        type: 'branch:switched',
        from: previousId,
        to: id,
      })
    }
  }

  /** 获取当前活跃分支 ID */
  getActiveBranchId(): string | null {
    return this.activeBranchId
  }

  /** 删除分支（内部方法，由 ForkManager 调用） */
  async delete(id: string): Promise<void> {
    await this.storage.branches.delete(id)
  }
}
