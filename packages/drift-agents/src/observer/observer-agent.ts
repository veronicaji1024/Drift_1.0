import type { DriftStorage, Message, Observation } from '@drift/storage'
import type { LLMAdapter, LLMMessage } from '@drift/core'

/** Observer 的系统提示词 */
const OBSERVER_SYSTEM_PROMPT = `You are an observation agent. Given a conversation transcript from a single branch, extract structured observations.

Output ONLY valid JSON (no markdown fences, no extra text):
{
  "topics": ["topic1", "topic2"],
  "facts": ["confirmed fact 1"],
  "decisions": ["decision made"],
  "openQuestions": ["unanswered question"],
  "currentTask": "what the user is currently working on"
}

Rules:
- Each item should be one concise sentence
- Focus on what matters for future reference
- topics: main themes discussed
- facts: confirmed information (not opinions)
- decisions: explicit choices made
- openQuestions: questions raised but not yet answered
- currentTask: what the user is actively working on right now (empty string if unclear)
- Support both Chinese and English content`

/** 生成 Observation ID */
function generateObservationId(): string {
  return `obs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Observer Agent — 单分支对话压缩器
 *
 * 读取分支的 T0 消息，调用 LLM 提取结构化 T1 Observation。
 * 使用便宜/快速的模型层级。
 */
export class ObserverAgent {
  private llm: LLMAdapter
  private storage: DriftStorage

  constructor(llm: LLMAdapter, storage: DriftStorage) {
    this.llm = llm
    this.storage = storage
  }

  /** 对指定分支运行观察，产出结构化 Observation */
  async run(branchId: string): Promise<Observation> {
    try {
      return await this.doRun(branchId)
    } catch (error) {
      console.error(`[ObserverAgent] Failed for branch ${branchId}:`, error)
      return this.fallbackObservation(branchId)
    }
  }

  /** 核心执行逻辑 */
  private async doRun(branchId: string): Promise<Observation> {
    // 获取该分支已有的 observations，确定从哪里开始
    const existingObs = await this.storage.observations.getByBranch(branchId)
    const lastRange = existingObs.length > 0
      ? existingObs[existingObs.length - 1].messageRange
      : null

    // 读取分支消息
    const allMessages = await this.storage.messages.getByBranch(branchId)
    if (allMessages.length === 0) {
      return this.fallbackObservation(branchId)
    }

    // 从上次观察结束位置之后开始
    const startIndex = lastRange ? lastRange[1] : 0
    const unobservedMessages = allMessages.slice(startIndex)

    if (unobservedMessages.length === 0) {
      return this.fallbackObservation(branchId)
    }

    // 组装对话文本
    const transcript = this.formatTranscript(unobservedMessages)

    // 调用 LLM
    const messages: LLMMessage[] = [
      { role: 'system', content: OBSERVER_SYSTEM_PROMPT },
      { role: 'user', content: transcript },
    ]

    const response = await this.llm.chat(messages, {
      temperature: 0.2,
      maxTokens: 1024,
    })

    // 解析 JSON 输出
    const parsed = this.parseResponse(response.content)

    // 构造 Observation
    const observation: Observation = {
      id: generateObservationId(),
      branchId,
      topics: parsed.topics,
      facts: parsed.facts,
      decisions: parsed.decisions,
      openQuestions: parsed.openQuestions,
      currentTask: parsed.currentTask,
      messageRange: [startIndex, startIndex + unobservedMessages.length],
      timestamp: new Date().toISOString(),
      tokenCount: this.estimateTokens(transcript),
    }

    // 持久化
    await this.storage.observations.append(observation)

    return observation
  }

  /** 将消息列表格式化为对话文本 */
  private formatTranscript(messages: Message[]): string {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n')
  }

  /** 解析 LLM 的 JSON 响应，带容错 */
  private parseResponse(content: string): {
    topics: string[]
    facts: string[]
    decisions: string[]
    openQuestions: string[]
    currentTask: string
  } {
    const fallback = {
      topics: [],
      facts: [],
      decisions: [],
      openQuestions: [],
      currentTask: '',
    }

    try {
      // 清除可能的 markdown 围栏
      const cleaned = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return fallback

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

      return {
        topics: Array.isArray(parsed.topics) ? (parsed.topics as string[]) : [],
        facts: Array.isArray(parsed.facts) ? (parsed.facts as string[]) : [],
        decisions: Array.isArray(parsed.decisions) ? (parsed.decisions as string[]) : [],
        openQuestions: Array.isArray(parsed.openQuestions) ? (parsed.openQuestions as string[]) : [],
        currentTask: typeof parsed.currentTask === 'string' ? parsed.currentTask : '',
      }
    } catch {
      return fallback
    }
  }

  /** 简单的 token 估算（按字符数 / 4） */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  /** 回退的空 Observation */
  private fallbackObservation(branchId: string): Observation {
    return {
      id: generateObservationId(),
      branchId,
      topics: [],
      facts: [],
      decisions: [],
      openQuestions: [],
      currentTask: '',
      messageRange: [0, 0],
      timestamp: new Date().toISOString(),
      tokenCount: 0,
    }
  }
}
