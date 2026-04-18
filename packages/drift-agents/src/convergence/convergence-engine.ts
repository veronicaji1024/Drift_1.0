import type {
  DriftStorage,
  Observation,
  GlobalMap,
  OutputFormat,
  Deliverable,
  Message,
} from '@drift/storage'
import type { LLMAdapter, LLMMessage } from '@drift/core'

/** 生成 Deliverable ID */
function generateDeliverableId(): string {
  return `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 各格式的 LLM 指令 */
const FORMAT_INSTRUCTIONS: Record<OutputFormat, string> = {
  outline: `Output a hierarchical outline using nested bullet points.
Each major section should correspond to a branch. Indent sub-points under each section.
Attribute each point to its source branch using [branch-id] prefix.
Format: markdown outline with - and indentation.`,

  comparison: `Output a comparison table in markdown format.
Rows = criteria/dimensions found across branches.
Columns = branches being compared.
Each cell should contain the branch's stance or finding on that criterion.
Format: markdown table.`,

  'decision-matrix': `Output a weighted decision matrix in markdown table format.
Rows = options/alternatives from different branches.
Columns = evaluation criteria (derived from observations).
Include a "Weight" row at the top. Include a "Score" column at the right.
Format: markdown table with scores.`,

  checklist: `Output an action-item checklist compiled from all branches.
Group items by branch or by theme.
Mark items as [ ] (todo) or [x] (done, if decisions were made).
Include priority indicators: 🔴 high, 🟡 medium, 🟢 low.
Format: markdown checklist.`,

  prose: `Output a narrative summary that weaves together findings from all branches.
Flow naturally between topics. Reference branch sources inline.
Include an opening summary paragraph and a closing section with next steps.
Format: flowing prose paragraphs.`,

  custom: `Follow the user-provided template exactly.
Replace placeholders with actual content from the branches.
Maintain the template's structure and formatting.`,
}

/** 基础系统提示词 */
const CONVERGENCE_SYSTEM_PROMPT = `You are a convergence engine. Given observations and insights from multiple conversation branches, produce a structured deliverable.

You will receive:
1. Observations (T1) from each selected branch
2. The GlobalMap with cross-branch insights (if available)
3. Format-specific instructions

Rules:
- Be thorough but concise
- Attribute information to source branches
- Highlight cross-branch connections and contradictions
- Support both Chinese and English content — match the language of the source material`

/**
 * Convergence Engine — 结构化交付物生成器
 *
 * 从多个分支的 T1 Observations 和 GlobalMap 生成指定格式的交付物。
 * 使用强模型层级（Opus / 4）。
 */
export class ConvergenceEngine {
  private llm: LLMAdapter
  private storage: DriftStorage

  constructor(llm: LLMAdapter, storage: DriftStorage) {
    this.llm = llm
    this.storage = storage
  }

  /** 为选定分支生成指定格式的结构化交付物 */
  async generate(
    branchIds: string[],
    format: OutputFormat,
    customTemplate?: string,
  ): Promise<Deliverable> {
    try {
      return await this.doGenerate(branchIds, format, customTemplate)
    } catch (error) {
      console.error('[ConvergenceEngine] Failed:', error)
      return this.fallbackDeliverable(branchIds, format)
    }
  }

  /** 核心执行逻辑 */
  private async doGenerate(
    branchIds: string[],
    format: OutputFormat,
    customTemplate?: string,
  ): Promise<Deliverable> {
    // 收集各分支的 observations
    const observationsByBranch = new Map<string, Observation[]>()
    const observationIds: string[] = []

    for (const branchId of branchIds) {
      const obs = await this.storage.observations.getByBranch(branchId)
      if (obs.length > 0) {
        observationsByBranch.set(branchId, obs)
        for (const o of obs) {
          observationIds.push(o.id)
        }
      }
    }

    // 如果没有 T1，回退读取 T0 原始消息
    let fallbackMessages: Map<string, Message[]> | undefined
    if (observationsByBranch.size === 0) {
      fallbackMessages = new Map()
      for (const branchId of branchIds) {
        const msgs = await this.storage.messages.getByBranch(branchId)
        if (msgs.length > 0) {
          fallbackMessages.set(branchId, msgs)
        }
      }
    }

    // 读取 GlobalMap
    const globalMap = await this.storage.globalMap.get()

    // 组装 LLM 输入
    const inputText = this.buildInput(
      observationsByBranch,
      globalMap,
      format,
      customTemplate,
      fallbackMessages,
    )

    // 调用 LLM
    const messages: LLMMessage[] = [
      { role: 'system', content: CONVERGENCE_SYSTEM_PROMPT },
      { role: 'user', content: inputText },
    ]

    const response = await this.llm.chat(messages, {
      temperature: 0.4,
      maxTokens: 8192,
    })

    // 构造 Deliverable
    const deliverable: Deliverable = {
      id: generateDeliverableId(),
      branchIds,
      format,
      content: response.content,
      observationsUsed: observationIds,
      timestamp: new Date().toISOString(),
    }

    // 持久化
    await this.storage.deliverables.save(deliverable)

    return deliverable
  }

  /** 组装 LLM 输入文本 */
  private buildInput(
    observationsByBranch: Map<string, Observation[]>,
    globalMap: GlobalMap | null,
    format: OutputFormat,
    customTemplate?: string,
    fallbackMessages?: Map<string, Message[]>,
  ): string {
    const parts: string[] = []

    // 格式指令
    const formatInstruction = format === 'custom' && customTemplate
      ? `${FORMAT_INSTRUCTIONS.custom}\n\nTemplate:\n${customTemplate}`
      : FORMAT_INSTRUCTIONS[format]
    parts.push(`## Output Format\n${formatInstruction}`)

    // 分支 Observations
    if (observationsByBranch.size > 0) {
      parts.push('\n## Branch Observations')
      for (const [branchId, observations] of observationsByBranch) {
        parts.push(`\n### Branch: ${branchId}`)
        for (const obs of observations) {
          parts.push(`Topics: ${obs.topics.join(', ')}`)
          parts.push(`Facts: ${obs.facts.join('; ')}`)
          parts.push(`Decisions: ${obs.decisions.join('; ')}`)
          parts.push(`Open Questions: ${obs.openQuestions.join('; ')}`)
          parts.push(`Current Task: ${obs.currentTask}`)
        }
      }
    } else if (fallbackMessages && fallbackMessages.size > 0) {
      // 回退：使用原始消息
      parts.push('\n## Branch Messages (raw — no observations available)')
      for (const [branchId, messages] of fallbackMessages) {
        parts.push(`\n### Branch: ${branchId}`)
        for (const msg of messages) {
          if (msg.role !== 'system') {
            parts.push(`[${msg.role}]: ${msg.content}`)
          }
        }
      }
    }

    // GlobalMap（如果有）
    if (globalMap) {
      parts.push('\n## Cross-Branch Insights')
      for (const insight of globalMap.crossBranchInsights) {
        parts.push(`- [${insight.branchIds.join(', ')}]: ${insight.insight}`)
      }
      if (globalMap.overallProgress) {
        parts.push(`\nOverall Progress: ${globalMap.overallProgress}`)
      }
    }

    return parts.join('\n')
  }

  /** 回退的空 Deliverable */
  private fallbackDeliverable(branchIds: string[], format: OutputFormat): Deliverable {
    return {
      id: generateDeliverableId(),
      branchIds,
      format,
      content: '无法生成交付物，请稍后重试。',
      observationsUsed: [],
      timestamp: new Date().toISOString(),
    }
  }
}
