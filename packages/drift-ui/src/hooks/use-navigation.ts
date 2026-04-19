/** 导航相关的自定义 hooks */
import { useMemo } from 'react'
import { useDriftStore } from '../store/drift-store'
import type { NavigationSuggestion, Observation } from '@drift/storage'

/** 获取当前全局导航建议 */
export function useNavigationSuggestions(): NavigationSuggestion[] {
  const globalMap = useDriftStore((s) => s.globalMap)
  return useMemo(() => {
    if (!globalMap) return []
    return globalMap.navigationSuggestions
  }, [globalMap])
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
        // 搜索 topic
        if (obs.topic && obs.topic.toLowerCase().includes(lowerQuery)) {
          results.push({
            branchId,
            branchLabel: label,
            observation: obs,
            matchedField: 'topic',
            matchedText: obs.topic,
          })
        }
        // 搜索 keyPoints
        for (const point of obs.keyPoints) {
          if (point.toLowerCase().includes(lowerQuery)) {
            results.push({
              branchId,
              branchLabel: label,
              observation: obs,
              matchedField: 'keyPoints',
              matchedText: point,
            })
          }
        }
        // 搜索 directionSignal
        if (obs.directionSignal && obs.directionSignal.toLowerCase().includes(lowerQuery)) {
          results.push({
            branchId,
            branchLabel: label,
            observation: obs,
            matchedField: 'directionSignal',
            matchedText: obs.directionSignal,
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
