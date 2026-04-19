/** Drift 开发入口 — 初始化 core 服务并挂载 React 应用 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IndexedDBAdapter } from '@drift/storage'
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

    if (lower.includes('你好') || lower.includes('hello') || lower.includes('hi')) {
      return '你好！我是 Drift AI 助手。试试在对话中自然地切换话题，比如说"另外想到..."或"by the way"，系统会自动为你开新分支。'
    }

    if (lower.includes('总结') || lower.includes('summarize')) {
      return '好的，让我来总结一下：\n\n1. 我们讨论了多个方向\n2. 每个分支的核心观点已经记录\n3. 可以点击右侧的收敛面板生成结构化输出\n\n你可以试试选择几个分支，生成对比表格或决策矩阵。'
    }

    if (lower.includes('定价') || lower.includes('pricing')) {
      return '关于定价策略，有几个常见的模型：\n\n- **免费增值**：基础功能免费，高级功能收费\n- **订阅制**：按月/年收费\n- **按量计费**：按使用量收费\n\n你更倾向哪种模式？每种都有不同的用户获取和留存特征。'
    }

    if (lower.includes('竞品') || lower.includes('competitor')) {
      return '竞品分析可以从几个维度入手：\n\n1. **功能对比**：核心功能覆盖度\n2. **定价策略**：价格区间和计费模式\n3. **用户体验**：上手难度和使用流畅度\n4. **技术架构**：可扩展性和性能\n\n要不要我们逐个维度展开讨论？'
    }

    // 通用回复
    const replies = [
      `有意思的观点。让我从另一个角度来看这个问题：${input.slice(0, 20)}... 这个方向值得深入探讨。你觉得最大的风险是什么？`,
      `好的，我理解你的意思。关于"${input.slice(0, 15)}"，我有几个想法：\n\n1. 这个方向的优势在于降低了门槛\n2. 但需要注意边际成本的控制\n3. 长期来看可能需要差异化\n\n你怎么看？`,
      `这是一个很好的问题。根据我的理解，${input.slice(0, 20)}... 有几个关键因素需要考虑。要不要我们把这个话题展开，分几个子问题来讨论？`,
    ]

    return replies[this.turnCount % replies.length]!
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
  const storage = await IndexedDBAdapter.create()
  const eventBus = new EventBus()
  const llm = createLLM()
  const branchManager = new BranchManager(storage, eventBus)
  const messageStore = new MessageStore(storage, eventBus)
  const forkManager = new ForkManager(storage, eventBus, branchManager, messageStore)
  const intentDetector = new IntentDetector()
  const agentScheduler = new AgentScheduler(eventBus)
  const convergenceEngine = new ConvergenceEngine(llm, storage)

  // 初始化 agents 并注入到调度器
  const observer = new ObserverAgent(llm, storage)
  const synthesizer = new SynthesizerAgent(llm, storage)
  agentScheduler.injectAgents({ observer, synthesizer })
  agentScheduler.listen()

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

  // 加载已有分支或创建根分支
  let root: Awaited<ReturnType<typeof branchManager.create>>
  try {
    root = await branchManager.getRoot()
  } catch {
    // 首次访问，创建根分支
    root = await branchManager.create({ label: '主线对话' })
  }

  // 加载所有已有分支到 store
  const allBranches = await storage.branches.listAll()
  const branchesMap: Record<string, typeof root> = {}
  for (const b of allBranches) {
    branchesMap[b.id] = b
  }

  // 加载每个分支的消息
  const messagesByBranch: Record<string, Awaited<ReturnType<typeof messageStore.getByBranch>>> = {}
  for (const b of allBranches) {
    const msgs = await messageStore.getByBranch(b.id)
    if (msgs.length > 0) {
      messagesByBranch[b.id] = msgs
    }
  }

  // 初始化分支树
  const tree = await branchManager.getTree()
  useDriftStore.setState({ tree, branches: branchesMap, messagesByBranch })

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
