import { describe, it, expect } from 'vitest'
import { computeEchoIndex, tierOf, countReadyToEcho } from './EchoIndexService.js'
import type { Item } from '@chord/types'

const NOW = 1700000000000
const DAY = 86400_000

function mkItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'x',
    url: 'https://example.com',
    title: 'X',
    favicon: '',
    savedAt: NOW - 30 * DAY,
    sourceDomain: 'example.com',
    type: 'content',
    status: 'pending',
    wakeCount: 0,
    source: 'bookmark',
    ...overrides,
  }
}

describe('computeEchoIndex', () => {
  it('high visit + pending + recent = sing tier (60+)', () => {
    const item = mkItem({ lastVisitedAt: NOW - 3 * DAY })
    const score = computeEchoIndex({ item, visitCount: 6, now: NOW })
    // visitScore 30 + unprocessed 25 + freshness 15 = 70
    expect(score).toBeGreaterThanOrEqual(60)
    expect(tierOf(score)).toBe('sing')
  })

  it('no visit + old + processed = silent', () => {
    const item = mkItem({ status: 'kept', savedAt: NOW - 200 * DAY })
    const score = computeEchoIndex({ item, visitCount: 0, now: NOW })
    // 0 + 0 + 0 + 0 + 0 + (-15) = clamped to 0
    expect(score).toBeLessThan(30)
    expect(tierOf(score)).toBe('silent')
  })

  it('visit cap at 40', () => {
    const item = mkItem({ lastVisitedAt: NOW - 1 * DAY })
    const lo = computeEchoIndex({ item, visitCount: 8, now: NOW })
    const hi = computeEchoIndex({ item, visitCount: 20, now: NOW })
    // 8*5 = 40 (cap), 20*5 = 100 → cap 40. 两者 score 相同
    expect(lo).toBe(hi)
  })

  it('wake fatigue reduces score', () => {
    const fresh = mkItem({ lastVisitedAt: NOW - 1 * DAY, wakeCount: 0 })
    const fatigued = mkItem({ lastVisitedAt: NOW - 1 * DAY, wakeCount: 8 })
    const scoreFresh = computeEchoIndex({ item: fresh, visitCount: 4, now: NOW })
    const scoreFatigued = computeEchoIndex({ item: fatigued, visitCount: 4, now: NOW })
    expect(scoreFatigued).toBeLessThan(scoreFresh)
    expect(scoreFresh - scoreFatigued).toBe(10) // 8*2 capped at 10
  })

  it('notes boost score', () => {
    const plain = mkItem({ lastVisitedAt: NOW - 1 * DAY })
    const noted = mkItem({ lastVisitedAt: NOW - 1 * DAY, userNote: 'a', privateNote: 'b' })
    const sPlain = computeEchoIndex({ item: plain, visitCount: 2, now: NOW })
    const sNoted = computeEchoIndex({ item: noted, visitCount: 2, now: NOW })
    expect(sNoted - sPlain).toBe(10) // 5+5
  })

  it('lastVisitedAt overrides savedAt for freshness', () => {
    // old savedAt but recent visit → freshness should be high
    const item = mkItem({ savedAt: NOW - 200 * DAY, lastVisitedAt: NOW - 1 * DAY })
    const score = computeEchoIndex({ item, visitCount: 3, now: NOW })
    // visit 15 + unprocessed 25 + freshness 15 = 55
    expect(score).toBeGreaterThanOrEqual(50)
  })

  it('clamps to 0..100', () => {
    // 不可能负数
    const bad = mkItem({ status: 'released', savedAt: NOW - 300 * DAY, wakeCount: 20 })
    expect(computeEchoIndex({ item: bad, visitCount: 0, now: NOW })).toBe(0)

    // 不可能 > 100
    const everything = mkItem({
      lastVisitedAt: NOW - 1 * DAY,
      userNote: 'a',
      privateNote: 'b',
    })
    expect(computeEchoIndex({ item: everything, visitCount: 20, now: NOW })).toBeLessThanOrEqual(100)
  })
})

describe('tierOf', () => {
  it('boundaries', () => {
    expect(tierOf(0)).toBe('silent')
    expect(tierOf(29)).toBe('silent')
    expect(tierOf(30)).toBe('murmur')
    expect(tierOf(59)).toBe('murmur')
    expect(tierOf(60)).toBe('sing')
    expect(tierOf(84)).toBe('sing')
    expect(tierOf(85)).toBe('shout')
    expect(tierOf(100)).toBe('shout')
  })
})

describe('countReadyToEcho', () => {
  it('counts only pending|kept content items at sing+ tier', () => {
    const items: Item[] = [
      mkItem({ id: '1', lastVisitedAt: NOW - 1 * DAY }),                              // sing
      mkItem({ id: '2', lastVisitedAt: NOW - 1 * DAY, status: 'kept' }),              // murmur (no unprocessed bonus)
      mkItem({ id: '3', status: 'released' }),                                          // skipped (released)
      mkItem({ id: '4', type: 'tool', lastVisitedAt: NOW - 1 * DAY }),                  // skipped (tool)
      mkItem({ id: '5', lastVisitedAt: NOW - 1 * DAY }),                                // sing
    ]
    const visits = new Map([
      ['1', 6], ['2', 6], ['3', 6], ['4', 6], ['5', 8],
    ])
    expect(countReadyToEcho(items, visits, NOW)).toBe(2)
  })

  it('returns 0 for empty input', () => {
    expect(countReadyToEcho([], new Map(), NOW)).toBe(0)
  })
})
