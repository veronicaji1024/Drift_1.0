import type { LLMAdapter, LLMMessage, LLMOptions, LLMResponse, LLMChunk } from '../types/index.js'

/**
 * LLMRouter
 *
 * LLM 调用的抽象层，委托给注入的 LLMAdapter。
 * 提供统一的 chat / stream 接口，上层无需直接持有 adapter。
 */
export class LLMRouter {
  constructor(private readonly adapter: LLMAdapter) {}

  /** 同步调用 LLM，返回完整响应 */
  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    return this.adapter.chat(messages, options)
  }

  /** 流式调用 LLM，返回异步迭代器 */
  async *stream(messages: LLMMessage[], options?: LLMOptions): AsyncIterable<LLMChunk> {
    if (!this.adapter.stream) {
      // 适配器不支持流式时，降级为一次性返回
      const response = await this.adapter.chat(messages, options)
      yield { delta: response.content }
      return
    }
    yield* this.adapter.stream(messages, options)
  }
}
