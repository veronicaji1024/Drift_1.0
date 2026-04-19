/**
 * drift-agents 内部类型定义
 *
 * 从 @drift/storage 和 @drift/core 导入的类型在各模块中直接 import。
 * 本文件定义 drift-agents 独有的类型。
 */

// ─── Intent 检测结果（对应 IntentAgent spec） ───

/** 意图类型 */
export type IntentType = 'continue' | 'fork' | 'backtrack'

/** 意图置信度 */
export type IntentConfidence = 'high' | 'medium' | 'low'

/** IntentDetector 的检测结果 */
export interface IntentResult {
  /** 意图类型：继续 / 开分支 / 回溯 */
  intent: IntentType
  /** 置信度 */
  confidence: IntentConfidence
  /** 新分支名称（仅 intent=fork 时） */
  forkLabel?: string
  /** 回溯目标话题关键词（仅 intent=backtrack 时） */
  backtrackHint?: string
  /** 面向用户的判断理由 */
  reasoning: string
}

// ─── 行为信号（ProfileAgent 输入） ───

/** 用户行为信号，由应用层收集后传给 ProfileAgent */
export interface BehaviorSignals {
  /** 用户对话历史采样（跨分支） */
  recentMessages: Array<{ branchId: string; content: string; timestamp: string }>
  /** 用户创建了多少个分支 */
  branchCount: number
  /** 平均每个分支对话多少轮 */
  avgTurnsPerBranch: number
  /** 分支切换频率（次/分钟） */
  switchFrequency: number
  /** 是否使用过收敛功能 */
  usedConvergence: boolean
  /** fork 撤销次数 */
  forkUndoCount: number
  /** fork 接受次数 */
  forkAcceptCount: number
}

// ─── Agent 任务 ───

/** 调度器中的任务单元 */
export interface AgentTask {
  /** agent 名称 */
  agent: string
  /** 优先级 */
  priority: 'high' | 'medium' | 'low'
  /** 关联分支 ID */
  branchId?: string
  /** 防抖间隔（毫秒） */
  debounceMs?: number
  /** 执行函数 */
  run: () => Promise<void>
}

// ─── 重新导出 storage 类型（方便内部使用） ───

import type { OutputFormat } from '@drift/storage'
export type { OutputFormat }
