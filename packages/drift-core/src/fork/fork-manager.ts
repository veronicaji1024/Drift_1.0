/** 浏览器兼容的 UUID 生成 */
const randomUUID = (): string => crypto.randomUUID()
import type { DriftStorage, ForkRecord, Message } from '@drift/storage'
import type { EventBus } from '../event/event-bus.js'
import type { BranchManager } from '../branch/branch-manager.js'
import type { MessageStore } from '../message/message-store.js'
import type { ForkOptions, MergeStrategy } from '../types/index.js'

/**
 * ForkManager
 *
 * Fork / undo / merge 编排器。
 * 协调 BranchManager 和 MessageStore 完成分支分叉、撤销和合并。
 * undo 栈通过 ForkRecordStorage 持久化。
 */
export class ForkManager {
  constructor(
    private readonly storage: DriftStorage,
    private readonly eventBus: EventBus,
    private readonly branchManager: BranchManager,
    private readonly messageStore: MessageStore,
  ) {}

  /**
   * 从父分支的某条消息处分叉出新分支
   *
   * 1. 创建新 Branch
   * 2. 如果 inheritContext：复制父分支消息到 forkMessageId 为止
   * 3. 推入 ForkRecord 到 undo 栈
   * 4. 发射事件
   */
  async fork(
    parentBranchId: string,
    forkMessageId: string,
    options?: ForkOptions,
  ): Promise<ForkRecord> {
    const label = options?.label ?? 'Fork'
    const auto = options?.auto ?? false
    const inheritContext = options?.inheritContext ?? true

    // 创建新分支
    const childBranch = await this.branchManager.create({
      parentId: parentBranchId,
      label,
      auto,
    })

    // 继承上下文：复制父分支消息到 forkMessageId
    if (inheritContext) {
      const parentMessages = await this.messageStore.getByBranch(parentBranchId)
      const messagesToCopy = collectMessagesUpTo(parentMessages, forkMessageId)
      const trimmed = trimIncompleteToolCallGroup(messagesToCopy)

      for (const msg of trimmed) {
        await this.messageStore.append(
          childBranch.id,
          msg.role,
          msg.content,
          {
            toolCalls: msg.toolCalls,
            toolCallId: msg.toolCallId,
          },
        )
      }
    }

    // 创建 ForkRecord
    const forkRecord: ForkRecord = {
      id: randomUUID(),
      parentBranchId,
      childBranchId: childBranch.id,
      forkMessageId,
      timestamp: new Date().toISOString(),
      auto,
    }

    // 推入 undo 栈
    await this.storage.forkRecords.push(forkRecord)

    // 发射事件
    this.eventBus.emit({ type: 'fork:created', forkRecord })

    return forkRecord
  }

  /**
   * 撤销最近一次 fork
   *
   * 1. 弹出 ForkRecord
   * 2. 将子分支消息移回父分支
   * 3. 删除子分支
   * 4. 发射事件
   */
  async undoFork(forkRecordId?: string): Promise<ForkRecord> {
    let forkRecord: ForkRecord | null

    if (forkRecordId) {
      // 查找指定的 ForkRecord
      const records = await this.storage.forkRecords.list()
      forkRecord = records.find((r: ForkRecord) => r.id === forkRecordId) ?? null
      if (!forkRecord) {
        throw new Error(`ForkRecord 不存在: ${forkRecordId}`)
      }
    } else {
      // 弹出最近的 ForkRecord
      forkRecord = await this.storage.forkRecords.pop()
    }

    if (!forkRecord) {
      throw new Error('没有可撤销的 fork 记录')
    }

    // 将子分支消息批量移回父分支
    const childMessages = await this.messageStore.getByBranch(forkRecord.childBranchId)
    if (childMessages.length > 0) {
      const messageIds = childMessages.map((m) => m.id)
      await this.messageStore.bulkMove(messageIds, forkRecord.parentBranchId)
    }

    // 删除子分支
    await this.branchManager.delete(forkRecord.childBranchId)

    // 发射事件
    this.eventBus.emit({ type: 'fork:undone', forkRecord })

    return forkRecord
  }

  /**
   * 合并两个分支
   *
   * 1. 获取两个分支的所有消息
   * 2. 按策略排列（interleave 按时间戳 / append 直接追加）
   * 3. 将 source 消息批量更新到 target
   * 4. 删除 source 分支
   * 5. 发射事件
   */
  async mergeBranches(
    sourceId: string,
    targetId: string,
    strategy: MergeStrategy = 'interleave',
  ): Promise<void> {
    const sourceMessages = await this.messageStore.getByBranch(sourceId)

    if (sourceMessages.length > 0) {
      if (strategy === 'interleave') {
        // 按时间戳排序：获取 target 消息，和 source 消息一起排序
        // 注意：实际排序由存储层在 getByBranch 时保证
        // 这里只需要将 source 消息的 branchId 更新为 target
        // 消息的 timestamp 保持不变，读取时按 timestamp 自然排序
      }
      // append 策略和 interleave 策略在移动消息层面相同：
      // 只是更新 branchId，排序由 timestamp 决定
      const messageIds = sourceMessages.map((m) => m.id)
      await this.messageStore.bulkMove(messageIds, targetId)
    }

    // 删除 source 分支
    await this.branchManager.delete(sourceId)

    // 发射事件
    this.eventBus.emit({
      type: 'branch:merged',
      sourceId,
      targetId,
    })
  }

  /** 获取 fork 历史记录 */
  async listForkRecords(limit?: number): Promise<ForkRecord[]> {
    return this.storage.forkRecords.list(limit)
  }
}

// ─── 内部工具函数 ────────────────────────────────────────────

/** 收集从头到指定消息 ID（含）的所有消息 */
function collectMessagesUpTo(messages: Message[], upToMessageId: string): Message[] {
  const result: Message[] = []
  for (const msg of messages) {
    result.push(msg)
    if (msg.id === upToMessageId) break
  }
  return result
}

/**
 * 裁掉尾部不完整的 tool call 组（assistant 有 toolCalls 但缺少对应 tool 结果）
 *
 * 复用 Stello 的 trimIncompleteToolCallGroup 逻辑，适配 Drift 的 Message 类型。
 */
function trimIncompleteToolCallGroup(messages: Message[]): Message[] {
  if (messages.length === 0) return messages

  let end = messages.length
  while (end > 0) {
    const last = messages[end - 1]!
    // assistant 有 toolCalls 但后面没有 tool 消息 → 裁掉
    if (last.role === 'assistant' && last.toolCalls && last.toolCalls.length > 0) {
      end--
      continue
    }
    // tool 消息，向前找对应的 assistant
    if (last.toolCallId) {
      let assistantIdx = end - 2
      while (assistantIdx >= 0 && messages[assistantIdx]!.toolCallId) {
        assistantIdx--
      }
      if (assistantIdx >= 0) {
        const assistant = messages[assistantIdx]!
        if (assistant.role === 'assistant' && assistant.toolCalls && assistant.toolCalls.length > 0) {
          const expectedIds = new Set(assistant.toolCalls.map((tc) => tc.id))
          for (let j = assistantIdx + 1; j < end; j++) {
            const rec = messages[j]!
            if (rec.toolCallId) {
              expectedIds.delete(rec.toolCallId)
            }
          }
          if (expectedIds.size > 0) {
            // 不完整 → 裁掉整个组
            end = assistantIdx
            continue
          }
        }
      }
    }
    break
  }
  return end === messages.length ? messages : messages.slice(0, end)
}
