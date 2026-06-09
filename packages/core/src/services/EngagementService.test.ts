import { describe, it, expect } from 'vitest'
import { scoreItem } from './EngagementService.js'
import type { Item } from '@chord/types'

function makeItem(overrides: Partial<Item>): Item {
  return {
    id: 'i',
    url: 'https://example.com/p',
    title: 't',
    favicon: '',
    savedAt: Date.now() - 30 * 86_400_000,
    sourceDomain: 'example.com',
    type: 'content',
    status: 'pending',
    wakeCount: 0,
    source: 'saved',
    ...overrides,
  }
}

describe('EngagementService.scoreItem', () => {
  it('未决策 = 0 分 / zero', () => {
    const r = scoreItem(makeItem({ status: 'pending' }))
    expect(r.score).toBe(0)
    expect(r.level).toBe('zero')
  })

  it('keep = 20 分 / light', () => {
    const r = scoreItem(makeItem({ status: 'kept', processedAt: Date.now() }))
    expect(r.score).toBe(20)
    expect(r.level).toBe('light')
  })

  it('used = 50 分 / light', () => {
    const r = scoreItem(makeItem({ status: 'used', processedAt: Date.now() }))
    expect(r.score).toBe(50)
    expect(r.level).toBe('light')
  })

  it('used + chip「实际用到了」+ 速度 3 天 = 50+30+10 = 90 / deep', () => {
    const now = Date.now()
    const r = scoreItem(makeItem({
      status: 'used',
      usageChip: '实际用到了',
      firstSeenAt: now - 2 * 86_400_000,
      processedAt: now,
    }))
    expect(r.score).toBe(90)
    expect(r.level).toBe('deep')
  })

  it('chip 分数与状态匹配：keep + chip 不加分（chip 仅在 used 时生效）', () => {
    const r = scoreItem(makeItem({ status: 'kept', usageChip: '实际用到了', processedAt: Date.now() }))
    expect(r.score).toBe(20)  // 20 (kept) + 0 (chip ignored)
  })

  it('「＋ 自己说」自定义输入 +10', () => {
    const r = scoreItem(makeItem({
      status: 'used',
      usageCustom: '今天写文章用上了',
      processedAt: Date.now(),
    }))
    expect(r.score).toBe(60)  // 50 + 10
    expect(r.level).toBe('deep')
  })

  it('私人注释按字数加分（10 字 +1，最多 +20）', () => {
    const note50 = '今天'.repeat(25)  // 50 字
    const r = scoreItem(makeItem({ status: 'kept', privateNote: note50, processedAt: Date.now() }))
    expect(r.score).toBe(25)  // 20 + 5
  })

  it('私人注释超长封顶 +20', () => {
    const note300 = 'x'.repeat(300)
    const r = scoreItem(makeItem({ status: 'kept', privateNote: note300, processedAt: Date.now() }))
    expect(r.score).toBe(40)  // 20 + 20
  })

  it('firstSeenAt 缺失时 fallback 到 savedAt', () => {
    const now = Date.now()
    const r = scoreItem(makeItem({
      status: 'used',
      savedAt: now - 2 * 86_400_000,
      processedAt: now,
      // 不设 firstSeenAt
    }))
    expect(r.score).toBe(60)  // 50 + 10 (速度 3 天内)
  })

  it('速度分：firstSeenAt 比 savedAt 更近时，按 firstSeenAt 算（老书签今天看到今天处理）', () => {
    const now = Date.now()
    const r = scoreItem(makeItem({
      status: 'used',
      savedAt: now - 1000 * 86_400_000,    // 3 年前的老书签
      firstSeenAt: now - 1 * 86_400_000,    // Chord 昨天才看到
      processedAt: now,
    }))
    // 速度应按 firstSeenAt 算 (1 天) → +10 速度分
    expect(r.score).toBe(60)  // 50 + 10
  })

  it('14 天内 +5 / 超 14 天 +0', () => {
    const now = Date.now()
    const r14 = scoreItem(makeItem({
      status: 'used',
      firstSeenAt: now - 14 * 86_400_000,
      processedAt: now,
    }))
    expect(r14.score).toBe(55)  // 50 + 5

    const r30 = scoreItem(makeItem({
      status: 'used',
      firstSeenAt: now - 30 * 86_400_000,
      processedAt: now,
    }))
    expect(r30.score).toBe(50)  // 50 + 0
  })

  it('封顶 100 不会越界', () => {
    const now = Date.now()
    const r = scoreItem(makeItem({
      status: 'used',
      usageChip: '实际用到了',         // +30
      usageCustom: 'something',         // +10
      privateNote: 'x'.repeat(300),     // +20
      firstSeenAt: now - 1 * 86_400_000, // +10
      processedAt: now,
    }))
    // 50 + 30 + 10 + 20 + 10 = 120，封顶到 100
    expect(r.score).toBe(100)
    expect(r.level).toBe('deep')
  })

  it('released 决策 = 10 分（仍算处理，但参与度低）', () => {
    const r = scoreItem(makeItem({ status: 'released', processedAt: Date.now() }))
    expect(r.score).toBe(10)
    expect(r.level).toBe('zero')
  })
})
