/** 导航相关的自定义 hooks */
import { useMemo } from 'react'
import { useDriftStore } from '../store/drift-store'
import type { NavigationHint, Observation } from '@drift/storage'

/** 获取指向/来自当前分支的导航提示 */
export function useNavigationHints(branchId: string): NavigationHint[] {
  const globalMap = useDriftStore((s) => s.globalMap)
  return useMemo(() => {
    if (!globalMap) return []
    return globalMap.navigationHints.filter(
      (h) => h.fromBranchId === branchId || h.toBranchId === branchId
    )
  }, [globalMap, branchId])
}

/** 搜索结果条目 */
interface SearchResult {
  branchId: string
  branchLabel: string
  observation: Observation
  matchedField: string
  matchedText: string
}

/** 在所有分支的 observations 中搜索关键词 */
export function useSearchResults(query: string): SearchResult[] {
  const observations = useDriftStore((s) => s.observations)
  const branches = useDriftStore((s) => s.branches)

  return useMemo(() => {
    if (!query.trim()) return []

    const results: SearchResult[] = []
    const lowerQuery = query.toLowerCase()

    for (const [branchId, branchObs] of Object.entries(observations)) {
      const branch = branches[branchId]
      const label = branch?.label ?? branchId

      for (const obs of branchObs) {
        // 搜索 topics
        for (const topic of obs.topics) {
          if (topic.toLowerCase().includes(lowerQuery)) {
            results.push({
              branchId,
              branchLabel: label,
              observation: obs,
              matchedField: 'topics',
              matchedText: topic,
            })
          }
        }
        // 搜索 facts
        for (const fact of obs.facts) {
          if (fact.toLowerCase().includes(lowerQuery)) {
            results.push({
              branchId,
              branchLabel: label,
              observation: obs,
              matchedField: 'facts',
              matchedText: fact,
            })
          }
        }
        // 搜索 currentTask
        if (obs.currentTask && obs.currentTask.toLowerCase().includes(lowerQuery)) {
          results.push({
            branchId,
            branchLabel: label,
            observation: obs,
            matchedField: 'currentTask',
            matchedText: obs.currentTask,
          })
        }
        // 搜索 openQuestions
        for (const q of obs.openQuestions) {
          if (q.toLowerCase().includes(lowerQuery)) {
            results.push({
              branchId,
              branchLabel: label,
              observation: obs,
              matchedField: 'openQuestions',
              matchedText: q,
            })
          }
        }
      }
    }

    return results
  }, [query, observations, branches])
}
