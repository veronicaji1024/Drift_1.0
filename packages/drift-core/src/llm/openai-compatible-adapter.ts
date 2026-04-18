import type { LLMAdapter, LLMMessage, LLMOptions, LLMResponse } from '../types/index.js'

/** OpenAI 兼容 API 的请求体 */
interface ChatCompletionRequest {
  model: string
  messages: Array<{ role: string; content: string }>
  temperature?: number
  max_tokens?: number
}

/** OpenAI 兼容 API 的响应体 */
interface ChatCompletionResponse {
  choices: Array<{
    message: { role: string; content: string }
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/** 适配器配置 */
export interface OpenAICompatibleConfig {
  /** API base URL（不含 /chat/completions 后缀） */
  baseURL: string
  /** API Key */
  apiKey: string
  /** 默认模型名称 */
  defaultModel: string
}

/** 预设的平台配置工厂（只需传 apiKey） */
export const PRESETS = {
  /** 通义千问 DashScope OpenAI 兼容模式 */
  dashscope: (apiKey: string): OpenAICompatibleConfig => ({
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey,
    defaultModel: 'qwen-turbo',
  }),
  /** DeepSeek */
  deepseek: (apiKey: string): OpenAICompatibleConfig => ({
    baseURL: 'https://api.deepseek.com/v1',
    apiKey,
    defaultModel: 'deepseek-chat',
  }),
  /** SiliconFlow */
  siliconflow: (apiKey: string): OpenAICompatibleConfig => ({
    baseURL: 'https://api.siliconflow.cn/v1',
    apiKey,
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
  }),
  /** Groq */
  groq: (apiKey: string): OpenAICompatibleConfig => ({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey,
    defaultModel: 'llama-3.1-8b-instant',
  }),
  /** OpenAI */
  openai: (apiKey: string): OpenAICompatibleConfig => ({
    baseURL: 'https://api.openai.com/v1',
    apiKey,
    defaultModel: 'gpt-4o-mini',
  }),
} as const

/**
 * OpenAI 兼容 LLM 适配器
 *
 * 支持所有兼容 OpenAI Chat Completions API 的平台：
 * 通义千问、DeepSeek、SiliconFlow、Groq、OpenAI 等。
 * 通过 baseURL + apiKey + model 切换平台。
 */
export class OpenAICompatibleAdapter implements LLMAdapter {
  private readonly baseURL: string
  private readonly apiKey: string
  private readonly defaultModel: string

  constructor(config: OpenAICompatibleConfig) {
    this.baseURL = config.baseURL.replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.defaultModel = config.defaultModel
  }

  /** 调用 Chat Completions API */
  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel

    const body: ChatCompletionRequest = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
    }

    const url = `${this.baseURL}/chat/completions`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`LLM API error (${response.status}): ${errorText}`)
    }

    const data = (await response.json()) as ChatCompletionResponse

    const choice = data.choices[0]
    if (!choice) {
      throw new Error('LLM API returned no choices')
    }

    return {
      content: choice.message.content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    }
  }
}
