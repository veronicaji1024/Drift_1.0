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

  // --- Mock 数据：4 级嵌套树 ---

  // depth 0: 主线对话 (Q*bert)
  const rootMessages = [
    { role: 'user' as const, content: '我想做一个 hackathon 项目，关于非线性对话的' },
    { role: 'assistant' as const, content: '<think>用户想做 hackathon 项目，非线性对话方向，先了解核心想法。</think>**非线性对话**是个很有意思的方向！\n\n你脑子里大概是什么形态？比如：\n- 对话可以像 git 一样分支\n- 还是更像思维导图，节点之间自由连接？\n\n最核心想解决的痛点是什么？' },
    { role: 'user' as const, content: '对 就是对话可以分支 ADHD友好的那种 想到哪说到哪 系统自动帮你整理' },
    { role: 'assistant' as const, content: '<think>ADHD 友好 + 自动整理，这个定位很清晰。</think>这个定位很 sharp — **ADHD 友好的发散式对话工具**。\n\n核心机制可以是：\n1. 聊着聊着跑题了 → 系统自动开新分支\n2. 每个分支独立推进，互不干扰\n3. 最后可以**收敛**，把多个分支的结论合并\n\n技术上用 **力导向图** 做可视化会很酷，每个节点是一个对话分支。要不要先从这个方向展开？' },
  ]
  for (const msg of rootMessages) {
    await messageStore.append(root.id, msg.role, msg.content)
  }

  // depth 1: 定价策略 (红豆)
  const pricing = await branchManager.create({ label: '定价策略', parentId: root.id })
  for (const msg of [
    { role: 'user' as const, content: '如果这个做成产品 怎么定价比较好' },
    { role: 'assistant' as const, content: '<think>用户在想商业化，给几个常见模型对比。</think>几个适合这类工具的定价模型：\n\n- **免费增值**：基础对话免费，高级功能（收敛、导出、团队协作）收费\n- **订阅制**：$9.99/月，不限分支数\n- **按量计费**：按 AI 调用次数收费\n\n我觉得**免费增值**最适合 hackathon demo，先让人用起来。你怎么看？' },
  ]) {
    await messageStore.append(pricing.id, msg.role, msg.content)
  }

  // depth 2: 免费增值模式 (黄豆)
  const freemium = await branchManager.create({ label: '免费增值模式', parentId: pricing.id })
  for (const msg of [
    { role: 'user' as const, content: '免费增值具体怎么设计免费和付费的边界' },
    { role: 'assistant' as const, content: '<think>免费增值的关键是让免费版足够好用但付费版有明确价值。</think>**边界设计**：\n\n| 免费 | 付费 |\n|------|------|\n| 3 个分支 | 无限分支 |\n| 基础对话 | 收敛 + 导出 |\n| 7 天历史 | 永久保存 |\n\n核心原则：免费版让人**上瘾**，付费版解决**效率痛点**。' },
  ]) {
    await messageStore.append(freemium.id, msg.role, msg.content)
  }

  // depth 2: 企业版定价 (黄豆)
  const enterprise = await branchManager.create({ label: '企业版定价', parentId: pricing.id })
  for (const msg of [
    { role: 'user' as const, content: '企业版要不要单独定价' },
    { role: 'assistant' as const, content: '<think>企业版的核心是协作和管控。</think>企业版建议**单独报价**，卖点不一样：\n\n- SSO + 权限管理\n- 团队知识图谱共享\n- 私有部署选项\n- SLA 保障\n\n定价 ¥299/人/月 起，10 人起售。先不急，hackathon 之后再细化。' },
  ]) {
    await messageStore.append(enterprise.id, msg.role, msg.content)
  }

  // depth 1: 竞品分析 (红豆)
  const competitor = await branchManager.create({ label: '竞品分析', parentId: root.id })
  for (const msg of [
    { role: 'user' as const, content: '市面上有没有类似的产品' },
    { role: 'assistant' as const, content: '<think>梳理一下竞品情况。</think>直接竞品不多，但相关方向有几个：\n\n1. **ChatGPT** — 线性对话，不能分支\n2. **Notion AI** — 文档里嵌 AI，但不是对话形态\n3. **Obsidian + AI 插件** — 有图谱但交互重\n4. **Napkin.ai** — 发散思维工具，但没有对话\n\n你的差异化在于：**对话即思维，分支即结构**。' },
  ]) {
    await messageStore.append(competitor.id, msg.role, msg.content)
  }

  // depth 2: 直接竞品 (黄豆)
  const directComp = await branchManager.create({ label: '直接竞品', parentId: competitor.id })
  for (const msg of [
    { role: 'user' as const, content: '直接竞品再展开聊聊' },
    { role: 'assistant' as const, content: '<think>把几个最接近的产品拆开细看。</think>最接近的两个：\n\n- **ChatGPT**：用户量大但对话线性，分支是我们的核心差异\n- **Notion AI**：有文档结构但不是对话形态，交互逻辑完全不同\n\n要不要分别对比一下？' },
  ]) {
    await messageStore.append(directComp.id, msg.role, msg.content)
  }

  // depth 3: ChatGPT 对比 (绿豆)
  const chatgptComp = await branchManager.create({ label: 'ChatGPT 对比', parentId: directComp.id })
  for (const msg of [
    { role: 'user' as const, content: '和 ChatGPT 比我们的优势在哪' },
    { role: 'assistant' as const, content: '<think>和 ChatGPT 的核心差异在于对话结构。</think>**vs ChatGPT：**\n\n- 他们：线性对话，跑题了只能硬拉回来\n- 我们：跑题 = 自然分支，不丢上下文\n- 他们：长对话后半段模型会"忘记"前面说的\n- 我们：每个分支独立上下文，精准度更高\n\n本质区别：ChatGPT 是**工具**，Drift 是**思维空间**。' },
  ]) {
    await messageStore.append(chatgptComp.id, msg.role, msg.content)
  }

  // depth 3: Notion AI 对比 (绿豆)
  const notionComp = await branchManager.create({ label: 'Notion AI 对比', parentId: directComp.id })
  for (const msg of [
    { role: 'user' as const, content: 'Notion AI 呢' },
    { role: 'assistant' as const, content: '<think>Notion AI 的定位完全不同。</think>**vs Notion AI：**\n\n- Notion 是**文档优先**，AI 是辅助写作\n- 我们是**对话优先**，结构自动生成\n- Notion 适合已经有框架的人整理\n- Drift 适合**还在想**的人发散\n\n互补关系大于竞争：用 Drift 想清楚 → 导出到 Notion 落文档。' },
  ]) {
    await messageStore.append(notionComp.id, msg.role, msg.content)
  }

  // depth 2: 间接竞品 (黄豆)
  const indirectComp = await branchManager.create({ label: '间接竞品', parentId: competitor.id })
  for (const msg of [
    { role: 'user' as const, content: '间接竞品有哪些 思维导图那些算吗' },
    { role: 'assistant' as const, content: '<think>间接竞品主要是思维工具类。</think>算，但交互逻辑差很多：\n\n- **Miro / FigJam**：白板协作，手动拖拽节点，不是对话驱动\n- **Obsidian**：双链笔记，适合回顾不适合实时发散\n- **Napkin.ai**：AI 发散工具但没有对话能力\n\n我们的独特点：**用聊天的方式建图谱**，零门槛。' },
  ]) {
    await messageStore.append(indirectComp.id, msg.role, msg.content)
  }

  // 重新加载所有数据
  const finalBranches = await storage.branches.listAll()
  const finalBranchesMap: Record<string, typeof root> = {}
  for (const b of finalBranches) finalBranchesMap[b.id] = b
  const finalMessages: Record<string, Awaited<ReturnType<typeof messageStore.getByBranch>>> = {}
  for (const b of finalBranches) {
    const msgs = await messageStore.getByBranch(b.id)
    if (msgs.length > 0) finalMessages[b.id] = msgs
  }
  const finalTree = await branchManager.getTree()
  useDriftStore.setState({ tree: finalTree, branches: finalBranchesMap, messagesByBranch: finalMessages })

  // 挂载 React
  const container = document.getElementById('root')!
  createRoot(container).render(
    <StrictMode>
      <DriftApp />
    </StrictMode>
  )
}

bootstrap().catch(console.error)
