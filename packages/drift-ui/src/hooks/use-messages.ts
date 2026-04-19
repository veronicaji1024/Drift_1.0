/** 消息相关的自定义 hooks */
import { useDriftStore } from '../store/drift-store'
import type { Message } from '@drift/storage'

/** 空消息数组常量，避免每次创建新引用 */
const EMPTY_MESSAGES: Message[] = []

/** 获取指定分支的消息列表 */
export function useMessages(branchId: string): Message[] {
  return useDriftStore((s) => s.messagesByBranch[branchId] ?? EMPTY_MESSAGES)
}

/** 获取分支的回归面包屑 — 返回最近一次 observation 的 topic */
export function useReEntryBreadcrumb(branchId: string): string | null {
  return useDriftStore((s) => {
    const obs = s.observations[branchId]
    if (!obs || obs.length === 0) return null
    return obs[obs.length - 1].topic || null
  })
}
