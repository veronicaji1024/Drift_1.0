import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryAdapter } from '@drift/storage'
import { EventBus } from '../event/event-bus.js'
import { BranchManager } from '../branch/branch-manager.js'
import { MessageStore } from '../message/message-store.js'
import { ForkManager } from '../fork/fork-manager.js'
import type { DriftEvent } from '../types/index.js'

describe('ForkManager', () => {
  let storage: InstanceType<typeof InMemoryAdapter>
  let eventBus: EventBus
  let branchManager: BranchManager
  let messageStore: MessageStore
  let forkManager: ForkManager

  beforeEach(async () => {
    storage = new InMemoryAdapter()
    eventBus = new EventBus()
    branchManager = new BranchManager(storage, eventBus)
    messageStore = new MessageStore(storage, eventBus)
    forkManager = new ForkManager(storage, eventBus, branchManager, messageStore)
  })

  /** 创建根分支 + 若干消息的辅助函数 */
  async function setupBranchWithMessages(count: number) {
    const root = await branchManager.create({ label: '根分支' })
    const msgs = []
    for (let i = 0; i < count; i++) {
      const msg = await messageStore.append(root.id, 'user', `消息 ${i}`)
      msgs.push(msg)
    }
    return { root, msgs }
  }

  // ─── fork ──────────────────────────────────

  describe('fork()', () => {
    it('创建新分支并推入 ForkRecord', async () => {
      const { root, msgs } = await setupBranchWithMessages(3)

      const record = await forkManager.fork(root.id, msgs[1]!.id, {
        label: '新话题',
        auto: true,
      })

      expect(record.parentBranchId).toBe(root.id)
      expect(record.forkMessageId).toBe(msgs[1]!.id)
      expect(record.auto).toBe(true)

      // 新分支存在
      const child = await branchManager.get(record.childBranchId)
      expect(child).not.toBeNull()
      expect(child!.label).toBe('新话题')
      expect(child!.parentId).toBe(root.id)
    })

    it('inheritContext=true 时复制父分支消息到 forkMessageId', async () => {
      const { root, msgs } = await setupBranchWithMessages(5)

      const record = await forkManager.fork(root.id, msgs[2]!.id, {
        label: 'fork-with-ctx',
        inheritContext: true,
      })

      // 新分支应有 3 条消息（索引 0,1,2）
      const childMessages = await messageStore.getByBranch(record.childBranchId)
      expect(childMessages.length).toBe(3)
      expect(childMessages[0]!.content).toBe('消息 0')
      expect(childMessages[2]!.content).toBe('消息 2')
    })

    it('inheritContext=false 时新分支无消息', async () => {
      const { root, msgs } = await setupBranchWithMessages(3)

      const record = await forkManager.fork(root.id, msgs[0]!.id, {
        label: 'no-ctx',
        inheritContext: false,
      })

      const childMessages = await messageStore.getByBranch(record.childBranchId)
      expect(childMessages.length).toBe(0)
    })

    it('发射 fork:created 事件', async () => {
      const { root, msgs } = await setupBranchWithMessages(1)
      const events: DriftEvent[] = []
      eventBus.on('fork:created', (e) => events.push(e))

      await forkManager.fork(root.id, msgs[0]!.id)

      expect(events.length).toBe(1)
      expect(events[0]!.type).toBe('fork:created')
    })

    it('裁掉尾部不完整的 tool call 组', async () => {
      const root = await branchManager.create({ label: '根' })

      // user → assistant(toolCalls) → tool → user → assistant(toolCalls 无配套 tool)
      const m1 = await messageStore.append(root.id, 'user', '你好')
      const m2 = await messageStore.append(root.id, 'assistant', '调用工具', {
        toolCalls: [{ id: 'tc1', name: 'search', arguments: '{}' }],
      })
      const m3 = await messageStore.append(root.id, 'user', '工具结果', {
        toolCallId: 'tc1',
      })
      const m4 = await messageStore.append(root.id, 'user', '继续')
      // 尾部：assistant 有 toolCalls 但没有对应 tool 消息
      const m5 = await messageStore.append(root.id, 'assistant', '再调用', {
        toolCalls: [{ id: 'tc2', name: 'calc', arguments: '{}' }],
      })

      const record = await forkManager.fork(root.id, m5.id)
      const childMsgs = await messageStore.getByBranch(record.childBranchId)

      // 应裁掉 m5（不完整 tool call），保留 m1-m4
      expect(childMsgs.length).toBe(4)
      expect(childMsgs.every((m) => !m.toolCalls || m.toolCalls.length === 0 || m.content !== '再调用')).toBe(true)
    })
  })

  // ─── undoFork ──────────────────────────────

  describe('undoFork()', () => {
    it('撤销最近一次 fork，消息回到父分支', async () => {
      const { root, msgs } = await setupBranchWithMessages(3)

      const record = await forkManager.fork(root.id, msgs[1]!.id, {
        label: '子分支',
        inheritContext: false,
      })

      // 在子分支追加消息
      await messageStore.append(record.childBranchId, 'user', '子分支消息')

      // undo
      const undone = await forkManager.undoFork()
      expect(undone.id).toBe(record.id)

      // 子分支消息应回到父分支
      const parentMsgs = await messageStore.getByBranch(root.id)
      expect(parentMsgs.some((m) => m.content === '子分支消息')).toBe(true)

      // 子分支已删除
      const child = await branchManager.get(record.childBranchId)
      expect(child).toBeNull()
    })

    it('栈为空时抛错', async () => {
      await expect(forkManager.undoFork()).rejects.toThrow('没有可撤销的 fork 记录')
    })

    it('指定 forkRecordId 撤销特定记录', async () => {
      const { root, msgs } = await setupBranchWithMessages(3)

      const r1 = await forkManager.fork(root.id, msgs[0]!.id, { label: '分支1', inheritContext: false })
      const r2 = await forkManager.fork(root.id, msgs[1]!.id, { label: '分支2', inheritContext: false })

      // 撤销第一个
      const undone = await forkManager.undoFork(r1.id)
      expect(undone.id).toBe(r1.id)

      // 分支1 被删除
      expect(await branchManager.get(r1.childBranchId)).toBeNull()
      // 分支2 仍存在
      expect(await branchManager.get(r2.childBranchId)).not.toBeNull()
    })

    it('发射 fork:undone 事件', async () => {
      const { root, msgs } = await setupBranchWithMessages(1)
      await forkManager.fork(root.id, msgs[0]!.id, { inheritContext: false })

      const events: DriftEvent[] = []
      eventBus.on('fork:undone', (e) => events.push(e))

      await forkManager.undoFork()
      expect(events.length).toBe(1)
    })
  })

  // ─── mergeBranches ─────────────────────────

  describe('mergeBranches()', () => {
    it('将 source 分支消息合并到 target', async () => {
      const branchA = await branchManager.create({ label: 'A' })
      const branchB = await branchManager.create({ label: 'B' })

      await messageStore.append(branchA.id, 'user', 'A消息1')
      await messageStore.append(branchB.id, 'user', 'B消息1')
      await messageStore.append(branchA.id, 'user', 'A消息2')

      await forkManager.mergeBranches(branchB.id, branchA.id)

      // target 应包含所有消息
      const merged = await messageStore.getByBranch(branchA.id)
      expect(merged.length).toBe(3)
      expect(merged.some((m) => m.content === 'B消息1')).toBe(true)

      // source 分支已删除
      expect(await branchManager.get(branchB.id)).toBeNull()
    })

    it('发射 branch:merged 事件', async () => {
      const branchA = await branchManager.create({ label: 'A' })
      const branchB = await branchManager.create({ label: 'B' })

      const events: DriftEvent[] = []
      eventBus.on('branch:merged', (e) => events.push(e))

      await forkManager.mergeBranches(branchB.id, branchA.id)

      expect(events.length).toBe(1)
      expect(events[0]!.type).toBe('branch:merged')
    })

    it('空 source 分支合并不报错', async () => {
      const branchA = await branchManager.create({ label: 'A' })
      const branchB = await branchManager.create({ label: 'B' })

      await messageStore.append(branchA.id, 'user', '内容')

      await expect(forkManager.mergeBranches(branchB.id, branchA.id)).resolves.not.toThrow()

      // target 消息不变
      const msgs = await messageStore.getByBranch(branchA.id)
      expect(msgs.length).toBe(1)
    })
  })

  // ─── listForkRecords ───────────────────────

  describe('listForkRecords()', () => {
    it('返回 fork 历史', async () => {
      const { root, msgs } = await setupBranchWithMessages(3)

      await forkManager.fork(root.id, msgs[0]!.id, { label: '1', inheritContext: false })
      await forkManager.fork(root.id, msgs[1]!.id, { label: '2', inheritContext: false })

      const records = await forkManager.listForkRecords()
      expect(records.length).toBe(2)
    })

    it('limit 限制返回数量', async () => {
      const { root, msgs } = await setupBranchWithMessages(3)

      await forkManager.fork(root.id, msgs[0]!.id, { label: '1', inheritContext: false })
      await forkManager.fork(root.id, msgs[1]!.id, { label: '2', inheritContext: false })
      await forkManager.fork(root.id, msgs[2]!.id, { label: '3', inheritContext: false })

      const records = await forkManager.listForkRecords(2)
      expect(records.length).toBe(2)
    })
  })
})
