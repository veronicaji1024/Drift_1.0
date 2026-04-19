import type { Observation, BranchStage } from '@drift/storage'
import type { IntentResult, IntentConfidence } from '../types/index.js'

// ─── 信号词库 ───

/** 话题漂移显式信号词（中英文） */
const FORK_SIGNALS: string[] = [
  '另外', '另外想到', '换个角度', '对了', '突然想到',
  '话说回来', '顺便说一下', '说到这个', '忽然想起',
  '岔开一下', '先放一下', '换个方向',
  'what about', 'by the way', 'btw', 'speaking of',
  'on a different note', 'that reminds me', 'side note',
  'unrelated but', 'off topic', 'random thought',
]

/** 回溯显式信号词（中英文） */
const BACKTRACK_SIGNALS: string[] = [
  '刚才说的', '之前聊的', '回到', '前面提到',
  '我重新想了', '其实那个', '重新考虑',
  'going back to', 'earlier we', 'as I mentioned',
  'let me reconsider', 'actually that',
]

/**
 * Intent Detector — 意图判断器（IntentAgent）
 *
 * 基于规则和关键词检测话题漂移、回溯、继续意图。
 * 不调用 LLM，完全同步执行。
 */
export class IntentDetector {
  /** 每个分支的冷却计数器（距上次 fork 的 turn 数） */
  private cooldownCounters: Map<string, number> = new Map()

  /** 检测消息意图 */
  detect(
    message: string,
    branchContext?: {
      topic?: string
      stage?: BranchStage
      keyPoints?: string[]
      directionSignal?: string
      earlyTopics?: string[]
    },
  ): IntentResult {
    const stage = branchContext?.stage ?? 'exploring'
    const hasSubtopicSplit = branchContext?.directionSignal?.includes('子话题分裂') ?? false

    // 先检测回溯
    const backtrackResult = this.checkBacktrack(message, branchContext)
    if (backtrackResult.intent === 'backtrack') {
      return backtrackResult
    }

    // 再检测 fork
    const forkResult = this.checkFork(message, branchContext, hasSubtopicSplit)

    if (forkResult.intent === 'fork') {
      // exhausted 阶段即使话题延续也可以 fork
      if (stage === 'exhausted') {
        return { ...forkResult, confidence: 'high' }
      }
      return forkResult
    }

    return { intent: 'continue', confidence: 'high', reasoning: '消息在当前话题范围内' }
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

  /** 检测回溯信号 */
  private checkBacktrack(
    message: string,
    context?: {
      keyPoints?: string[]
      earlyTopics?: string[]
    },
  ): IntentResult {
    const lowerMessage = message.toLowerCase()

    // 显式信号词检测
    for (const signal of BACKTRACK_SIGNALS) {
      if (lowerMessage.includes(signal.toLowerCase())) {
        const hint = this.extractBacktrackHint(message, context)
        return {
          intent: 'backtrack',
          confidence: 'high',
          backtrackHint: hint,
          reasoning: `检测到回溯信号"${signal}"`,
        }
      }
    }

    // 隐式信号：消息与 earlyTopics 有较高重叠
    if (context?.earlyTopics && context.earlyTopics.length > 0) {
      const overlap = this.computeTopicOverlap(message, context.earlyTopics)
      if (overlap > 0.5) {
        return {
          intent: 'backtrack',
          confidence: 'medium',
          backtrackHint: context.earlyTopics[0],
          reasoning: '消息内容与之前讨论过的话题高度相似',
        }
      }
    }

    // 隐式信号：重提 keyPoints 中的结论
    if (context?.keyPoints && context.keyPoints.length > 0) {
      for (const point of context.keyPoints) {
        const pointWords = this.tokenize(point)
        const msgWords = this.tokenize(message)
        let overlapCount = 0
        for (const w of msgWords) {
          if (pointWords.has(w)) overlapCount++
        }
        if (msgWords.size > 0 && overlapCount / msgWords.size > 0.4) {
          return {
            intent: 'backtrack',
            confidence: 'medium',
            backtrackHint: point.slice(0, 20),
            reasoning: '消息似乎在重新讨论之前已确认的结论',
          }
        }
      }
    }

    return { intent: 'continue', confidence: 'high', reasoning: '' }
  }

  /** 从消息中提取回溯目标关键词 */
  private extractBacktrackHint(
    message: string,
    context?: { keyPoints?: string[]; earlyTopics?: string[] },
  ): string {
    // 尝试从 earlyTopics 或 keyPoints 中匹配
    const candidates = [...(context?.earlyTopics ?? []), ...(context?.keyPoints ?? [])]
    for (const candidate of candidates) {
      const words = this.tokenize(candidate)
      const msgWords = this.tokenize(message)
      let matchCount = 0
      for (const w of msgWords) {
        if (words.has(w)) matchCount++
      }
      if (matchCount >= 2) return candidate.slice(0, 20)
    }
    // 回退：用消息前 15 个字
    return message.slice(0, 15)
  }

  /** 检测 fork 信号 */
  private checkFork(
    message: string,
    context?: { topic?: string; directionSignal?: string },
    hasSubtopicSplit?: boolean,
  ): IntentResult {
    const lowerMessage = message.toLowerCase()

    // 显式信号词匹配
    let matchedSignal: string | undefined
    for (const signal of FORK_SIGNALS) {
      if (lowerMessage.includes(signal.toLowerCase())) {
        matchedSignal = signal
        break
      }
    }

    if (matchedSignal) {
      return {
        intent: 'fork',
        confidence: 'high',
        forkLabel: this.generateLabel(message, matchedSignal),
        reasoning: `检测到话题切换信号"${matchedSignal}"`,
      }
    }

    // 隐式信号：话题关键词偏离
    const currentTopicWords = context?.topic ? [context.topic] : []
    const topicOverlap = this.computeTopicOverlap(message, currentTopicWords)

    // 子话题分裂时降低 fork 阈值
    const threshold = hasSubtopicSplit ? 0.3 : 0.2
    if (currentTopicWords.length > 0 && topicOverlap < threshold) {
      return {
        intent: 'fork',
        confidence: 'medium',
        forkLabel: this.generateLabel(message),
        reasoning: '消息的话题方向与当前分支存在明显偏移',
      }
    }

    return { intent: 'continue', confidence: 'high', reasoning: '' }
  }

  /** 计算消息与话题的词重叠度（0-1） */
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
      if (topicWords.has(word)) overlapCount++
    }
    return overlapCount / messageWords.size
  }

  /** 简单分词（中英文混合） */
  private tokenize(text: string): Set<string> {
    const words = new Set<string>()
    const englishWords = text.toLowerCase().match(/[a-z]{2,}/g)
    if (englishWords) {
      for (const w of englishWords) words.add(w)
    }
    const chineseChars = text.match(/[\u4e00-\u9fff]/g)
    if (chineseChars) {
      for (const c of chineseChars) words.add(c)
    }
    return words
  }

  /** 从消息中自动生成分支标签 */
  private generateLabel(message: string, _matchedSignal?: string): string {
    const cleaned = message
      .replace(/[另外想到|换个角度|对了|突然想到|by the way|btw|what about]/gi, '')
      .trim()
    const label = cleaned.slice(0, 20).trim()
    return label.length > 0 ? label : '新话题'
  }
}
