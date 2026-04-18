/** 分支相关的自定义 hooks */
import { useDriftStore } from '../store/drift-store'
import type { Branch, BranchTreeNode, Message, Observation } from '@drift/storage'

/** 空数组常量，避免创建新引用 */
const EMPTY_MESSAGES: Message[] = []
const EMPTY_OBSERVATIONS: Observation[] = []

/** 单个分支的完整数据视图 */
interface BranchView {
  branch: Branch | undefined
  messages: Message[]
  observations: Observation[]
}

/** 获取指定分支的数据、消息和观察 */
export function useBranch(id: string): BranchView {
  const branch = useDriftStore((s) => s.branches[id])
  const messages = useDriftStore((s) => s.messagesByBranch[id] ?? EMPTY_MESSAGES)
  const observations = useDriftStore((s) => s.observations[id] ?? EMPTY_OBSERVATIONS)
  return { branch, messages, observations }
}

/** 获取当前活跃分支的完整数据 */
export function useActiveBranch(): BranchView & { activeBranchId: string | null } {
  const activeBranchId = useDriftStore((s) => s.activeBranchId)
  const branch = useDriftStore((s) =>
    s.activeBranchId ? s.branches[s.activeBranchId] : undefined
  )
  const messages = useDriftStore((s) =>
    s.activeBranchId ? s.messagesByBranch[s.activeBranchId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES
  )
  const observations = useDriftStore((s) =>
    s.activeBranchId ? s.observations[s.activeBranchId] ?? EMPTY_OBSERVATIONS : EMPTY_OBSERVATIONS
  )
  return { activeBranchId, branch, messages, observations }
}

/** 获取分支树结构 */
export function useBranchTree(): BranchTreeNode | null {
  return useDriftStore((s) => s.tree)
}
