import type {
  DriftStorage,
  UserProfile,
  ThinkingStyle,
  DepthPreference,
  InteractionPattern,
  ResponsePreference,
  ProfileConfidence,
} from '@drift/storage'
import type { LLMAdapter, LLMMessage } from '@drift/core'
import type { BehaviorSignals } from '../types/index.js'

/** ProfileAgent 的系统提示词 — 对应 system prompt 文档中的 ProfileAgent agent */
const PROFILE_SYSTEM_PROMPT = `你是 Drift 对话系统中的用户画像分析器（ProfileAgent）。

通过观察用户的对话行为，构建持续更新的用户画像。画像是概率性推断，用"倾向于""偏好"而非"是""总是"。

Output ONLY valid JSON (no markdown fences, no extra text):
{
  "thinkingStyle": { "type": "divergent | convergent | balanced", "description": "一句话描述具体表现" },
  "depthPreference": { "type": "surface | moderate | deep", "description": "一句话描述具体表现" },
  "interactionPattern": { "type": "questioner | challenger | collaborator | director", "description": "一句话描述具体表现" },
  "focusAreas": [{ "topic": "关注领域", "level": "high | medium | low" }],
  "responsePreference": "concise | detailed | structured | conversational",
  "confidenceLevel": "provisional | developing | stable"
}

### 推断依据

思维风格：频繁开新分支→divergent，单分支深入→convergent，先发散再收敛→balanced
深度偏好：消息简短→surface，会追问细节→moderate，频繁追问"为什么""具体怎么做"→deep
交互模式：多疑问句→questioner，常质疑反驳→challenger，补充修正→collaborator，给指令→director
回复偏好：跳过长回复→concise，积极回应详细→detailed，要求列表表格→structured，口语化→conversational

### 规则
- 至少需要 3-5 条消息中的一致信号才能确认某个维度
- 早期数据量不足时 confidenceLevel = provisional，各维度可标 unknown
- focusAreas 从用户消息中提取实际讨论的话题，不推测
- 最多 5 个 focusAreas
- 增量更新：与上次画像对比，有变化才更新`

/** 默认用户画像 */
function defaultProfile(): UserProfile {
  return {
    thinkingStyle: { type: 'balanced', description: '数据不足，默认平衡型' },
    depthPreference: { type: 'moderate', description: '数据不足，默认适度深入' },
    interactionPattern: { type: 'collaborator', description: '数据不足，默认协作型' },
    focusAreas: [],
    responsePreference: 'structured',
    confidenceLevel: 'provisional',
    lastUpdated: new Date().toISOString(),
  }
}

/**
 * Profile Agent — 用户画像分析器（ProfileAgent）
 *
 * 根据用户对话行为分析用户画像，供其他 Agent 和系统消费。
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
    const existing = await this.storage.profile.get(userId)
    const currentProfile = existing ?? defaultProfile()

    const inputText = this.buildInput(currentProfile, signals)
    const messages: LLMMessage[] = [
      { role: 'system', content: PROFILE_SYSTEM_PROMPT },
      { role: 'user', content: inputText },
    ]

    const response = await this.llm.chat(messages, {
      temperature: 0.2,
      maxTokens: 1024,
    })

    const llmUpdate = this.parseResponse(response.content)

    const updatedProfile: UserProfile = {
      thinkingStyle: llmUpdate.thinkingStyle ?? currentProfile.thinkingStyle,
      depthPreference: llmUpdate.depthPreference ?? currentProfile.depthPreference,
      interactionPattern: llmUpdate.interactionPattern ?? currentProfile.interactionPattern,
      focusAreas: llmUpdate.focusAreas ?? currentProfile.focusAreas,
      responsePreference: llmUpdate.responsePreference ?? currentProfile.responsePreference,
      confidenceLevel: llmUpdate.confidenceLevel ?? currentProfile.confidenceLevel,
      lastUpdated: new Date().toISOString(),
    }

    await this.storage.profile.put(userId, updatedProfile)
    return updatedProfile
  }

  /** 组装 LLM 输入 */
  private buildInput(profile: UserProfile, signals: BehaviorSignals): string {
    const parts = [
      '## Current Profile',
      `Thinking Style: ${profile.thinkingStyle.type} — ${profile.thinkingStyle.description}`,
      `Depth Preference: ${profile.depthPreference.type} — ${profile.depthPreference.description}`,
      `Interaction Pattern: ${profile.interactionPattern.type} — ${profile.interactionPattern.description}`,
      `Focus Areas: ${profile.focusAreas.map((a) => `${a.topic}(${a.level})`).join(', ')}`,
      `Response Preference: ${profile.responsePreference}`,
      `Confidence Level: ${profile.confidenceLevel}`,
      '',
      '## Behavior Data',
      `Branch Count: ${signals.branchCount}`,
      `Avg Turns Per Branch: ${signals.avgTurnsPerBranch}`,
      `Switch Frequency: ${signals.switchFrequency}`,
      `Used Convergence: ${signals.usedConvergence}`,
      `Fork Undo Count: ${signals.forkUndoCount}`,
      `Fork Accept Count: ${signals.forkAcceptCount}`,
      '',
      '## Recent User Messages (sampled)',
    ]

    for (const msg of signals.recentMessages.slice(0, 10)) {
      parts.push(`[${msg.branchId}] ${msg.content}`)
    }

    return parts.join('\n')
  }

  /** 解析 LLM 响应 */
  private parseResponse(content: string): Partial<UserProfile> {
    try {
      const cleaned = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return {}

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      const result: Partial<UserProfile> = {}

      // thinkingStyle
      const ts = parsed.thinkingStyle as Record<string, unknown> | undefined
      if (ts && isThinkingStyle(ts.type)) {
        result.thinkingStyle = {
          type: ts.type,
          description: typeof ts.description === 'string' ? ts.description : '',
        }
      }

      // depthPreference
      const dp = parsed.depthPreference as Record<string, unknown> | undefined
      if (dp && isDepthPreference(dp.type)) {
        result.depthPreference = {
          type: dp.type,
          description: typeof dp.description === 'string' ? dp.description : '',
        }
      }

      // interactionPattern
      const ip = parsed.interactionPattern as Record<string, unknown> | undefined
      if (ip && isInteractionPattern(ip.type)) {
        result.interactionPattern = {
          type: ip.type,
          description: typeof ip.description === 'string' ? ip.description : '',
        }
      }

      // focusAreas
      if (Array.isArray(parsed.focusAreas)) {
        result.focusAreas = (parsed.focusAreas as Array<Record<string, unknown>>)
          .filter((a) => typeof a.topic === 'string')
          .map((a) => ({
            topic: a.topic as string,
            level: isFocusLevel(a.level) ? a.level : 'medium',
          }))
          .slice(0, 5)
      }

      // responsePreference
      if (isResponsePreference(parsed.responsePreference)) {
        result.responsePreference = parsed.responsePreference
      }

      // confidenceLevel
      if (isProfileConfidence(parsed.confidenceLevel)) {
        result.confidenceLevel = parsed.confidenceLevel
      }

      return result
    } catch {
      return {}
    }
  }
}

// ─── 类型守卫 ───

function isThinkingStyle(v: unknown): v is ThinkingStyle {
  return v === 'divergent' || v === 'convergent' || v === 'balanced'
}
function isDepthPreference(v: unknown): v is DepthPreference {
  return v === 'surface' || v === 'moderate' || v === 'deep'
}
function isInteractionPattern(v: unknown): v is InteractionPattern {
  return v === 'questioner' || v === 'challenger' || v === 'collaborator' || v === 'director'
}
function isResponsePreference(v: unknown): v is ResponsePreference {
  return v === 'concise' || v === 'detailed' || v === 'structured' || v === 'conversational'
}
function isProfileConfidence(v: unknown): v is ProfileConfidence {
  return v === 'provisional' || v === 'developing' || v === 'stable'
}
function isFocusLevel(v: unknown): v is 'high' | 'medium' | 'low' {
  return v === 'high' || v === 'medium' || v === 'low'
}
