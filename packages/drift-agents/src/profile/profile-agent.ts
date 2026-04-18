import type { DriftStorage, UserProfile, OutputFormat } from '@drift/storage'
import type { LLMAdapter, LLMMessage } from '@drift/core'
import type { BehaviorSignals } from '../types/index.js'

/** ProfileAgent 的系统提示词 */
const PROFILE_SYSTEM_PROMPT = `You are a user behavior analysis agent. Given the user's current profile and new behavior signals, produce an updated profile.

Output ONLY valid JSON (no markdown fences, no extra text):
{
  "thinkingStyle": "divergent-first | linear | jumping",
  "topicSwitchFrequency": "high | medium | low",
  "preferredOutputFormat": "outline | comparison | decision-matrix | checklist | prose | custom",
  "detailLevel": "concise | detailed",
  "domainExpertise": { "domain": "expert | intermediate | novice" },
  "insights": ["insight about user behavior"]
}

Rules:
- Merge incrementally with existing profile, don't overwrite blindly
- thinkingStyle: "divergent-first" = explores broadly before focusing, "linear" = sequential, "jumping" = frequent random switches
- topicSwitchFrequency: based on branchSwitchCount relative to session duration
- insights: max 5 most important behavioral observations
- Be conservative in changes — only shift values when signals are strong`

/** 默认用户配置 */
function defaultProfile(): UserProfile {
  return {
    thinkingStyle: 'divergent-first',
    topicSwitchFrequency: 'medium',
    preferredOutputFormat: 'outline',
    autoForkTolerance: 0.5,
    detailLevel: 'concise',
    intentDetectorSensitivity: 0.5,
    observerDebounceSec: 30,
    forkCooldownTurns: 3,
    domainExpertise: {},
    lastUpdated: new Date().toISOString(),
    sessionCount: 0,
    insights: [],
  }
}

/**
 * Profile Agent — 用户行为学习
 *
 * 根据行为信号增量更新用户画像，动态调整系统参数。
 * 使用便宜/快速的模型层级。
 */
export class ProfileAgent {
  private llm: LLMAdapter
  private storage: DriftStorage

  constructor(llm: LLMAdapter, storage: DriftStorage) {
    this.llm = llm
    this.storage = storage
  }

  /** 根据行为信号更新用户画像 */
  async run(userId: string, signals: BehaviorSignals): Promise<UserProfile> {
    try {
      return await this.doRun(userId, signals)
    } catch (error) {
      console.error(`[ProfileAgent] Failed for user ${userId}:`, error)
      const existing = await this.storage.profile.get(userId)
      return existing ?? defaultProfile()
    }
  }

  /** 核心执行逻辑 */
  private async doRun(userId: string, signals: BehaviorSignals): Promise<UserProfile> {
    // 读取已有 profile
    const existing = await this.storage.profile.get(userId)
    const currentProfile = existing ?? defaultProfile()

    // 调用 LLM 分析行为信号
    const inputText = this.buildInput(currentProfile, signals)
    const messages: LLMMessage[] = [
      { role: 'system', content: PROFILE_SYSTEM_PROMPT },
      { role: 'user', content: inputText },
    ]

    const response = await this.llm.chat(messages, {
      temperature: 0.2,
      maxTokens: 1024,
    })

    // 解析 LLM 输出
    const llmUpdate = this.parseResponse(response.content)

    // 计算衍生参数
    const derivedParams = this.computeDerivedParams(signals, currentProfile)

    // 合并为最终 profile
    const updatedProfile: UserProfile = {
      thinkingStyle: llmUpdate.thinkingStyle ?? currentProfile.thinkingStyle,
      topicSwitchFrequency: llmUpdate.topicSwitchFrequency ?? currentProfile.topicSwitchFrequency,
      preferredOutputFormat: llmUpdate.preferredOutputFormat ?? currentProfile.preferredOutputFormat,
      detailLevel: llmUpdate.detailLevel ?? currentProfile.detailLevel,
      domainExpertise: {
        ...currentProfile.domainExpertise,
        ...(llmUpdate.domainExpertise ?? {}),
      },
      autoForkTolerance: derivedParams.autoForkTolerance,
      intentDetectorSensitivity: derivedParams.intentDetectorSensitivity,
      observerDebounceSec: derivedParams.observerDebounceSec,
      forkCooldownTurns: derivedParams.forkCooldownTurns,
      lastUpdated: new Date().toISOString(),
      sessionCount: currentProfile.sessionCount + 1,
      insights: this.mergeInsights(currentProfile.insights, llmUpdate.insights ?? []),
    }

    // 持久化
    await this.storage.profile.put(userId, updatedProfile)

    return updatedProfile
  }

  /** 组装 LLM 输入 */
  private buildInput(profile: UserProfile, signals: BehaviorSignals): string {
    const parts = [
      '## Current Profile',
      `Thinking Style: ${profile.thinkingStyle}`,
      `Topic Switch Frequency: ${profile.topicSwitchFrequency}`,
      `Preferred Output: ${profile.preferredOutputFormat}`,
      `Detail Level: ${profile.detailLevel}`,
      `Session Count: ${profile.sessionCount}`,
      `Domain Expertise: ${JSON.stringify(profile.domainExpertise)}`,
      `Existing Insights: ${profile.insights.join('; ')}`,
      '',
      '## New Behavior Signals',
      `Fork Undo Count: ${signals.forkUndoCount}`,
      `Fork Accept Count: ${signals.forkAcceptCount}`,
      `Branch Switch Count: ${signals.branchSwitchCount}`,
      `Average Message Length: ${signals.averageMessageLength}`,
      `Convergence Formats Used: ${signals.convergenceFormats.join(', ')}`,
      `Session Duration (min): ${signals.sessionDurationMinutes}`,
      `Topic Depth Scores: ${JSON.stringify(signals.topicDepthScores)}`,
    ]
    return parts.join('\n')
  }

  /** 根据行为信号计算衍生系统参数 */
  private computeDerivedParams(
    signals: BehaviorSignals,
    currentProfile: UserProfile,
  ): {
    autoForkTolerance: number
    intentDetectorSensitivity: number
    observerDebounceSec: number
    forkCooldownTurns: number
  } {
    // autoForkTolerance: 如果用户频繁撤销 fork，降低容忍度
    const totalForks = signals.forkUndoCount + signals.forkAcceptCount
    const undoRatio = totalForks > 0 ? signals.forkUndoCount / totalForks : 0
    const autoForkTolerance = clamp(
      currentProfile.autoForkTolerance + (undoRatio > 0.5 ? -0.1 : 0.05),
      0.1,
      0.9,
    )

    // intentDetectorSensitivity: 根据 undo 比率和切换频率调整
    const switchRate = signals.sessionDurationMinutes > 0
      ? signals.branchSwitchCount / signals.sessionDurationMinutes
      : 0
    const sensitivityDelta = undoRatio > 0.5 ? -0.1 : switchRate > 1 ? 0.05 : 0
    const intentDetectorSensitivity = clamp(
      currentProfile.intentDetectorSensitivity + sensitivityDelta,
      0.1,
      0.9,
    )

    // observerDebounceSec: 消息短且快 → 降低 debounce
    const observerDebounceSec = signals.averageMessageLength < 50
      ? Math.max(10, currentProfile.observerDebounceSec - 5)
      : Math.min(60, currentProfile.observerDebounceSec + 5)

    // forkCooldownTurns: undo 多 → 增加冷却
    const forkCooldownTurns = undoRatio > 0.5
      ? Math.min(10, currentProfile.forkCooldownTurns + 1)
      : Math.max(1, currentProfile.forkCooldownTurns - 1)

    return {
      autoForkTolerance,
      intentDetectorSensitivity,
      observerDebounceSec,
      forkCooldownTurns,
    }
  }

  /** 合并 insights，保留最新 5 条 */
  private mergeInsights(existing: string[], newInsights: string[]): string[] {
    const combined = [...newInsights, ...existing]
    // 去重
    const unique = [...new Set(combined)]
    return unique.slice(0, 5)
  }

  /** 解析 LLM 响应 */
  private parseResponse(content: string): {
    thinkingStyle?: UserProfile['thinkingStyle']
    topicSwitchFrequency?: UserProfile['topicSwitchFrequency']
    preferredOutputFormat?: OutputFormat
    detailLevel?: UserProfile['detailLevel']
    domainExpertise?: Record<string, 'expert' | 'intermediate' | 'novice'>
    insights?: string[]
  } {
    try {
      const cleaned = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return {}

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

      return {
        thinkingStyle: isThinkingStyle(parsed.thinkingStyle)
          ? parsed.thinkingStyle
          : undefined,
        topicSwitchFrequency: isFrequency(parsed.topicSwitchFrequency)
          ? parsed.topicSwitchFrequency
          : undefined,
        preferredOutputFormat: isOutputFormat(parsed.preferredOutputFormat)
          ? parsed.preferredOutputFormat
          : undefined,
        detailLevel: isDetailLevel(parsed.detailLevel)
          ? parsed.detailLevel
          : undefined,
        domainExpertise: typeof parsed.domainExpertise === 'object' && parsed.domainExpertise !== null
          ? (parsed.domainExpertise as Record<string, 'expert' | 'intermediate' | 'novice'>)
          : undefined,
        insights: Array.isArray(parsed.insights)
          ? (parsed.insights as string[])
          : undefined,
      }
    } catch {
      return {}
    }
  }
}

// ─── 辅助函数 ───

/** 将数值限制在范围内 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 类型守卫：thinkingStyle */
function isThinkingStyle(v: unknown): v is UserProfile['thinkingStyle'] {
  return v === 'divergent-first' || v === 'linear' || v === 'jumping'
}

/** 类型守卫：topicSwitchFrequency */
function isFrequency(v: unknown): v is UserProfile['topicSwitchFrequency'] {
  return v === 'high' || v === 'medium' || v === 'low'
}

/** 类型守卫：OutputFormat */
function isOutputFormat(v: unknown): v is OutputFormat {
  return v === 'outline' || v === 'comparison' || v === 'decision-matrix' ||
    v === 'checklist' || v === 'prose' || v === 'custom'
}

/** 类型守卫：detailLevel */
function isDetailLevel(v: unknown): v is UserProfile['detailLevel'] {
  return v === 'concise' || v === 'detailed'
}
