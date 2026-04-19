import { describe, it, expect, beforeEach } from 'vitest'
import { IntentDetector } from '../intent-detector/intent-detector.js'

describe('IntentDetector', () => {
  let detector: IntentDetector

  beforeEach(() => {
    detector = new IntentDetector()
  })

  // ─── Fork 检测 ──────────────────────────────

  describe('Fork 检测', () => {
    it('中文漂移信号词触发 fork', () => {
      const result = detector.detect('另外想到一个问题', { topic: '定价策略' })
      expect(result.intent).toBe('fork')
      expect(result.confidence).toBe('high')
    })

    it('英文漂移信号词触发 fork', () => {
      const result = detector.detect('by the way, what about pricing?', { topic: 'user retention' })
      expect(result.intent).toBe('fork')
    })

    it('btw 触发 fork', () => {
      const result = detector.detect('btw I also need to check the API', { topic: 'database design' })
      expect(result.intent).toBe('fork')
    })

    it('无漂移信号且话题重叠时返回 continue', () => {
      const result = detector.detect('定价策略需要考虑竞品', { topic: '定价策略竞品分析' })
      expect(result.intent).toBe('continue')
    })

    it('forkLabel 从消息中提取', () => {
      const result = detector.detect('突然想到我们还需要做用户调研', { topic: '产品设计' })
      expect(result.intent).toBe('fork')
      expect(result.forkLabel).toBeDefined()
      expect(result.forkLabel!.length).toBeGreaterThan(0)
    })
  })

  // ─── 回溯检测 ──────────────────────────────

  describe('回溯检测', () => {
    it('中文回溯信号词触发 backtrack', () => {
      const result = detector.detect('回到之前讨论的方案', { topic: '新功能设计' })
      expect(result.intent).toBe('backtrack')
      expect(result.confidence).toBe('high')
    })

    it('英文回溯信号词触发 backtrack', () => {
      const result = detector.detect('going back to what we discussed earlier', { topic: 'new feature' })
      expect(result.intent).toBe('backtrack')
    })

    it('回溯优先于 fork', () => {
      // 既有回溯词又有 fork 词时，回溯优先
      const result = detector.detect('回到之前的讨论，另外想到一个问题', { topic: '产品设计' })
      expect(result.intent).toBe('backtrack')
    })

    it('earlyTopics 重叠触发隐式回溯', () => {
      const result = detector.detect('我们再看看数据库设计方案', {
        topic: '前端架构',
        earlyTopics: ['数据库设计方案'],
      })
      expect(result.intent).toBe('backtrack')
      expect(result.confidence).toBe('medium')
    })
  })

  // ─── Cooldown ──────────────────────────────

  describe('冷却机制', () => {
    it('tickCooldown 推进计数', () => {
      detector.resetCooldown('branch-1')
      detector.tickCooldown('branch-1')
      detector.tickCooldown('branch-1')
      // 不崩溃即可
    })

    it('resetCooldown 重置计数', () => {
      detector.tickCooldown('branch-1')
      detector.tickCooldown('branch-1')
      detector.resetCooldown('branch-1')
      // 不崩溃即可
    })
  })

  // ─── exhausted 阶段 ─────────────────────────

  describe('exhausted 阶段', () => {
    it('exhausted 阶段 fork 置为 high confidence', () => {
      const result = detector.detect('另外想到一个问题', {
        topic: '定价策略',
        stage: 'exhausted',
      })
      expect(result.intent).toBe('fork')
      expect(result.confidence).toBe('high')
    })
  })

  // ─── 边界情况 ──────────────────────────────

  describe('边界情况', () => {
    it('空消息返回 continue', () => {
      const result = detector.detect('', { topic: 'topic' })
      expect(result.intent).toBe('continue')
    })

    it('无 branchContext 时不崩溃', () => {
      const result = detector.detect('另外想到一个问题')
      expect(result.intent).toBe('fork')
    })

    it('空 topic 的 branchContext 不崩溃', () => {
      const result = detector.detect('正常消息', {})
      expect(result.intent).toBe('continue')
    })
  })
})
