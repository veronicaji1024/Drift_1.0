/** 浏览器兼容的 UUID 生成 */
const randomUUID = (): string => crypto.randomUUID()
import type { DriftStorage, Message } from '@drift/storage'
import type { EventBus } from '../event/event-bus.js'

/**
 * MessageStore
 *
 * 消息的 CRUD 操作。消息与分支解耦——branchId 是可变的，支持跨分支移动。
 */
export class MessageStore {
  constructor(
    private readonly storage: DriftStorage,
    private readonly eventBus: EventBus,
  ) {}

  /** 追加一条消息到指定分支 */
  async append(
    branchId: string,
    role: Message['role'],
    content: string,
    extra?: { toolCalls?: Message['toolCalls']; toolCallId?: string },
  ): Promise<Message> {
    const message: Message = {
      id: randomUUID(),
      branchId,
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(extra?.toolCalls ? { toolCalls: extra.toolCalls } : {}),
      ...(extra?.toolCallId ? { toolCallId: extra.toolCallId } : {}),
    }

    await this.storage.messages.append(message)

    this.eventBus.emit({
      type: 'message:appended',
      branchId,
      messageId: message.id,
    })

    return message
  }

  /** 获取指定分支的所有消息 */
  async getByBranch(branchId: string): Promise<Message[]> {
    return this.storage.messages.getByBranch(branchId)
  }

  /** 根据 ID 获取单条消息 */
  async getById(id: string): Promise<Message | null> {
    return this.storage.messages.getById(id)
  }

  /** 将消息移动到另一个分支，记录移动历史 */
  async move(messageId: string, targetBranchId: string): Promise<void> {
    const message = await this.storage.messages.getById(messageId)
    if (!message) {
      throw new Error(`消息不存在: ${messageId}`)
    }

    const fromBranchId = message.branchId
    if (fromBranchId === targetBranchId) return

    await this.storage.messages.updateBranchId(messageId, targetBranchId)

    this.eventBus.emit({
      type: 'message:moved',
      messageId,
      from: fromBranchId,
      to: targetBranchId,
    })
  }

  /** 批量更新消息的分支归属，逐条发射 message:moved 事件 */
  async bulkMove(messageIds: string[], targetBranchId: string): Promise<void> {
    const messages = await Promise.all(messageIds.map((id) => this.storage.messages.getById(id)))
    await this.storage.messages.bulkUpdateBranchId(messageIds, targetBranchId)
    for (let i = 0; i < messageIds.length; i++) {
      const msg = messages[i]
      if (msg && msg.branchId !== targetBranchId) {
        this.eventBus.emit({ type: 'message:moved', messageId: messageIds[i], from: msg.branchId, to: targetBranchId })
      }
    }
  }

  /** 估算指定分支的 token 数 */
  async countTokens(branchId: string, sinceMessageId?: string): Promise<number> {
    return this.storage.messages.countTokens(branchId, sinceMessageId)
  }
}
