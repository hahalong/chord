import { describe, it, expect } from 'vitest'
import { evaluate, recordFired, type MilestoneFiredLog } from './MilestoneService.js'

const NOW = 1700000000000

describe('MilestoneService.evaluate', () => {
  it('items 99 → 100 fires items_100', () => {
    const ms = evaluate({ prevItemsTotal: 99, currentItemsTotal: 100 }, {})
    expect(ms.length).toBe(1)
    expect(ms[0]!.id).toBe('items_100')
    expect(ms[0]!.title).toContain('100')
  })

  it('items 100 → 101 does not re-fire', () => {
    const ms = evaluate({ prevItemsTotal: 100, currentItemsTotal: 101 }, { items_100: NOW - 1000 })
    expect(ms).toEqual([])
  })

  it('items 0 → 500 fires both 100 and 500', () => {
    const ms = evaluate({ prevItemsTotal: 0, currentItemsTotal: 500 }, {})
    expect(ms.map(m => m.id)).toEqual(['items_100', 'items_500'])
  })

  it('items 0 → 1500 fires all three', () => {
    const ms = evaluate({ prevItemsTotal: 0, currentItemsTotal: 1500 }, {})
    expect(ms.map(m => m.id)).toEqual(['items_100', 'items_500', 'items_1000'])
  })

  it('items_100 fired, then 99 → 1500 fires only 500 and 1000', () => {
    const fired: MilestoneFiredLog = { items_100: NOW - 86400_000 }
    const ms = evaluate({ prevItemsTotal: 99, currentItemsTotal: 1500 }, fired)
    expect(ms.map(m => m.id)).toEqual(['items_500', 'items_1000'])
  })

  it('processed 99 → 100 fires processed_100', () => {
    const ms = evaluate({ prevProcessed: 99, currentProcessed: 100 }, {})
    expect(ms.length).toBe(1)
    expect(ms[0]!.id).toBe('processed_100')
  })

  it('streak 6 → 7 fires streak_7', () => {
    const ms = evaluate({ prevStreak: 6, currentStreak: 7 }, {})
    expect(ms.length).toBe(1)
    expect(ms[0]!.id).toBe('streak_7')
  })

  it('streak 0 → 30 fires both 7 and 30', () => {
    const ms = evaluate({ prevStreak: 0, currentStreak: 30 }, {})
    expect(ms.map(m => m.id)).toEqual(['streak_7', 'streak_30'])
  })

  it('multiple categories at once: items + streak', () => {
    const ms = evaluate({
      prevItemsTotal: 99, currentItemsTotal: 100,
      prevStreak: 6, currentStreak: 7,
    }, {})
    expect(ms.length).toBe(2)
    expect(new Set(ms.map(m => m.id))).toEqual(new Set(['items_100', 'streak_7']))
  })

  it('returns empty for no changes crossing thresholds', () => {
    const ms = evaluate({
      prevItemsTotal: 50, currentItemsTotal: 51,
      prevProcessed: 10, currentProcessed: 11,
      prevStreak: 3, currentStreak: 4,
    }, {})
    expect(ms).toEqual([])
  })

  it('undefined input fields → skip those categories', () => {
    const ms = evaluate({ currentItemsTotal: 100 }, {})  // no prev, defaults 0 → 100 crosses
    expect(ms.map(m => m.id)).toEqual(['items_100'])
  })
})

describe('recordFired', () => {
  it('records milestone with timestamp', () => {
    const log = recordFired({}, 'items_100', NOW)
    expect(log['items_100']).toBe(NOW)
  })
  it('immutable', () => {
    const original = {}
    const next = recordFired(original, 'items_100', NOW)
    expect(original).toEqual({})
    expect(next).not.toBe(original)
  })
})
