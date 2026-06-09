import { describe, it, expect } from 'vitest'
import { evaluate, matchThreshold, VISIT_THRESHOLDS, COOLDOWN_DAYS } from './EchoMomentService.js'
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

describe('matchThreshold', () => {
  it('crosses 3 threshold', () => {
    expect(matchThreshold(4, 2)).toBe(3)
  })
  it('crosses 7 threshold', () => {
    expect(matchThreshold(8, 6)).toBe(7)
  })
  it('crosses 15 threshold', () => {
    expect(matchThreshold(16, 14)).toBe(15)
  })
  it('returns highest if multiple crossed', () => {
    expect(matchThreshold(10, 0)).toBe(7)   // crosses 3 and 7, pick 7
    expect(matchThreshold(20, 0)).toBe(15)
    expect(matchThreshold(40, 0)).toBe(30)
  })
  it('no threshold crossed when current = previous', () => {
    expect(matchThreshold(5, 5)).toBeUndefined()
  })
  it('no threshold crossed within band', () => {
    expect(matchThreshold(6, 4)).toBeUndefined()  // both within 3-7 band
  })
  it('current less than previous returns undefined', () => {
    expect(matchThreshold(2, 5)).toBeUndefined()
  })
})

describe('EchoMomentService.evaluate', () => {
  it('fires when visit crosses 3 threshold', () => {
    const item = mkItem()
    const r = evaluate(item, 4, NOW)
    expect(r.shouldTrigger).toBe(true)
    expect(r.threshold).toBe(3)
    expect(r.message).toContain('回来')
  })

  it('fires "7次回访" with actual count in message', () => {
    const item = mkItem()
    const r = evaluate(item, 8, NOW)
    expect(r.shouldTrigger).toBe(true)
    expect(r.threshold).toBe(7)
    expect(r.message).toContain('8')
  })

  it('does not fire for released items', () => {
    const item = mkItem({ status: 'released' })
    expect(evaluate(item, 10, NOW).shouldTrigger).toBe(false)
  })

  it('does not fire for tool type', () => {
    const item = mkItem({ type: 'tool' })
    expect(evaluate(item, 10, NOW).shouldTrigger).toBe(false)
  })

  it('respects 14-day cooldown', () => {
    const item = mkItem({
      echoMomentTriggeredAt: NOW - 5 * DAY,
      echoMomentLastVisitCount: 3,
    })
    const r = evaluate(item, 8, NOW)
    expect(r.shouldTrigger).toBe(false)
    expect(r.reason).toContain('cooldown')
  })

  it('fires again after cooldown expires', () => {
    const item = mkItem({
      echoMomentTriggeredAt: NOW - 15 * DAY,
      echoMomentLastVisitCount: 3,
    })
    const r = evaluate(item, 8, NOW)
    expect(r.shouldTrigger).toBe(true)
    expect(r.threshold).toBe(7)
  })

  it('does not fire if visit did not cross any new threshold', () => {
    const item = mkItem({
      echoMomentLastVisitCount: 7,
    })
    // visit=8 vs last=7 → no new threshold crossed (still in 7-15 band)
    const r = evaluate(item, 8, NOW)
    expect(r.shouldTrigger).toBe(false)
  })

  it('fires for first-time visit crossing if echoMomentLastVisitCount is undefined', () => {
    const item = mkItem()  // no echoMomentLastVisitCount → defaults to 0
    const r = evaluate(item, 5, NOW)
    expect(r.shouldTrigger).toBe(true)
    expect(r.threshold).toBe(3)
  })

  it('all 4 thresholds have distinct templates', () => {
    const messages = new Set<string>()
    for (const t of [3, 7, 15, 30] as const) {
      const item = mkItem()
      const r = evaluate(item, t, NOW)
      expect(r.shouldTrigger).toBe(true)
      messages.add(r.message!)
    }
    expect(messages.size).toBe(4)
  })
})
