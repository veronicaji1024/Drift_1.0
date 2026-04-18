import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryAdapter } from '@drift/storage'
import type { LLMAdapter, LLMMessage, LLMResponse, LLMOptions } from '@drift/core'
import { ObserverAgent } from '../observer/observer-agent.js'

/** 创建 Mock LLM，返回固定 JSON */
function createMockLLM(response?: Partial<LLMResponse>): LLMAdapter {
  return {
    async chat(_messages: LLMMessage[], _options?: LLMOptions): Promise<LLMResponse> {
      return {
        content: response?.content ?? JSON.stringify({
          topics: ['产品设计', '用户体验'],
          facts: ['用户更偏好简洁界面'],
          decisions: ['采用卡片式布局'],
          openQuestions: ['如何处理移动端适配？'],
          currentTask: '讨论界面设计方案',
        }),
        ...response,
      }
    },
  }
}

describe('ObserverAgent', () => {
  let storage: InstanceType<typeof InMemoryAdapter>

  beforeEach(() => {
    storage = new InMemoryAdapter()
  })

  /** 向存储添加消息的辅助函数 */
  async function addMessages(branchId: string, count: number) {
    for (let i = 0; i < count; i++) {
      await storage.messages.append({
        id: `msg-${i}`,
        branchId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `消息内容 ${i}`,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
      })
    }
  }

  it('对分支消息产出结构化 Observation', async () => {
    const llm = createMockLLM()
    const observer = new ObserverAgent(llm, storage)

    // 创建分支并添加消息
    await storage.branches.create({
      parentId: null,
      label: '测试分支',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      metadata: {},
    })

    await addMessages('test-branch', 6)
    // 这里 branchId 需要匹配——InMemoryAdapter create 会生成 UUID
    // 直接用 storage.messages 添加的 branchId
    const obs = await observer.run('test-branch')

    // 不论 branchId，至少不崩溃
    expect(obs).toBeDefined()
    expect(obs.branchId).toBe('test-branch')
  })

  it('产出包含 topics/facts/decisions/openQuestions/currentTask', async () => {
    const llm = createMockLLM()
    const observer = new ObserverAgent(llm, storage)

    await addMessages('branch-1', 4)
    const obs = await observer.run('branch-1')

    expect(obs.topics).toEqual(['产品设计', '用户体验'])
    expect(obs.facts).toEqual(['用户更偏好简洁界面'])
    expect(obs.decisions).toEqual(['采用卡片式布局'])
    expect(obs.openQuestions).toEqual(['如何处理移动端适配？'])
    expect(obs.currentTask).toBe('讨论界面设计方案')
  })

  it('空分支返回 fallback Observation', async () => {
    const llm = createMockLLM()
    const observer = new ObserverAgent(llm, storage)

    const obs = await observer.run('empty-branch')

    expect(obs.topics).toEqual([])
    expect(obs.facts).toEqual([])
    expect(obs.currentTask).toBe('')
    expect(obs.messageRange).toEqual([0, 0])
  })

  it('LLM 返回无效 JSON 时 fallback 不崩溃', async () => {
    const llm = createMockLLM({ content: '这不是 JSON' })
    const observer = new ObserverAgent(llm, storage)

    await addMessages('branch-bad', 3)
    const obs = await observer.run('branch-bad')

    // fallback：所有数组为空
    expect(obs.topics).toEqual([])
    expect(obs.facts).toEqual([])
  })

  it('LLM 返回 markdown 围栏包裹的 JSON 仍可解析', async () => {
    const llm = createMockLLM({
      content: '```json\n{"topics":["test"],"facts":[],"decisions":[],"openQuestions":[],"currentTask":"testing"}\n```',
    })
    const observer = new ObserverAgent(llm, storage)

    await addMessages('branch-fence', 2)
    const obs = await observer.run('branch-fence')

    expect(obs.topics).toEqual(['test'])
    expect(obs.currentTask).toBe('testing')
  })

  it('持久化 Observation 到 storage', async () => {
    const llm = createMockLLM()
    const observer = new ObserverAgent(llm, storage)

    await addMessages('branch-persist', 4)
    await observer.run('branch-persist')

    const stored = await storage.observations.getByBranch('branch-persist')
    expect(stored.length).toBe(1)
    expect(stored[0]!.topics).toEqual(['产品设计', '用户体验'])
  })

  it('增量观察：从上次结束位置开始', async () => {
    const llm = createMockLLM()
    const observer = new ObserverAgent(llm, storage)

    await addMessages('branch-inc', 6)
    const obs1 = await observer.run('branch-inc')
    expect(obs1.messageRange).toEqual([0, 6])

    // 追加更多消息
    for (let i = 6; i < 10; i++) {
      await storage.messages.append({
        id: `msg-${i}`,
        branchId: 'branch-inc',
        role: 'user',
        content: `新消息 ${i}`,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
      })
    }

    const obs2 = await observer.run('branch-inc')
    // 第二次应从索引 6 开始
    expect(obs2.messageRange[0]).toBe(6)
    expect(obs2.messageRange[1]).toBe(10)
  })

  it('LLM 抛出异常时返回 fallback', async () => {
    const llm: LLMAdapter = {
      async chat(): Promise<LLMResponse> {
        throw new Error('LLM 不可用')
      },
    }
    const observer = new ObserverAgent(llm, storage)

    await addMessages('branch-err', 3)
    const obs = await observer.run('branch-err')

    expect(obs.topics).toEqual([])
    expect(obs.currentTask).toBe('')
  })

  it('messageRange 正确记录覆盖的消息索引范围', async () => {
    const llm = createMockLLM()
    const observer = new ObserverAgent(llm, storage)

    await addMessages('branch-range', 8)
    const obs = await observer.run('branch-range')

    expect(obs.messageRange[0]).toBe(0)
    expect(obs.messageRange[1]).toBe(8)
    expect(obs.tokenCount).toBeGreaterThan(0)
  })
})
