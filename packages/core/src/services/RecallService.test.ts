import { describe, it, expect } from 'vitest'
import { evaluate, buildRecall14Message, buildRecall30Message, recordFired } from './RecallService.js'

const NOW = 1700000000000
const DAY = 86400_000

describe('RecallService.evaluate', () => {
  it('new user (no lastOpenedAt) → nothing fires', () => {
    const r = evaluate(undefined, {}, NOW)
    expect(r.shouldDimBadge).toBe(false)
    expect(r.triggers).toEqual([])
  })

  it('1 day absent → nothing', () => {
    const r = evaluate(NOW - 1 * DAY, {}, NOW)
    expect(r.shouldDimBadge).toBe(false)
    expect(r.triggers).toEqual([])
  })

  it('3 days absent → dim badge, no trigger', () => {
    const r = evaluate(NOW - 3 * DAY, {}, NOW)
    expect(r.shouldDimBadge).toBe(true)
    expect(r.triggers).toEqual([])
  })

  it('14 days absent → fire absent_14', () => {
    const r = evaluate(NOW - 15 * DAY, {}, NOW)
    expect(r.shouldDimBadge).toBe(true)
    expect(r.triggers).toEqual(['absent_14'])
  })

  it('30 days absent → fire both absent_14 and absent_30 if neither fired', () => {
    const r = evaluate(NOW - 35 * DAY, {}, NOW)
    expect(r.shouldDimBadge).toBe(true)
    expect(r.triggers).toEqual(['absent_14', 'absent_30'])
  })

  it('14 already fired → only fire 30', () => {
    const r = evaluate(NOW - 35 * DAY, { absent_14: NOW - 20 * DAY }, NOW)
    expect(r.triggers).toEqual(['absent_30'])
  })

  it('both fired → no triggers (no repeat)', () => {
    const r = evaluate(NOW - 35 * DAY, { absent_14: NOW - 20 * DAY, absent_30: NOW - 5 * DAY }, NOW)
    expect(r.triggers).toEqual([])
  })

  it('60+ days → no triggers (silent), but badge dimmed', () => {
    const r = evaluate(NOW - 70 * DAY, { absent_14: NOW - 56 * DAY, absent_30: NOW - 40 * DAY }, NOW)
    expect(r.shouldDimBadge).toBe(true)
    expect(r.triggers).toEqual([])  // 已 fired，60+ 不重复
  })
})

describe('buildRecall14Message', () => {
  it('with topCluster + delta', () => {
    const r = buildRecall14Message({ topCluster: 'AI 工程', delta: 23 })
    expect(r.title).toBe('书房悄悄发生了什么')
    expect(r.message).toContain('AI 工程')
    expect(r.message).toContain('23')
  })

  it('with totalAdded only (no cluster info)', () => {
    const r = buildRecall14Message({ totalAdded: 12 })
    expect(r.message).toContain('12')
  })

  it('empty summary → graceful fallback', () => {
    const r = buildRecall14Message({})
    expect(r.title).toBe('书房悄悄发生了什么')
    expect(r.message.length).toBeGreaterThan(5)
  })
})

describe('buildRecall30Message', () => {
  it('returns fixed format', () => {
    const r = buildRecall30Message()
    expect(r.title).toBe('我们想你')
    expect(r.message).toContain('告诉我们')
  })
})

describe('recordFired', () => {
  it('records trigger with timestamp', () => {
    const log = recordFired({}, 'absent_14', NOW)
    expect(log.absent_14).toBe(NOW)
  })
  it('does not mutate input', () => {
    const original = {}
    const next = recordFired(original, 'absent_14', NOW)
    expect(original).toEqual({})
    expect(next).not.toBe(original)
  })
})
