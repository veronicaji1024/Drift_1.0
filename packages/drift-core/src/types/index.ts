import type { Branch, ForkRecord, Observation, GlobalMap, ToolCall } from '@drift/storage'

// ─── 事件类型 ──────────────────────────────────────────────────

/** drift-core 所有事件的联合类型 */
export type DriftEvent =
  | { type: 'message:appended'; branchId: string; messageId: string }
  | { type: 'message:moved'; messageId: string; from: string; to: string }
  | { type: 'branch:created'; branch: Branch; auto: boolean }
  | { type: 'branch:merged'; sourceId: string; targetId: string }
  | { type: 'branch:archived'; branchId: string }
  | { type: 'fork:undone'; forkRecord: ForkRecord }
  | { type: 'fork:created'; forkRecord: ForkRecord }
  | { type: 'observation:created'; observation: Observation }
  | { type: 'globalmap:updated'; globalMap: GlobalMap }
  | { type: 'branch:switched'; from: string; to: string }

/** 从 DriftEvent 联合类型中提取指定 type 的事件 */
export type DriftEventByType<T extends DriftEvent['type']> = Extract<DriftEvent, { type: T }>

/** 事件处理函数 */
export type DriftEventHandler<T extends DriftEvent['type']> = (event: DriftEventByType<T>) => void

// ─── LLM 相关类型 ────────────────────────────────────────────

/** LLM 消息格式 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** LLM 调用选项 */
export interface LLMOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  tools?: ToolDefinition[]
}

/** LLM 完整响应 */
export interface LLMResponse {
  content: string
  toolCalls?: ToolCall[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/** LLM 流式响应片段 */
export interface LLMChunk {
  delta: string
  toolCallDeltas?: Array<{
    index: number
    id?: string
    name?: string
    input?: string
  }>
}

/** LLM 适配器接口 */
export interface LLMAdapter {
  /** 同步调用 LLM */
  chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>
  /** 流式调用 LLM（可选） */
  stream?(messages: LLMMessage[], options?: LLMOptions): AsyncIterable<LLMChunk>
}

/** 工具定义 */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** LLM 返回的工具调用记录（与 @drift/storage 的 ToolCall 对齐） */
export type { ToolCall } from '@drift/storage'

// ─── Fork 选项 ───────────────────────────────────────────────

/** fork 操作的配置选项 */
export interface ForkOptions {
  /** 新分支标签 */
  label?: string
  /** 是否继承父分支上下文（到 forkMessageId 为止的消息） */
  inheritContext?: boolean
  /** 是否为自动触发的 fork */
  auto?: boolean
}

/** 合并策略 */
export type MergeStrategy = 'interleave' | 'append'
