import type { UserProfile } from '@drift/storage'
import type { IntentResult } from '../types/index.js'

// ─── 信号词库 ───

/** 话题漂移信号词（中英文） */
const DRIFT_SIGNALS: string[] = [
  '另外想到',
  '换个角度',
  '对了',
  '突然想到',
  '话说回来',
  '顺便说一下',
  '说到这个',
  '忽然想起',
  '岔开一下',
  'what about',
  'by the way',
  'btw',
  'speaking of',
  'on a different note',
  'that reminds me',
  'side note',
  'unrelated but',
  'off topic',
  'random thought',
]

/** 收敛信号词（中英文） */
const CONVERGE_SIGNALS: string[] = [
  '总结一下',
  '比较一下',
  '结论是什么',
  '归纳一下',
  '梳理一下',
  '综合来看',
  '最终决定',
  '做个表格',
  '列个清单',
  'summarize',
  'compare',
  'wrap up',
  'in conclusion',
  'to sum up',
  'final decision',
  'make a table',
  'create a checklist',
  'bottom line',
]

/**
 * Intent Detector — 零 LLM 成本的话题漂移检测器
 *
 * 基于规则和关键词检测话题漂移/收敛意图。
 * 不调用 LLM，完全同步执行。
 */
export class IntentDetector {
  /** 每个分支的冷却计数器（距上次 fork 的 turn 数） */
  private cooldownCounters: Map<string, number> = new Map()

  /** 检测消息意图：漂移 / 收敛 / 继续 */
  detect(
    message: string,
    currentTopics: string[],
    profile?: UserProfile,
  ): IntentResult {
    const sensitivity = profile?.intentDetectorSensitivity ?? 0.5
    const cooldownTurns = profile?.forkCooldownTurns ?? 3

    // 先检测收敛意图
    const convergeResult = this.checkConverge(message)
    if (convergeResult.confidence > 0) {
      return convergeResult
    }

    // 再检测漂移意图
    const driftResult = this.checkDrift(message, currentTopics, sensitivity)

    // 如果检测到漂移，检查冷却期
    if (driftResult.type === 'drift') {
      // 冷却期内降级为 continue
      // 注意：冷却检查用消息所属分支的 branchId，这里简化为全局
      if (!this.passesCooldown(cooldownTurns)) {
        return { type: 'continue', confidence: 0.3 }
      }
    }

    return driftResult
  }

  /** 记录某分支发生了一轮对话（推进冷却计数器） */
  tickCooldown(branchId: string): void {
    const current = this.cooldownCounters.get(branchId) ?? 0
    this.cooldownCounters.set(branchId, current + 1)
  }

  /** 重置某分支的冷却（发生 fork 后调用） */
  resetCooldown(branchId: string): void {
    this.cooldownCounters.set(branchId, 0)
  }

  /** 检测收敛信号 */
  private checkConverge(message: string): IntentResult {
    const lowerMessage = message.toLowerCase()
    let matchCount = 0

    for (const signal of CONVERGE_SIGNALS) {
      if (lowerMessage.includes(signal.toLowerCase())) {
        matchCount++
      }
    }

    if (matchCount > 0) {
      return {
        type: 'converge',
        confidence: Math.min(1, 0.6 + matchCount * 0.15),
      }
    }

    return { type: 'continue', confidence: 0 }
  }

  /** 检测漂移信号 */
  private checkDrift(
    message: string,
    currentTopics: string[],
    sensitivity: number,
  ): IntentResult {
    const lowerMessage = message.toLowerCase()

    // 信号词匹配
    let signalScore = 0
    let matchedSignal: string | undefined

    for (const signal of DRIFT_SIGNALS) {
      if (lowerMessage.includes(signal.toLowerCase())) {
        signalScore += 0.4
        matchedSignal = signal
        break // 一个信号词就够了
      }
    }

    // 话题关键词偏离度
    const topicOverlap = this.computeTopicOverlap(message, currentTopics)
    const topicDriftScore = currentTopics.length > 0 ? (1 - topicOverlap) * 0.4 : 0

    // 综合分数 + 灵敏度调节
    const rawScore = signalScore + topicDriftScore
    const adjustedScore = rawScore * (0.5 + sensitivity)
    const confidence = Math.min(1, adjustedScore)

    // 阈值判断
    const threshold = 0.45
    if (confidence >= threshold) {
      return {
        type: 'drift',
        confidence,
        suggestedLabel: this.generateLabel(message, matchedSignal),
      }
    }

    return { type: 'continue', confidence: 1 - confidence }
  }

  /** 计算消息与当前话题的词重叠度（0-1） */
  private computeTopicOverlap(message: string, topics: string[]): number {
    if (topics.length === 0) return 1

    const messageWords = this.tokenize(message)
    if (messageWords.size === 0) return 1

    const topicWords = new Set<string>()
    for (const topic of topics) {
      for (const word of this.tokenize(topic)) {
        topicWords.add(word)
      }
    }

    if (topicWords.size === 0) return 1

    let overlapCount = 0
    for (const word of messageWords) {
      if (topicWords.has(word)) {
        overlapCount++
      }
    }

    return overlapCount / messageWords.size
  }

  /** 简单分词（中英文混合） */
  private tokenize(text: string): Set<string> {
    const words = new Set<string>()

    // 英文词
    const englishWords = text.toLowerCase().match(/[a-z]{2,}/g)
    if (englishWords) {
      for (const w of englishWords) {
        words.add(w)
      }
    }

    // 中文字（逐字，2 字以上的连续中文也拆开）
    const chineseChars = text.match(/[\u4e00-\u9fff]/g)
    if (chineseChars) {
      for (const c of chineseChars) {
        words.add(c)
      }
    }

    return words
  }

  /** 从消息中自动生成分支标签 */
  private generateLabel(message: string, _matchedSignal?: string): string {
    // 取消息的前 20 个字符作为标签基础
    const cleaned = message
      .replace(/[另外想到|换个角度|对了|突然想到|by the way|btw|what about]/gi, '')
      .trim()

    const label = cleaned.slice(0, 20).trim()
    return label.length > 0 ? label : '新话题'
  }

  /** 检查是否过了冷却期（全局简化版本） */
  private passesCooldown(cooldownTurns: number): boolean {
    // 遍历所有分支，任意一个还在冷却期内则阻止
    for (const [, count] of this.cooldownCounters) {
      if (count < cooldownTurns) {
        return false
      }
    }
    return true
  }
}
