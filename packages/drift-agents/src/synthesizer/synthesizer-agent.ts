import type {
  DriftStorage,
  GlobalMap,
  BranchSummary,
  BranchRelation,
  BranchRelationType,
  CrossThemeConnection,
  NavigationSuggestion,
  NavigationAction,
  ConvergenceReadiness,
  Observation,
  BranchTreeNode,
  BranchStage,
} from '@drift/storage'
import type { LLMAdapter, LLMMessage } from '@drift/core'

/** ContextKeeper 的系统提示词 — 对应 system prompt 文档中的 ContextKeeper agent */
const SYNTHESIZER_SYSTEM_PROMPT = `你是 Drift 对话系统中的全局对话守望者（ContextKeeper）。

你站在"上帝视角"，通过每个分支的 BranchContext 摘要来感知全局状态。

Output ONLY valid JSON (no markdown fences, no extra text):
{
  "overallTheme": {
    "mainTopics": ["贯穿多个分支的核心议题"],
    "sideTopics": ["局部探索的支线议题"]
  },
  "branchLandscape": {
    "summaries": [
      {
        "branchId": "branch-id",
        "topicSentence": "一句话概括该分支主题",
        "stage": "exploring | deepening | concluding | exhausted",
        "role": "该分支在整体对话中扮演的角色"
      }
    ],
    "relations": [
      {
        "branchIdA": "branch-a",
        "branchIdB": "branch-b",
        "types": ["complementary | competing | progressive | derived | contradictory | supporting | independent"]
      }
    ]
  },
  "crossThemeConnections": [
    {
      "branchIds": ["branch-a", "branch-b"],
      "nature": "关联的性质",
      "significance": "为什么值得关注"
    }
  ],
  "explorationCoverage": {
    "wellExplored": ["已充分讨论的方向"],
    "justStarted": ["刚开始探索的方向"],
    "blindSpots": ["应该讨论但还没讨论的方向"]
  },
  "convergenceReadiness": {
    "status": "not_ready | partially_ready | ready",
    "reason": "一句话说明理由"
  },
  "navigationSuggestions": [
    {
      "action": "deep_dive | new_direction | jump | converge",
      "target": "具体目标描述",
      "reasoning": "面向用户的理由"
    }
  ]
}

### 关系类型说明
- complementary: 从不同角度探讨同一问题
- competing: 探讨了互斥的方案
- progressive: 一个是另一个的深入或延展
- derived: 基于另一个的结论去探索新问题
- contradictory: 各自得出了不兼容的结论
- supporting: 一个的结论为另一个提供论据
- independent: 不同话题，无明显关联

### 导航建议生成逻辑
- 当前分支 exploring → 建议 deep_dive
- 当前分支 deepening + 子话题分裂 → 建议 new_direction 拆分
- 当前分支 concluding → 建议 new_direction 或 converge
- 当前分支 exhausted → 建议 new_direction 或 jump
- convergenceReadiness = ready → 第一条必须是 converge
- 存在 contradictory 关系 → 在 converge 前建议 jump 到矛盾分支
- 最多 3 条建议

### 规则
- 关系判断必须基于 topic 和 keyPoints 的语义分析，不要只看分支名
- 导航建议的 reasoning 面向用户，用自然语言
- 如果只有 1 个分支且 stage = exploring，输出精简版
- 输出语言与用户对话语言保持一致`

/**
 * Synthesizer Agent — 全局对话守望者（ContextKeeper）
 *
 * 读取所有分支的 Observations 和树结构，产出 GlobalMap。
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
    const tree = await this.storage.branches.getTree()
    const allObservations = await this.storage.observations.getAll()

    if (allObservations.length === 0) {
      return this.fallbackGlobalMap()
    }

    const obsByBranch = this.groupByBranch(allObservations)
    const inputText = this.buildInput(tree, obsByBranch)

    const messages: LLMMessage[] = [
      { role: 'system', content: SYNTHESIZER_SYSTEM_PROMPT },
      { role: 'user', content: inputText },
    ]

    const response = await this.llm.chat(messages, {
      temperature: 0.3,
      maxTokens: 4096,
    })

    const parsed = this.parseResponse(response.content)

    const globalMap: GlobalMap = {
      overallTheme: parsed.overallTheme,
      branchLandscape: parsed.branchLandscape,
      crossThemeConnections: parsed.crossThemeConnections,
      explorationCoverage: parsed.explorationCoverage,
      convergenceReadiness: parsed.convergenceReadiness,
      navigationSuggestions: parsed.navigationSuggestions,
      timestamp: new Date().toISOString(),
    }

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

    parts.push('## Branch Tree Structure')
    parts.push(this.renderTree(tree, 0))

    parts.push('\n## Branch Observations (from BranchContext)')
    for (const [branchId, observations] of obsByBranch) {
      parts.push(`\n### Branch: ${branchId}`)
      for (const obs of observations) {
        parts.push(`Topic: ${obs.topic}`)
        parts.push(`Stage: ${obs.stage}`)
        parts.push(`Key Points: ${obs.keyPoints.join('; ')}`)
        parts.push(`Open Questions: ${obs.openQuestions.join('; ')}`)
        parts.push(`Direction Signal: ${obs.directionSignal}`)
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
    overallTheme: GlobalMap['overallTheme']
    branchLandscape: GlobalMap['branchLandscape']
    crossThemeConnections: CrossThemeConnection[]
    explorationCoverage: GlobalMap['explorationCoverage']
    convergenceReadiness: GlobalMap['convergenceReadiness']
    navigationSuggestions: NavigationSuggestion[]
  } {
    const fallback = {
      overallTheme: { mainTopics: [], sideTopics: [] },
      branchLandscape: { summaries: [], relations: [] },
      crossThemeConnections: [],
      explorationCoverage: { wellExplored: [], justStarted: [], blindSpots: [] },
      convergenceReadiness: { status: 'not_ready' as ConvergenceReadiness, reason: '' },
      navigationSuggestions: [],
    }

    try {
      const cleaned = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return fallback

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

      const overallTheme = parsed.overallTheme as Record<string, unknown> | undefined
      const branchLandscape = parsed.branchLandscape as Record<string, unknown> | undefined
      const convergenceReadiness = parsed.convergenceReadiness as Record<string, unknown> | undefined
      const explorationCoverage = parsed.explorationCoverage as Record<string, unknown> | undefined

      return {
        overallTheme: {
          mainTopics: Array.isArray(overallTheme?.mainTopics) ? overallTheme.mainTopics as string[] : [],
          sideTopics: Array.isArray(overallTheme?.sideTopics) ? overallTheme.sideTopics as string[] : [],
        },
        branchLandscape: {
          summaries: Array.isArray(branchLandscape?.summaries)
            ? this.validateSummaries(branchLandscape.summaries as BranchSummary[])
            : [],
          relations: Array.isArray(branchLandscape?.relations)
            ? this.validateRelations(branchLandscape.relations as BranchRelation[])
            : [],
        },
        crossThemeConnections: Array.isArray(parsed.crossThemeConnections)
          ? (parsed.crossThemeConnections as CrossThemeConnection[])
          : [],
        explorationCoverage: {
          wellExplored: Array.isArray(explorationCoverage?.wellExplored) ? explorationCoverage.wellExplored as string[] : [],
          justStarted: Array.isArray(explorationCoverage?.justStarted) ? explorationCoverage.justStarted as string[] : [],
          blindSpots: Array.isArray(explorationCoverage?.blindSpots) ? explorationCoverage.blindSpots as string[] : [],
        },
        convergenceReadiness: {
          status: isConvergenceReadiness(convergenceReadiness?.status) ? convergenceReadiness.status : 'not_ready',
          reason: typeof convergenceReadiness?.reason === 'string' ? convergenceReadiness.reason : '',
        },
        navigationSuggestions: Array.isArray(parsed.navigationSuggestions)
          ? this.validateSuggestions(parsed.navigationSuggestions as NavigationSuggestion[])
          : [],
      }
    } catch {
      return fallback
    }
  }

  /** 验证 BranchSummary 数组 */
  private validateSummaries(summaries: BranchSummary[]): BranchSummary[] {
    return summaries.filter((s) =>
      typeof s.branchId === 'string' &&
      typeof s.topicSentence === 'string',
    )
  }

  /** 验证 BranchRelation 数组 */
  private validateRelations(relations: BranchRelation[]): BranchRelation[] {
    return relations.filter((r) =>
      typeof r.branchIdA === 'string' &&
      typeof r.branchIdB === 'string' &&
      Array.isArray(r.types),
    )
  }

  /** 验证 NavigationSuggestion 数组 */
  private validateSuggestions(suggestions: NavigationSuggestion[]): NavigationSuggestion[] {
    return suggestions.filter((s) =>
      isNavigationAction(s.action) &&
      typeof s.target === 'string' &&
      typeof s.reasoning === 'string',
    ).slice(0, 3)
  }

  /** 回退的空 GlobalMap */
  private fallbackGlobalMap(): GlobalMap {
    return {
      overallTheme: { mainTopics: [], sideTopics: [] },
      branchLandscape: { summaries: [], relations: [] },
      crossThemeConnections: [],
      explorationCoverage: { wellExplored: [], justStarted: [], blindSpots: [] },
      convergenceReadiness: { status: 'not_ready', reason: '' },
      navigationSuggestions: [],
      timestamp: new Date().toISOString(),
    }
  }
}

/** 类型守卫：ConvergenceReadiness */
function isConvergenceReadiness(v: unknown): v is ConvergenceReadiness {
  return v === 'not_ready' || v === 'partially_ready' || v === 'ready'
}

/** 类型守卫：NavigationAction */
function isNavigationAction(v: unknown): v is NavigationAction {
  return v === 'deep_dive' || v === 'new_direction' || v === 'jump' || v === 'converge'
}
