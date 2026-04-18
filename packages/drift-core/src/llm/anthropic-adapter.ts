import type { LLMAdapter, LLMMessage, LLMOptions, LLMResponse } from '../types/index.js'

/** Anthropic Messages API 请求体 */
interface AnthropicRequest {
  model: string
  max_tokens: number
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  system?: string
  temperature?: number
}

/** Anthropic Messages API 响应体 */
interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

/** 适配器配置 */
export interface AnthropicAdapterConfig {
  /** API base URL（不含 /v1/messages 后缀） */
  baseURL: string
  /** API Key */
  apiKey: string
  /** 默认模型名称 */
  defaultModel: string
}

/**
 * Anthropic Messages API 适配器
 *
 * 支持 Anthropic 原生 /v1/messages 端点。
 * 适用于 Anthropic 官方 API 及兼容代理（如 Codeforvibe）。
 */
export class AnthropicAdapter implements LLMAdapter {
  private readonly baseURL: string
  private readonly apiKey: string
  private readonly defaultModel: string

  constructor(config: AnthropicAdapterConfig) {
    this.baseURL = config.baseURL.replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.defaultModel = config.defaultModel
  }

  /** 调用 Anthropic Messages API */
  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel

    // 分离 system 消息和对话消息
    let systemPrompt: string | undefined
    const conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content
      } else {
        conversationMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })
      }
    }

    const body: AnthropicRequest = {
      model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: conversationMessages,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
    }

    const url = `${this.baseURL}/v1/messages`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`)
    }

    const data = (await response.json()) as AnthropicResponse

    // 拼接所有 text content block
    const content = data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')

    return {
      content,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
    }
  }
}
