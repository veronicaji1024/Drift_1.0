/** Drift 全局状态管理 — Zustand store */
import { create } from 'zustand'
import driftPersona from '../prompts/drift-persona.md?raw'
import type {
  Message,
  Branch,
  BranchTreeNode,
  Observation,
  GlobalMap,
  UserProfile,
  OutputFormat,
  Deliverable,
} from '@drift/storage'
import type { DriftEvent, BranchManager, MessageStore, ForkManager, LLMAdapter, LLMMessage } from '@drift/core'
import type { IntentDetector, AgentScheduler, ConvergenceEngine } from '@drift/agents'

/** 自动 fork 提示信息 */
interface AutoForkNoticeData {
  branchId: string
  parentBranchId: string
  forkRecordId: string
  label: string
}

/** Drift 核心状态与操作 */
export interface DriftStore {
  // ---- 分支状态 ----
  branches: Record<string, Branch>
  activeBranchId: string | null
  tree: BranchTreeNode | null

  // ---- 消息状态 ----
  messagesByBranch: Record<string, Message[]>

  // ---- Agent 状态 ----
  globalMap: GlobalMap | null
  observations: Record<string, Observation[]>
  profile: UserProfile | null

  // ---- 收敛状态 ----
  convergenceResult: Deliverable | null
  convergenceLoading: boolean
  convergenceError: string | null

  // ---- UI 状态 ----
  autoForkNotice: AutoForkNoticeData | null
  convergencePanelOpen: boolean
  searchQuery: string
  quickPeekBranchId: string | null
  loadingBranches: Set<string>
  errorByBranch: Record<string, string>

  // ---- 右侧面板状态 ----
  rightPanelVisible: boolean
  rightPanelWidth: number

  // ---- 用户头像 ----
  userAvatar: string | null

  // ---- Q*bert 动画 ----
  qbertSpitting: boolean

  // ---- 实时输入 ----
  draftByBranch: Record<string, string>

  // ---- 操作 ----
  switchBranch(id: string): void
  sendMessage(branchId: string, content: string): void
  undoFork(): void
  dismissAutoForkNotice(): void
  mergeBranches(sourceId: string, targetId: string): void
  moveMessage(messageId: string, targetBranchId: string): void
  renameBranch(id: string, label: string): void
  archiveBranch(id: string): void
  requestConvergence(branchIds: string[], format: OutputFormat): void
  setSearchQuery(query: string): void
  setQuickPeekBranch(id: string | null): void
  toggleConvergencePanel(): void
  toggleRightPanel(): void
  setRightPanelWidth(width: number): void
  setUserAvatar(id: string): void
  triggerQbertSpit(): void
  setDraft(branchId: string, content: string): void

  // ---- 内部 ----
  _updateFromEvent(event: DriftEvent): void
}

/** 外部依赖注入：core 服务实例 */
interface DriftServices {
  branchManager: BranchManager
  messageStore: MessageStore
  forkManager: ForkManager
  intentDetector: IntentDetector
  agentScheduler: AgentScheduler
  convergenceEngine: ConvergenceEngine
  llm?: LLMAdapter
}

/** 保存注入的服务实例 */
let services: DriftServices | null = null

/** 注入核心服务依赖 */
export function injectServices(s: DriftServices): void {
  services = s
}

/** 获取已注入的服务，未注入时抛出 */
function getServices(): DriftServices {
  if (!services) {
    throw new Error('DriftStore: 请先调用 injectServices() 注入核心服务')
  }
  return services
}

/** 创建 Drift Zustand Store */
export const useDriftStore = create<DriftStore>((set, get) => ({
  // ---- 初始状态 ----
  branches: {},
  activeBranchId: null,
  tree: null,
  messagesByBranch: {},
  globalMap: null,
  observations: {},
  profile: null,
  convergenceResult: null,
  convergenceLoading: false,
  convergenceError: null,
  autoForkNotice: null,
  convergencePanelOpen: false,
  searchQuery: '',
  quickPeekBranchId: null,
  loadingBranches: new Set<string>(),
  errorByBranch: {},
  rightPanelVisible: true,
  rightPanelWidth: 400,
  userAvatar: null,
  qbertSpitting: false,
  draftByBranch: {},

  /** 切换到指定分支 */
  switchBranch(id: string) {
    const prev = get().activeBranchId
    set({ activeBranchId: id })
    // 切换分支时自动显示右侧面板
    if (!get().rightPanelVisible) {
      set({ rightPanelVisible: true })
    }
    if (prev && prev !== id) {
      get()._updateFromEvent({ type: 'branch:switched', from: prev, to: id })
    }
  },

  /** 发送用户消息到指定分支，并获取 AI 回复 */
  async sendMessage(branchId: string, content: string) {
    if (!branchId) return

    const shouldSpit = content.trim() === '吐豆子'

    const svc = getServices()

    // 设置该分支 loading，清除旧错误
    const newLoading = new Set(get().loadingBranches)
    newLoading.add(branchId)
    const { [branchId]: _removed, ...restErrors } = get().errorByBranch
    set({ loadingBranches: newLoading, errorByBranch: restErrors })

    // 实际发送消息的目标分支（可能因 auto-fork 改变）
    let targetBranchId = branchId

    // 通过 IntentDetector 检测是否需要 fork
    const branchObservations = get().observations[branchId] ?? []
    const latestObs = branchObservations.length > 0 ? branchObservations[branchObservations.length - 1] : null
    const branchContext = latestObs ? {
      topic: latestObs.topic,
      stage: latestObs.stage,
      keyPoints: latestObs.keyPoints,
      directionSignal: latestObs.directionSignal,
    } : undefined
    const intentResult = svc.intentDetector.detect(content, branchContext)

    // 如果检测到 fork 意图，自动 fork，消息发到新分支
    if (intentResult.intent === 'fork') {
      const currentMessages = get().messagesByBranch[branchId] ?? []
      const lastMsgId = currentMessages.length > 0
        ? currentMessages[currentMessages.length - 1].id
        : undefined
      if (lastMsgId) {
        try {
          const forkRecord = await svc.forkManager.fork(branchId, lastMsgId, {
            label: intentResult.forkLabel ?? '新话题',
            auto: true,
            inheritContext: true,
          })
          // 消息发到新分支
          targetBranchId = forkRecord.childBranchId

          // 更新分支树
          const tree = await svc.branchManager.getTree()
          set({ tree })

          // 自动切换到新分支
          get().switchBranch(targetBranchId)

          // 将 loading 标记也转移到新分支
          const updatedLoading = new Set(get().loadingBranches)
          updatedLoading.delete(branchId)
          updatedLoading.add(targetBranchId)
          set({ loadingBranches: updatedLoading })
        } catch {
          // fork 失败，消息留在原分支
        }
      }
    }

    try {
      // 追加用户消息到目标分支
      const message = await svc.messageStore.append(targetBranchId, 'user', content)

      // 更新本地消息列表
      const current = get().messagesByBranch[targetBranchId] ?? []
      set({ messagesByBranch: { ...get().messagesByBranch, [targetBranchId]: [...current, message] } })

      // 调用 LLM 获取 AI 回复
      if (svc.llm) {
        const history = get().messagesByBranch[targetBranchId] ?? []
        const llmMessages: LLMMessage[] = [
          {
            role: 'system',
            content: driftPersona,
          },
          ...history.map((m) => ({
            role: m.role === 'system' ? 'system' as const : m.role === 'assistant' ? 'assistant' as const : 'user' as const,
            content: m.content,
          })),
        ]

        const response = await svc.llm.chat(llmMessages)

        // 追加 AI 回复
        const aiMessage = await svc.messageStore.append(targetBranchId, 'assistant', response.content)
        const latestMessages = get().messagesByBranch[targetBranchId] ?? []
        set({ messagesByBranch: { ...get().messagesByBranch, [targetBranchId]: [...latestMessages, aiMessage] } })

        // AI 回复渲染后再触发吐豆子，确保 ref 指向本轮
        if (shouldSpit) {
          setTimeout(() => get().triggerQbertSpit(), 150)
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'LLM 调用失败'
      console.error('[Drift] LLM 调用失败:', err)
      set({ errorByBranch: { ...get().errorByBranch, [targetBranchId]: errMsg } })
    } finally {
      // 清除 loading
      const finalLoading = new Set(get().loadingBranches)
      finalLoading.delete(targetBranchId)
      finalLoading.delete(branchId)
      set({ loadingBranches: finalLoading })
    }

    // 推进冷却计数
    svc.intentDetector.tickCooldown(targetBranchId)
  },

  /** 撤销最近的自动 fork */
  async undoFork() {
    const svc = getServices()
    await svc.forkManager.undoFork()
    set({ autoForkNotice: null })
  },

  /** 关闭自动 fork 提示 */
  dismissAutoForkNotice() {
    set({ autoForkNotice: null })
  },

  /** 合并两个分支 */
  async mergeBranches(sourceId: string, targetId: string) {
    const svc = getServices()
    await svc.forkManager.mergeBranches(sourceId, targetId)
  },

  /** 将单条消息移动到另一个分支 */
  async moveMessage(messageId: string, targetBranchId: string) {
    const svc = getServices()
    await svc.messageStore.move(messageId, targetBranchId)
  },

  /** 重命名分支 */
  async renameBranch(id: string, label: string) {
    const svc = getServices()
    await svc.branchManager.rename(id, label)

    const branch = get().branches[id]
    if (branch) {
      set({ branches: { ...get().branches, [id]: { ...branch, label } } })
    }
  },

  /** 归档分支 */
  async archiveBranch(id: string) {
    const svc = getServices()
    await svc.branchManager.archive(id)

    const branch = get().branches[id]
    if (branch) {
      set({ branches: { ...get().branches, [id]: { ...branch, status: 'archived' } } })
    }
  },

  /** 请求收敛输出 */
  async requestConvergence(branchIds: string[], format: OutputFormat) {
    const svc = getServices()
    set({ convergenceLoading: true, convergenceError: null, convergenceResult: null })

    try {
      const deliverable = await svc.convergenceEngine.generate(branchIds, format)
      set({ convergenceResult: deliverable })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '收敛生成失败'
      console.error('[Drift] 收敛生成失败:', err)
      set({ convergenceError: errMsg })
    } finally {
      set({ convergenceLoading: false })
    }
  },

  /** 设置搜索关键词 */
  setSearchQuery(query: string) {
    set({ searchQuery: query })
  },

  /** 设置 QuickPeek 预览的分支 */
  setQuickPeekBranch(id: string | null) {
    set({ quickPeekBranchId: id })
  },

  /** 切换收敛面板显隐 */
  toggleConvergencePanel() {
    set((s) => ({ convergencePanelOpen: !s.convergencePanelOpen }))
  },

  /** 切换右侧对话面板显隐 */
  toggleRightPanel() {
    set((s) => ({ rightPanelVisible: !s.rightPanelVisible }))
  },

  /** 设置用户头像 */
  setUserAvatar(id: string) {
    set({ userAvatar: id })
  },

  /** 设置某分支的草稿内容 */
  setDraft(branchId: string, content: string) {
    set({ draftByBranch: { ...get().draftByBranch, [branchId]: content } })
  },

  /** 触发 Q*bert 吐豆子动画 */
  triggerQbertSpit() {
    console.log('[Drift] triggerQbertSpit called!')
    set({ qbertSpitting: true })
    setTimeout(() => { console.log('[Drift] qbertSpitting reset to false'); set({ qbertSpitting: false }) }, 6000)
  },

  /** 设置右侧面板宽度 */
  setRightPanelWidth(width: number) {
    set({ rightPanelWidth: Math.max(320, Math.min(width, window.innerWidth * 0.5)) })
  },

  /** 根据 core 事件更新本地状态 */
  _updateFromEvent(event: DriftEvent) {
    switch (event.type) {
      case 'branch:created': {
        set({ branches: { ...get().branches, [event.branch.id]: event.branch } })
        break
      }
      case 'branch:archived': {
        const branch = get().branches[event.branchId]
        if (branch) {
          set({ branches: { ...get().branches, [event.branchId]: { ...branch, status: 'archived' } } })
        }
        break
      }
      case 'branch:merged': {
        const { [event.sourceId]: _removed, ...rest } = get().branches
        set({ branches: rest })
        break
      }
      case 'fork:created': {
        set({
          autoForkNotice: {
            branchId: event.forkRecord.childBranchId,
            parentBranchId: event.forkRecord.parentBranchId,
            forkRecordId: event.forkRecord.id,
            label: get().branches[event.forkRecord.childBranchId]?.label ?? '新分支',
          },
        })
        break
      }
      case 'fork:undone': {
        set({ autoForkNotice: null })
        break
      }
      case 'message:appended': {
        break
      }
      case 'message:moved': {
        const msgMap = { ...get().messagesByBranch }
        msgMap[event.from] = (msgMap[event.from] ?? []).filter(
          (m) => m.id !== event.messageId
        )
        set({ messagesByBranch: msgMap })
        break
      }
      case 'observation:created': {
        const existing = get().observations[event.observation.branchId] ?? []
        set({
          observations: {
            ...get().observations,
            [event.observation.branchId]: [...existing, event.observation],
          },
        })
        break
      }
      case 'globalmap:updated': {
        set({ globalMap: event.globalMap })
        break
      }
      default:
        break
    }
  },
}))
