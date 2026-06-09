import { describe, it, expect } from 'vitest'
import { classifyInterestState, computeMomentum } from './InterestStateService.js'
import type { Item } from '@chord/types'

const DAY = 86_400_000

function mkItem(ageDays: number, status: Item['status'] = 'pending'): Item {
  return {
    id: Math.random().toString(36).slice(2),
    url: 'https://e.com/p',
    title: 't',
    favicon: '',
    savedAt: Date.now() - ageDays * DAY,
    sourceDomain: 'e.com',
    type: 'content',
    status,
    wakeCount: 0,
    source: 'saved',
  }
}

describe('InterestStateService.classifyInterestState', () => {
  it('empty → dormant', () => {
    expect(classifyInterestState([])).toBe('dormant')
  })

  it('最后一次 save > 180 天 → dormant', () => {
    const items = [mkItem(200), mkItem(250), mkItem(300)]
    expect(classifyInterestState(items)).toBe('dormant')
  })

  it('体量大且处理率 < 10% → dormant', () => {
    // 10 条 pending（age 100），处理率 0%
    const items = Array.from({ length: 10 }, () => mkItem(100))
    expect(classifyInterestState(items)).toBe('dormant')
  })

  it('近 30 天 ≥3 条且加速 → emerging', () => {
    // 近 30 天 5 条，30-90 天 1 条 → 加速比 5 > 1*1.5
    const items = [
      mkItem(5), mkItem(10), mkItem(15), mkItem(20), mkItem(28),
      mkItem(60),
    ]
    expect(classifyInterestState(items)).toBe('emerging')
  })

  it('近 30 天 0 + 30-90 天 0 → fading', () => {
    const items = [mkItem(100), mkItem(120), mkItem(150)]
    // 历史 saves 但近 90 天空白：fading
    // 注意 lastSaveAge = 100 < 180，处理率 0% 但只 3 条不满足 dormant 第二条件
    expect(classifyInterestState(items)).toBe('fading')
  })

  it('近期持续有动作 + 处理率合理 → active', () => {
    const items = [
      mkItem(5, 'used'), mkItem(20, 'used'), mkItem(50, 'kept'),
      mkItem(70, 'used'), mkItem(85, 'kept'),
    ]
    expect(classifyInterestState(items)).toBe('active')
  })
})

describe('InterestStateService.computeMomentum', () => {
  it('空数据 → stable', () => {
    const r = computeMomentum([])
    expect(r.direction).toBe('stable')
    expect(r.velocity30d).toBe(0)
  })

  it('近 30 天 ≥3 条且远超历史月均 → rising', () => {
    // 近 30 天 8 条，60-180 天前 4 条（4 个月窗口） → 历史月均 1
    const items = [
      mkItem(5), mkItem(8), mkItem(12), mkItem(15), mkItem(18), mkItem(22), mkItem(25), mkItem(28),
      mkItem(60), mkItem(90), mkItem(120), mkItem(150),
    ]
    const r = computeMomentum(items)
    expect(r.velocity30d).toBe(8)
    expect(r.direction).toBe('rising')
  })

  it('历史月均 ≥3 但近 30 天近乎归零 → falling', () => {
    // 30-180 天前 18 条（5 个月窗口） → 月均 3.6；近 30 天 0 条
    const items = Array.from({ length: 18 }, (_, i) => mkItem(40 + i * 8))
    const r = computeMomentum(items)
    expect(r.velocityHist).toBeGreaterThanOrEqual(3)
    expect(r.velocity30d).toBe(0)
    expect(r.direction).toBe('falling')
  })

  it('近 30 天 < 历史月均 × 1.5 → stable', () => {
    // 近 30 天 3 条，历史月均 3 → 不算 rising
    const items = [
      mkItem(5), mkItem(15), mkItem(25),
      mkItem(45), mkItem(55), mkItem(65),
    ]
    const r = computeMomentum(items)
    expect(r.direction).toBe('stable')
  })
})
