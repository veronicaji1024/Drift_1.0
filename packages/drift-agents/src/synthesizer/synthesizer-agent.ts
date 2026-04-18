import type {
  DriftStorage,
  GlobalMap,
  BranchSummary,
  CrossBranchInsight,
  NavigationHint,
  Observation,
  BranchTreeNode,
} from '@drift/storage'
import type { LLMAdapter, LLMMessage } from '@drift/core'

/** Synthesizer 的系统提示词 */
const SYNTHESIZER_SYSTEM_PROMPT = `You are a cross-branch synthesis agent. Given a tree of conversation branches with their observations, produce a GlobalMap that captures the big picture.

Output ONLY valid JSON (no markdown fences, no extra text):
{
  "branchSummaries": [
    {
      "branchId": "branch-id",
      "topicSentence": "One sentence describing what this branch is about",
      "relationToParent": "How this branch relates to its parent branch",
      "relationToRoot": "How this branch relates to the root topic",
      "status": "exploring | converging | concluded"
    }
  ],
  "crossBranchInsights": [
    {
      "branchIds": ["branch-a", "branch-b"],
      "insight": "What these branches have in common or how they contradict"
    }
  ],
  "navigationHints": [
    {
      "fromBranchId": "branch-a",
      "toBranchId": "branch-b",
      "reason": "Why the user might want to jump",
      "relevance": 0.8,
      "trigger": "topic_overlap | open_question_answered | contradiction | dependency"
    }
  ],
  "overallProgress": "A one-sentence assessment of overall task progress"
}

Rules:
- branchSummaries: one entry per branch that has observations
- crossBranchInsights: only include genuinely useful correlations
- navigationHints: relevance is 0-1, only include if relevance >= 0.5
- status: "exploring" = still diverging, "converging" = narrowing down, "concluded" = done
- Support both Chinese and English content`

/**
 * Synthesizer Agent — 跨分支关联分析
 *
 * 读取所有分支的 T1 Observations 和树结构，产出 GlobalMap (T2)。
 * 使用中等模型层级（Sonnet / 4o）。
 */
export class SynthesizerAgent {
  private llm: LLMAdapter
  private storage: DriftStorage

  constructor(llm: LLMAdapter, storage: DriftStorage) {
    this.llm = llm
    this.storage = storage
  }

  /** 运行跨分支综合分析，产出 GlobalMap */
  async run(): Promise<GlobalMap> {
    try {
      return await this.doRun()
    } catch (error) {
      console.error('[SynthesizerAgent] Failed:', error)
      return this.fallbackGlobalMap()
    }
  }

  /** 核心执行逻辑 */
  private async doRun(): Promise<GlobalMap> {
    // 读取树结构和所有 observations
    const tree = await this.storage.branches.getTree()
    const allObservations = await this.storage.observations.getAll()

    if (allObservations.length === 0) {
      return this.fallbackGlobalMap()
    }

    // 按分支分组 observations
    const obsByBranch = this.groupByBranch(allObservations)

    // 构造输入文本
    const inputText = this.buildInput(tree, obsByBranch)

    // 调用 LLM
    const messages: LLMMessage[] = [
      { role: 'system', content: SYNTHESIZER_SYSTEM_PROMPT },
      { role: 'user', content: inputText },
    ]

    const response = await this.llm.chat(messages, {
      temperature: 0.3,
      maxTokens: 4096,
    })

    // 解析响应
    const parsed = this.parseResponse(response.content)

    const globalMap: GlobalMap = {
      branchSummaries: parsed.branchSummaries,
      crossBranchInsights: parsed.crossBranchInsights,
      navigationHints: parsed.navigationHints,
      overallProgress: parsed.overallProgress,
      timestamp: new Date().toISOString(),
    }

    // 持久化 GlobalMap
    await this.storage.globalMap.put(globalMap)

    return globalMap
  }

  /** 按分支 ID 分组 observations */
  private groupByBranch(observations: Observation[]): Map<string, Observation[]> {
    const grouped = new Map<string, Observation[]>()
    for (const obs of observations) {
      const existing = grouped.get(obs.branchId) ?? []
      existing.push(obs)
      grouped.set(obs.branchId, existing)
    }
    return grouped
  }

  /** 将树结构和 observations 组装为 LLM 输入 */
  private buildInput(tree: BranchTreeNode, obsByBranch: Map<string, Observation[]>): string {
    const parts: string[] = []

    // 树结构
    parts.push('## Branch Tree Structure')
    parts.push(this.renderTree(tree, 0))

    // 各分支的 observations
    parts.push('\n## Branch Observations')
    for (const [branchId, observations] of obsByBranch) {
      parts.push(`\n### Branch: ${branchId}`)
      for (const obs of observations) {
        parts.push(`Topics: ${obs.topics.join(', ')}`)
        parts.push(`Facts: ${obs.facts.join('; ')}`)
        parts.push(`Decisions: ${obs.decisions.join('; ')}`)
        parts.push(`Open Questions: ${obs.openQuestions.join('; ')}`)
        parts.push(`Current Task: ${obs.currentTask}`)
      }
    }

    return parts.join('\n')
  }

  /** 递归渲染树结构为缩进文本 */
  private renderTree(node: BranchTreeNode, depth: number): string {
    const indent = '  '.repeat(depth)
    const lines = [`${indent}- [${node.id}] ${node.label} (${node.status})`]
    for (const child of node.children) {
      lines.push(this.renderTree(child, depth + 1))
    }
    return lines.join('\n')
  }

  /** 解析 LLM 的 JSON 响应，带容错 */
  private parseResponse(content: string): {
    branchSummaries: BranchSummary[]
    crossBranchInsights: CrossBranchInsight[]
    navigationHints: NavigationHint[]
    overallProgress: string
  } {
    const fallback = {
      branchSummaries: [],
      crossBranchInsights: [],
      navigationHints: [],
      overallProgress: '',
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
        branchSummaries: Array.isArray(parsed.branchSummaries)
          ? (parsed.branchSummaries as BranchSummary[])
          : [],
        crossBranchInsights: Array.isArray(parsed.crossBranchInsights)
          ? (parsed.crossBranchInsights as CrossBranchInsight[])
          : [],
        navigationHints: Array.isArray(parsed.navigationHints)
          ? this.validateNavigationHints(parsed.navigationHints as NavigationHint[])
          : [],
        overallProgress: typeof parsed.overallProgress === 'string'
          ? parsed.overallProgress
          : '',
      }
    } catch {
      return fallback
    }
  }

  /** 过滤低相关度的导航提示 */
  private validateNavigationHints(hints: NavigationHint[]): NavigationHint[] {
    return hints.filter((h) =>
      typeof h.relevance === 'number' &&
      h.relevance >= 0.5 &&
      typeof h.fromBranchId === 'string' &&
      typeof h.toBranchId === 'string',
    )
  }

  /** 回退的空 GlobalMap */
  private fallbackGlobalMap(): GlobalMap {
    return {
      branchSummaries: [],
      crossBranchInsights: [],
      navigationHints: [],
      overallProgress: '',
      timestamp: new Date().toISOString(),
    }
  }
}
