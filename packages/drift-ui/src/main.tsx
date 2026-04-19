/** Drift 开发入口 — 初始化 core 服务并挂载 React 应用 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { InMemoryAdapter } from '@drift/storage'
import {
  EventBus, BranchManager, MessageStore, ForkManager,
  OpenAICompatibleAdapter,
} from '@drift/core'
import type { LLMAdapter, LLMMessage, LLMResponse, LLMOptions } from '@drift/core'
import { IntentDetector, AgentScheduler, ObserverAgent, SynthesizerAgent, ConvergenceEngine } from '@drift/agents'
import { injectServices } from './store/drift-store'
import { DriftApp } from './App'

/**
 * Mock LLM — 不调用真实 API，模拟 AI 回复
 *
 * 有真实 API Key 后，替换为 OpenAICompatibleAdapter 或 AnthropicAdapter 即可。
 */
class MockLLMAdapter implements LLMAdapter {
  private turnCount = 0

  async chat(messages: LLMMessage[], _options?: LLMOptions): Promise<LLMResponse> {
    this.turnCount++
    const lastMsg = messages[messages.length - 1]
    const userContent = lastMsg?.content ?? ''

    // 模拟一点延迟，让 UI 感觉更真实
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 500))

    // 根据用户输入生成不同风格的回复
    const reply = this.generateReply(userContent)

    return {
      content: reply,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    }
  }

  private generateReply(input: string): string {
    const lower = input.toLowerCase()
    const think = (thought: string, reply: string) => `<think>${thought}</think>\n\n${reply}`

    if (lower.includes('你好') || lower.includes('hello') || lower.includes('hi')) {
      return think(
        '用户打了个招呼，随便接一下，顺便提一嘴分支功能。',
        '嘿！试试在对话中自然地切换话题，比如说"另外想到..."或"by the way"，系统会自动帮你开新分支。'
      )
    }

    if (lower.includes('总结') || lower.includes('summarize')) {
      return think(
        '用户想要总结，把目前聊到的几个点拉一下。',
        '**目前聊到这几块：**\n\n1. 讨论了多个方向\n2. 每个分支的核心观点已经记录\n3. 可以用收敛面板生成结构化输出\n\n要不要选几个分支，生成对比表格？'
      )
    }

    if (lower.includes('定价') || lower.includes('pricing')) {
      return think(
        '定价策略，先列几个常见模型让用户挑方向。',
        '常见的定价模型：\n\n- **免费增值** — 基础免费，高级收费\n- **订阅制** — 按月/年收费\n- **按量计费** — 用多少算多少\n\n你更倾向哪种？每种的用户获取和留存特征差别蛮大的。'
      )
    }

    if (lower.includes('竞品') || lower.includes('competitor')) {
      return think(
        '竞品分析，给几个维度让用户选着聊。',
        '可以从这几个维度切入：\n\n1. **功能覆盖** — 核心功能对比\n2. **定价策略** — 价格区间和计费模式\n3. **体验** — 上手难度和流畅度\n4. **技术架构** — 可扩展性和性能\n\n逐个展开还是先挑一个重点聊？'
      )
    }

    const thoughts = [
      '嗯这个挺有意思的，换个角度看看。',
      '用户这个想法可以拆几层来看。',
      '先把关键因素理一下再问。',
    ]
    const replies = [
      `有意思。换个角度看 "${input.slice(0, 15)}" 这个方向 — **最大的风险**你觉得是什么？`,
      `关于 "${input.slice(0, 15)}"，我的想法：\n\n1. 这个方向的优势在于降低门槛\n2. 但边际成本得控住\n3. 长期看需要差异化\n\n你怎么看？`,
      `"${input.slice(0, 15)}" 有几个关键因素。要不要拆成子问题来聊？`,
    ]
    const idx = this.turnCount % replies.length
    return think(thoughts[idx]!, replies[idx]!)
  }
}

/**
 * FallbackLLMAdapter — 尝试真实 API，失败后自动降级到 Mock
 */
class FallbackLLMAdapter implements LLMAdapter {
  private realAdapter: LLMAdapter
  private mockAdapter = new MockLLMAdapter()
  private useMock = false

  constructor(realAdapter: LLMAdapter) {
    this.realAdapter = realAdapter
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    if (this.useMock) {
      return this.mockAdapter.chat(messages, options)
    }
    try {
      return await this.realAdapter.chat(messages, options)
    } catch (err) {
      console.warn('[Drift] 真实 LLM 调用失败，降级到 Mock LLM:', err)
      this.useMock = true
      return this.mockAdapter.chat(messages, options)
    }
  }
}

/** 根据环境变量决定用真实 LLM 还是 Mock */
function createLLM(): LLMAdapter {
  const apiKey = import.meta.env.VITE_LLM_API_KEY ?? ''
  if (apiKey && apiKey !== 'sk-在这里填入你的OpenAI-key') {
    console.log('[Drift] 使用真实 LLM adapter（失败时自动降级到 Mock）')
    const realAdapter = new OpenAICompatibleAdapter({
      apiKey,
      baseURL: import.meta.env.VITE_LLM_BASE_URL ?? 'https://api.openai.com/v1',
      defaultModel: import.meta.env.VITE_LLM_MODEL ?? 'gpt-4o-mini',
    })
    return new FallbackLLMAdapter(realAdapter)
  }
  console.log('[Drift] 未配置 API Key，使用 Mock LLM')
  return new MockLLMAdapter()
}

/** 初始化所有 core 服务并注入到 UI store */
async function bootstrap() {
  const storage = new InMemoryAdapter()
  const eventBus = new EventBus()
  const llm = createLLM()
  const branchManager = new BranchManager(storage, eventBus)
  const messageStore = new MessageStore(storage, eventBus)
  const forkManager = new ForkManager(storage, eventBus, branchManager, messageStore)
  const intentDetector = new IntentDetector()
  const agentScheduler = new AgentScheduler(eventBus)
  const convergenceEngine = new ConvergenceEngine(llm, storage)

  // 初始化 agents（暂不启动调度，后续接入）
  const _observer = new ObserverAgent(llm, storage)
  const _synthesizer = new SynthesizerAgent(llm, storage)

  // 注入服务到 Zustand store
  injectServices({
    branchManager,
    messageStore,
    forkManager,
    intentDetector,
    agentScheduler,
    convergenceEngine,
    llm,
  })

  const { useDriftStore } = await import('./store/drift-store')
  const store = useDriftStore.getState()

  // 暴露到 window 方便调试动画
  ;(window as any).__driftStore = store

  // 把 EventBus 事件桥接到 store
  const eventTypes = [
    'message:appended', 'message:moved',
    'branch:created', 'branch:merged', 'branch:archived', 'branch:switched',
    'fork:created', 'fork:undone',
    'observation:created', 'globalmap:updated',
  ] as const
  for (const type of eventTypes) {
    eventBus.on(type, (event) => {
      useDriftStore.getState()._updateFromEvent(event)
    })
  }

  // 创建根分支（事件会自动更新 store.branches）
  const root = await branchManager.create({ label: '主线对话' })

  // 初始化分支树
  const tree = await branchManager.getTree()
  useDriftStore.setState({ tree })

  // 设置初始活跃分支
  store.switchBranch(root.id)

  // 挂载 React
  const container = document.getElementById('root')!
  createRoot(container).render(
    <StrictMode>
      <DriftApp />
    </StrictMode>
  )
}

bootstrap().catch(console.error)
