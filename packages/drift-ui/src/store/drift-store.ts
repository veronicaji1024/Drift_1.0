/** Drift 全局状态管理 — Zustand store */
import { create } from 'zustand'
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

        // 从 observations 获取当前分支的上下文信息
        const branchObs = get().observations[targetBranchId] ?? []
        const latestObservation = branchObs.length > 0 ? branchObs[branchObs.length - 1] : null
        const branch = get().branches[targetBranchId]

        // 组装 system prompt
        let systemContent = `你是 Drift 对话助手。用户正在分支式对话中探索话题。

当前分支：${branch?.label ?? '未命名'}
你的职责是帮助用户深入探讨当前话题，给出有价值的回复。

### 回复原则
- 保持对话聚焦在当前分支的话题上
- 如果用户的问题与当前话题相关，深入展开
- 回复应该有结构性，适当使用列表和分点
- 用中文回复（除非用户使用英文）`

        if (latestObservation) {
          systemContent += `\n\n### 当前分支上下文
话题：${latestObservation.topic || '探索中'}
阶段：${latestObservation.stage}
${latestObservation.keyPoints.length > 0 ? `已确认要点：${latestObservation.keyPoints.join('；')}` : ''}
${latestObservation.openQuestions.length > 0 ? `待解问题：${latestObservation.openQuestions.join('；')}` : ''}`
        }

        // 如果有全局洞察，注入跨分支信息
        const globalMap = get().globalMap
        if (globalMap) {
          const relatedConnections = globalMap.crossThemeConnections.filter(
            (c) => c.branchIds.includes(targetBranchId)
          )
          if (relatedConnections.length > 0) {
            systemContent += '\n\n### 跨分支关联（供参考）'
            for (const conn of relatedConnections.slice(0, 3)) {
              systemContent += `\n- ${conn.nature}：${conn.significance}`
            }
          }
        }

        const llmMessages: LLMMessage[] = [
          { role: 'system', content: systemContent },
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
