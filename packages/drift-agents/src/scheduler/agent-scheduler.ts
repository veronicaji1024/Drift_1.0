import type { DriftEvent, EventBus } from '@drift/core'
import type { AgentTask } from '../types/index.js'
import type { ObserverAgent } from '../observer/observer-agent.js'
import type { SynthesizerAgent } from '../synthesizer/synthesizer-agent.js'

/** 优先级权重映射 */
const PRIORITY_WEIGHT: Record<AgentTask['priority'], number> = {
  high: 3,
  medium: 2,
  low: 1,
}

/**
 * AgentScheduler — 优先级异步调度器
 *
 * 监听 EventBus 事件，按优先级队列调度 agent 任务。
 * 所有任务 fire-and-forget，不阻塞用户对话。
 */
/** Agent 注入配置 */
export interface AgentSchedulerDeps {
  observer?: ObserverAgent
  synthesizer?: SynthesizerAgent
}

export class AgentScheduler {
  private eventBus: EventBus
  private queue: AgentTask[] = []
  private running = false
  private deps: AgentSchedulerDeps = {}

  /** 每种 agent 的防抖定时器 */
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  /** 事件处理回调集合（用于清理） */
  private registeredHandlers: Array<{ type: DriftEvent['type']; handler: (event: DriftEvent) => void }> = []

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus
  }

  /** 注入实际的 agent 实例 */
  injectAgents(deps: AgentSchedulerDeps): void {
    this.deps = { ...this.deps, ...deps }
  }

  /** 将任务加入调度队列 */
  schedule(task: AgentTask): void {
    // 如果有防抖，先取消旧定时器
    if (task.debounceMs && task.debounceMs > 0) {
      const key = this.debounceKey(task)
      const existingTimer = this.debounceTimers.get(key)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      const timer = setTimeout(() => {
        this.debounceTimers.delete(key)
        this.enqueue(task)
      }, task.debounceMs)

      this.debounceTimers.set(key, timer)
      return
    }

    this.enqueue(task)
  }

  /** 处理 DriftEvent，决定触发哪些 agent */
  handleEvent(event: DriftEvent): void {
    switch (event.type) {
      case 'message:appended':
        // 活跃分支的 Observer 优先级高
        this.emitObserverTask(event.branchId, 'high')
        break

      case 'observation:created':
        // Synthesizer 30s 防抖
        this.emitSynthesizerTask()
        break

      case 'message:moved':
        // 受影响的两个分支都需要重新观察
        this.emitObserverTask(event.from, 'medium')
        this.emitObserverTask(event.to, 'medium')
        break

      case 'branch:merged':
        // 合并后目标分支需重新观察
        this.emitObserverTask(event.targetId, 'medium')
        break

      case 'fork:undone':
        // 父分支需重新观察
        this.emitObserverTask(event.forkRecord.parentBranchId, 'medium')
        break

      case 'fork:created':
        // 新分支的 Observer（medium）
        this.emitObserverTask(event.forkRecord.childBranchId, 'medium')
        break

      case 'branch:created':
        // 新创建的分支（非 fork 创建的）
        if (!event.auto) {
          this.emitObserverTask(event.branch.id, 'low')
        }
        break

      default:
        // 其余事件不触发 agent
        break
    }
  }

  /** 注册事件监听（将 handleEvent 绑定到 EventBus） */
  listen(): void {
    const handler = (event: DriftEvent): void => {
      this.handleEvent(event)
    }

    // 监听所有关键事件类型
    const eventTypes = [
      'message:appended',
      'observation:created',
      'message:moved',
      'branch:merged',
      'fork:undone',
      'fork:created',
      'branch:created',
    ] as const

    for (const type of eventTypes) {
      this.eventBus.on(type, handler as never)
      this.registeredHandlers.push({ type, handler })
    }
  }

  /** 取消所有事件监听 */
  unlisten(): void {
    for (const { type, handler } of this.registeredHandlers) {
      this.eventBus.off(type, handler as never)
    }
    this.registeredHandlers = []
  }

  /** 清理所有防抖定时器 */
  dispose(): void {
    this.unlisten()
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
    this.queue = []
  }

  // ─── 内部方法 ───

  /** 发出 Observer 调度任务 */
  private emitObserverTask(branchId: string, priority: AgentTask['priority']): void {
    const observer = this.deps.observer
    this.schedule({
      agent: 'observer',
      priority,
      branchId,
      run: async () => {
        if (!observer) {
          console.warn(`[AgentScheduler] Observer 未注入，跳过 branch ${branchId}`)
          return
        }
        const observation = await observer.run(branchId)
        this.eventBus.emit({ type: 'observation:created', observation })
      },
    })
  }

  /** 发出 Synthesizer 调度任务 */
  private emitSynthesizerTask(): void {
    const synthesizer = this.deps.synthesizer
    this.schedule({
      agent: 'synthesizer',
      priority: 'medium',
      debounceMs: 30_000,
      run: async () => {
        if (!synthesizer) {
          console.warn('[AgentScheduler] Synthesizer 未注入，跳过')
          return
        }
        const globalMap = await synthesizer.run()
        this.eventBus.emit({ type: 'globalmap:updated', globalMap })
      },
    })
  }

  /** 将任务插入优先级队列并触发消费 */
  private enqueue(task: AgentTask): void {
    // 去重：同 agent + 同 branchId 的任务只保留最新
    this.queue = this.queue.filter(
      (t) => !(t.agent === task.agent && t.branchId === task.branchId),
    )

    this.queue.push(task)

    // 按优先级排序（高优先级在前）
    this.queue.sort(
      (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority],
    )

    // 触发消费（fire-and-forget）
    void this.drain()
  }

  /** 依次消费队列中的任务 */
  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift()
        if (!task) break

        try {
          await task.run()
        } catch (error) {
          // fire-and-forget：记录错误但不中断
          console.error(`[AgentScheduler] Task ${task.agent} failed:`, error)
        }
      }
    } finally {
      this.running = false
    }
  }

  /** 生成防抖 key */
  private debounceKey(task: AgentTask): string {
    return task.branchId ? `${task.agent}:${task.branchId}` : task.agent
  }
}
