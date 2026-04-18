/**
 * drift-agents 内部类型定义
 *
 * 从 @drift/storage 和 @drift/core 导入的类型在各模块中直接 import。
 * 本文件定义 drift-agents 独有的类型。
 */

// ─── 行为信号 ───

/** 用户行为信号，由应用层收集后传给 ProfileAgent */
export interface BehaviorSignals {
  /** fork 撤销次数 */
  forkUndoCount: number
  /** fork 接受次数 */
  forkAcceptCount: number
  /** 分支切换次数 */
  branchSwitchCount: number
  /** 用户消息平均长度 */
  averageMessageLength: number
  /** 本次会话使用过的收敛格式 */
  convergenceFormats: OutputFormat[]
  /** 会话持续时间（分钟） */
  sessionDurationMinutes: number
  /** 各话题的深度评分 */
  topicDepthScores: Record<string, number>
}

// ─── Intent 检测结果 ───

/** IntentDetector 的检测结果 */
export interface IntentResult {
  /** 意图类型：话题漂移 / 收敛 / 继续 */
  type: 'drift' | 'converge' | 'continue'
  /** 置信度 0-1 */
  confidence: number
  /** 漂移时自动生成的分支标签 */
  suggestedLabel?: string
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
