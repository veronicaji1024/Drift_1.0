import type { DriftStorage, Message, Observation, BranchStage } from '@drift/storage'
import type { LLMAdapter, LLMMessage } from '@drift/core'

/** BranchContext 的系统提示词 — 对应 system prompt 文档中的 BranchContext agent */
const OBSERVER_SYSTEM_PROMPT = `你是 Drift 对话系统中的分支上下文理解器（BranchContext）。

你负责理解和追踪一条分支上所有节点的对话内容。你是这条分支的"记忆"——你知道这条分支从哪里开始、经历了什么、现在到了哪里、还可能往哪里走。

Output ONLY valid JSON (no markdown fences, no extra text):
{
  "topic": "一句话概括这条分支在讨论什么",
  "stage": "exploring | deepening | concluding | exhausted",
  "keyPoints": ["已确认的核心结论（最多5条）"],
  "openQuestions": ["待解问题（最多3条）"],
  "directionSignal": "基于最近对话判断的走向信号"
}

### stage 判断准则

- exploring: 还在发散，没有明确方向
- deepening: 已有方向，正在深入某个子话题（用户连续 ≥2 轮同一方向追问）
- concluding: 接近结论，核心观点基本成型（出现总结性语言或用户认可的结论）
- exhausted: 话题已充分讨论，继续对话的信息增益很低

### 非线性阶段变化

- 反驳（Rebuttal）：用户否定之前结论 → 被否定的 keyPoint 标注 [已推翻]，stage 可能回退
- 外部信息注入：用户从外部带入新信息 → 如果与已有 keyPoints 矛盾，stage 回退，矛盾点加入 openQuestions
- 确认（Confirmation）：用户直接认可 → 可以跳阶，exploring 直接到 concluding
- 子话题分裂：对话出现多个并行方向但未 fork → 在 directionSignal 中标注

### 规则
- topic 必须随对话演进动态更新
- keyPoints 只写已确认的结论或已推翻的结论（推翻需标注 [已推翻] 前缀）
- openQuestions 要具体，不写空话
- 如果分支只有 1-2 轮对话，stage 固定为 exploring，keyPoints 可以为空
- 输出语言与用户对话语言保持一致`

/** 生成 Observation ID */
function generateObservationId(): string {
  return `obs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Observer Agent — 分支上下文理解器（BranchContext）
 *
 * 读取分支的原始消息，调用 LLM 提取结构化的分支摘要。
 */
export class ObserverAgent {
  private llm: LLMAdapter
  private storage: DriftStorage

  constructor(llm: LLMAdapter, storage: DriftStorage) {
    this.llm = llm
    this.storage = storage
  }

  /** 对指定分支运行观察，产出 Observation */
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
    const existingObs = await this.storage.observations.getByBranch(branchId)
    const lastRange = existingObs.length > 0
      ? existingObs[existingObs.length - 1]?.messageRange ?? null
      : null

    const allMessages = await this.storage.messages.getByBranch(branchId)
    if (allMessages.length === 0) {
      return this.fallbackObservation(branchId)
    }

    const startIndex = lastRange ? lastRange[1] : 0
    const unobservedMessages = allMessages.slice(startIndex)

    if (unobservedMessages.length === 0) {
      return this.fallbackObservation(branchId)
    }

    const transcript = this.formatTranscript(unobservedMessages)

    const messages: LLMMessage[] = [
      { role: 'system', content: OBSERVER_SYSTEM_PROMPT },
      { role: 'user', content: transcript },
    ]

    const response = await this.llm.chat(messages, {
      temperature: 0.2,
      maxTokens: 1024,
    })

    const parsed = this.parseResponse(response.content)

    const observation: Observation = {
      id: generateObservationId(),
      branchId,
      topic: parsed.topic,
      stage: parsed.stage,
      keyPoints: parsed.keyPoints,
      openQuestions: parsed.openQuestions,
      directionSignal: parsed.directionSignal,
      messageRange: [startIndex, startIndex + unobservedMessages.length],
      timestamp: new Date().toISOString(),
      tokenCount: this.estimateTokens(transcript),
    }

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
    topic: string
    stage: BranchStage
    keyPoints: string[]
    openQuestions: string[]
    directionSignal: string
  } {
    const fallback = {
      topic: '',
      stage: 'exploring' as BranchStage,
      keyPoints: [],
      openQuestions: [],
      directionSignal: '',
    }

    try {
      const cleaned = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return fallback

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

      return {
        topic: typeof parsed.topic === 'string' ? parsed.topic : '',
        stage: isStage(parsed.stage) ? parsed.stage : 'exploring',
        keyPoints: Array.isArray(parsed.keyPoints) ? (parsed.keyPoints as string[]).slice(0, 5) : [],
        openQuestions: Array.isArray(parsed.openQuestions) ? (parsed.openQuestions as string[]).slice(0, 3) : [],
        directionSignal: typeof parsed.directionSignal === 'string' ? parsed.directionSignal : '',
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
      topic: '',
      stage: 'exploring',
      keyPoints: [],
      openQuestions: [],
      directionSignal: '',
      messageRange: [0, 0],
      timestamp: new Date().toISOString(),
      tokenCount: 0,
    }
  }
}

/** 类型守卫：BranchStage */
function isStage(v: unknown): v is BranchStage {
  return v === 'exploring' || v === 'deepening' || v === 'concluding' || v === 'exhausted'
}
