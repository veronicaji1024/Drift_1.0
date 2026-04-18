import type { DriftEvent, DriftEventHandler } from '../types/index.js'

/**
 * EventBus
 *
 * 类型安全的事件发射器，用于解耦 drift-core 与上层（drift-agents、drift-ui）。
 * 所有事件同步分发，handler 异常不影响其他 handler。
 */
export class EventBus {
  private readonly handlers = new Map<string, Set<DriftEventHandler<DriftEvent['type']>>>()

  /** 发射事件，同步通知所有已注册的 handler */
  emit(event: DriftEvent): void {
    const set = this.handlers.get(event.type)
    if (!set) return
    for (const handler of set) {
      try {
        handler(event as never)
      } catch (err) {
        console.error(`[EventBus] handler error for "${event.type}"`, err)
      }
    }
  }

  /** 注册事件处理函数，返回取消注册的函数 */
  on<T extends DriftEvent['type']>(type: T, handler: DriftEventHandler<T>): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler as unknown as DriftEventHandler<DriftEvent['type']>)
    return () => this.off(type, handler)
  }

  /** 取消注册事件处理函数 */
  off<T extends DriftEvent['type']>(type: T, handler: DriftEventHandler<T>): void {
    const set = this.handlers.get(type)
    if (!set) return
    set.delete(handler as unknown as DriftEventHandler<DriftEvent['type']>)
    if (set.size === 0) {
      this.handlers.delete(type)
    }
  }
}
