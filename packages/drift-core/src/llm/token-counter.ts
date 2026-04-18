import type { DriftStorage } from '@drift/storage'

// CJK Unicode 范围正则
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{2ceb0}-\u{2ebef}\u{30000}-\u{3134f}\u3000-\u303f\uff00-\uffef]/u

/**
 * TokenCounter
 *
 * 简易 token 估算器。
 * 英文约 4 字符 = 1 token，CJK 约 2 字符 = 1 token。
 * 精确计数应使用 tiktoken 等库，此处仅做粗略估算供调度决策。
 */
export class TokenCounter {
  constructor(private readonly storage: DriftStorage) {}

  /** 估算一段文本的 token 数 */
  estimate(text: string): number {
    let cjkChars = 0
    let otherChars = 0

    for (const char of text) {
      if (CJK_REGEX.test(char)) {
        cjkChars++
      } else {
        otherChars++
      }
    }

    // CJK 字符约 2 字符 / token，其余约 4 字符 / token
    return Math.ceil(cjkChars / 2) + Math.ceil(otherChars / 4)
  }

  /** 估算指定分支所有消息的 token 总数 */
  async countBranch(branchId: string): Promise<number> {
    const messages = await this.storage.messages.getByBranch(branchId)
    let total = 0
    for (const msg of messages) {
      total += this.estimate(msg.content)
    }
    return total
  }
}
