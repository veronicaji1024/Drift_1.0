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

/** 各格式的 LLM 指令 — 对应 system prompt 文档中 ConvergenceEngine 的 6 种格式 */
const FORMAT_INSTRUCTIONS: Record<OutputFormat, string> = {
  outline: `输出层级大纲，使用缩进列表。
每个主要章节对应一个分支方向。
属性每个要点到来源分支。
格式：markdown 缩进列表。`,

  'structured-summary': `输出结构化摘要，按主题分类。
格式：
## 主题 1：...
- 要点 1
- 待解问题：...

## 跨主题洞察
...`,

  comparison: `输出 markdown 对比表格。
行 = 对比维度（从各分支提取）。
列 = 被对比的方案/分支。
每个单元格包含该方案在该维度的观点。
附带核心差异和补充说明。`,

  'decision-matrix': `输出带权重的决策矩阵，markdown 表格格式。
行 = 备选方案（来自不同分支）。
列 = 评估维度（从 observations 推导）。
包含权重行和总分列。
附带推荐和推荐理由。`,

  'full-report': `输出完整报告，包含：
# 标题
## 背景
## 核心发现
## 详细分析（按子章节展开）
## 结论与建议`,

  custom: `Follow the user-provided template exactly.
Replace placeholders with actual content from the branches.
Maintain the template's structure and formatting.`,
}

/** 基础系统提示词 */
const CONVERGENCE_SYSTEM_PROMPT = `你是 Drift 对话系统中的收敛输出引擎（ConvergenceEngine）。

你的职责是将分散在多个分支中的对话成果，收敛为一份结构化的输出文档。

你是整理者，不是创作者——内容来自对话，不添加对话中没有的信息。

### 输出结构（所有格式通用）

1. 文档标题（简洁，不超过 20 字）
2. 概述（2-3 句话，标注信息来源分支数量）
3. 正文（按指定格式组织）
4. 信息缺口（如有）
5. 信息来源（列出各分支的核心贡献）

### 写作原则

- 保持中立，如实呈现各方观点
- 多个分支对同一问题有不同结论 → 并列展示，不擅自判断
- 有矛盾 → 明确标注分歧
- 被标记为 [已推翻] 的结论 → 从正文排除，但如果推翻过程有参考价值可简要提及
- 结论来自对话中已确认的共识，不自行推导
- 输出语言与源材料语言一致`

/**
 * Convergence Engine — 收敛输出引擎（ConvergenceEngine）
 *
 * 从多个分支的 Observations 和 GlobalMap 生成指定格式的交付物。
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

    // 如果没有 observations，回退读取原始消息
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

    const globalMap = await this.storage.globalMap.get()

    const inputText = this.buildInput(
      observationsByBranch,
      globalMap,
      format,
      customTemplate,
      fallbackMessages,
    )

    const messages: LLMMessage[] = [
      { role: 'system', content: CONVERGENCE_SYSTEM_PROMPT },
      { role: 'user', content: inputText },
    ]

    const response = await this.llm.chat(messages, {
      temperature: 0.4,
      maxTokens: 8192,
    })

    const deliverable: Deliverable = {
      id: generateDeliverableId(),
      branchIds,
      format,
      content: response.content,
      observationsUsed: observationIds,
      timestamp: new Date().toISOString(),
    }

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
    parts.push(`## 输出格式\n${formatInstruction}`)

    // 分支 Observations
    if (observationsByBranch.size > 0) {
      parts.push('\n## 分支摘要（来自 BranchContext）')
      for (const [branchId, observations] of observationsByBranch) {
        parts.push(`\n### 分支: ${branchId}`)
        for (const obs of observations) {
          parts.push(`主题: ${obs.topic}`)
          parts.push(`阶段: ${obs.stage}`)
          parts.push(`关键结论: ${obs.keyPoints.join('; ')}`)
          parts.push(`待解问题: ${obs.openQuestions.join('; ')}`)
          parts.push(`走向: ${obs.directionSignal}`)
        }
      }
    } else if (fallbackMessages && fallbackMessages.size > 0) {
      parts.push('\n## 分支原始消息（无摘要可用）')
      for (const [branchId, messages] of fallbackMessages) {
        parts.push(`\n### 分支: ${branchId}`)
        for (const msg of messages) {
          if (msg.role !== 'system') {
            parts.push(`[${msg.role}]: ${msg.content}`)
          }
        }
      }
    }

    // GlobalMap 信息
    if (globalMap) {
      // 跨主题关联
      if (globalMap.crossThemeConnections.length > 0) {
        parts.push('\n## 跨主题关联')
        for (const conn of globalMap.crossThemeConnections) {
          parts.push(`- [${conn.branchIds.join(', ')}]: ${conn.nature} — ${conn.significance}`)
        }
      }

      // 分支关系
      if (globalMap.branchLandscape.relations.length > 0) {
        parts.push('\n## 分支间关系')
        for (const rel of globalMap.branchLandscape.relations) {
          parts.push(`- ${rel.branchIdA} ↔ ${rel.branchIdB}: ${rel.types.join(', ')}`)
        }
      }

      // 探索覆盖度
      if (globalMap.explorationCoverage.blindSpots.length > 0) {
        parts.push('\n## 信息缺口（盲区）')
        for (const spot of globalMap.explorationCoverage.blindSpots) {
          parts.push(`- ${spot}`)
        }
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
