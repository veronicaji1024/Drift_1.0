import { describe, it, expect, beforeEach } from 'vitest'
import { IntentDetector } from '../intent-detector/intent-detector.js'
import type { UserProfile } from '@drift/storage'

describe('IntentDetector', () => {
  let detector: IntentDetector

  beforeEach(() => {
    detector = new IntentDetector()
  })

  // ─── 漂移检测 ──────────────────────────────

  describe('漂移检测', () => {
    it('中文漂移信号词触发 drift', () => {
      const result = detector.detect('另外想到一个问题', ['定价策略'])
      expect(result.type).toBe('drift')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('英文漂移信号词触发 drift', () => {
      const result = detector.detect('by the way, what about pricing?', ['user retention'])
      expect(result.type).toBe('drift')
    })

    it('btw 触发 drift', () => {
      const result = detector.detect('btw I also need to check the API', ['database design'])
      expect(result.type).toBe('drift')
    })

    it('无漂移信号且话题重叠时返回 continue', () => {
      const result = detector.detect('定价策略需要考虑竞品', ['定价', '策略', '竞品'])
      expect(result.type).toBe('continue')
    })

    it('suggestedLabel 从消息中提取', () => {
      const result = detector.detect('突然想到我们还需要做用户调研', ['产品设计'])
      expect(result.type).toBe('drift')
      expect(result.suggestedLabel).toBeDefined()
      expect(result.suggestedLabel!.length).toBeGreaterThan(0)
    })
  })

  // ─── 收敛检测 ──────────────────────────────

  describe('收敛检测', () => {
    it('中文收敛信号词触发 converge', () => {
      const result = detector.detect('总结一下刚才讨论的内容', ['产品设计'])
      expect(result.type).toBe('converge')
      expect(result.confidence).toBeGreaterThan(0.5)
    })

    it('英文收敛信号词触发 converge', () => {
      const result = detector.detect('let me summarize what we discussed', ['product design'])
      expect(result.type).toBe('converge')
    })

    it('多个收敛信号词提升 confidence', () => {
      const r1 = detector.detect('总结一下', ['topic'])
      const r2 = detector.detect('总结一下并且比较一下', ['topic'])
      expect(r2.confidence).toBeGreaterThan(r1.confidence)
    })

    it('收敛信号优先于漂移信号', () => {
      // 既有收敛词又有漂移词时，收敛优先
      const result = detector.detect('另外想到，总结一下刚才的讨论', ['topic'])
      expect(result.type).toBe('converge')
    })
  })

  // ─── Cooldown ──────────────────────────────

  describe('冷却机制', () => {
    it('冷却期内漂移降级为 continue', () => {
      // 设一个分支的 cooldown
      detector.resetCooldown('branch-1')
      // tick 0 次 → 还在冷却期内

      const result = detector.detect('另外想到一个问题', ['定价'])
      // 冷却期内应降级
      expect(result.type).toBe('continue')
    })

    it('冷却结束后恢复漂移检测', () => {
      detector.resetCooldown('branch-1')
      // 默认 cooldownTurns = 3，tick 3 次
      detector.tickCooldown('branch-1')
      detector.tickCooldown('branch-1')
      detector.tickCooldown('branch-1')

      const result = detector.detect('另外想到一个问题', ['定价'])
      expect(result.type).toBe('drift')
    })
  })

  // ─── Profile 调参 ─────────────────────────

  describe('Profile 参数影响', () => {
    it('高灵敏度更容易触发 drift', () => {
      const highSensitivity: Partial<UserProfile> = {
        intentDetectorSensitivity: 0.9,
        forkCooldownTurns: 0,
      }
      const lowSensitivity: Partial<UserProfile> = {
        intentDetectorSensitivity: 0.1,
        forkCooldownTurns: 0,
      }

      // 用一个含漂移信号词的消息测试
      const msg = '另外想到一个关于营销的问题'
      const topics = ['产品设计', '用户体验']

      const highResult = detector.detect(msg, topics, highSensitivity as UserProfile)
      const lowResult = detector.detect(msg, topics, lowSensitivity as UserProfile)

      // 高灵敏度的 confidence 应 >= 低灵敏度
      expect(highResult.confidence).toBeGreaterThanOrEqual(lowResult.confidence)
    })

    it('forkCooldownTurns 控制冷却轮次', () => {
      const profile: Partial<UserProfile> = {
        intentDetectorSensitivity: 0.5,
        forkCooldownTurns: 5,
      }

      detector.resetCooldown('branch-1')
      // tick 3 次 < 5，仍在冷却
      for (let i = 0; i < 3; i++) {
        detector.tickCooldown('branch-1')
      }

      const result = detector.detect('另外想到一个问题', ['定价'], profile as UserProfile)
      expect(result.type).toBe('continue')
    })
  })

  // ─── 边界情况 ──────────────────────────────

  describe('边界情况', () => {
    it('空消息返回 continue', () => {
      const result = detector.detect('', ['topic'])
      expect(result.type).toBe('continue')
    })

    it('空话题列表时不崩溃', () => {
      const result = detector.detect('另外想到一个问题', [])
      // 空话题列表时 topicDriftScore=0，只有信号词分数
      // 不要求一定触发 drift，只要不崩溃即可
      expect(['drift', 'continue']).toContain(result.type)
    })

    it('话题和消息都为空时返回 continue', () => {
      const result = detector.detect('', [])
      expect(result.type).toBe('continue')
    })
  })
})
