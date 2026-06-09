import { describe, it, expect } from 'vitest'
import { predictReason } from './ReleaseReasonPredictor.js'
import type { Item } from '@chord/types'

const NOW = 1700000000000  // 固定时间戳便于断言
const DAY = 86400_000

function mkItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'x',
    url: 'https://example.com',
    title: 'X',
    favicon: '',
    savedAt: NOW - 60 * DAY,
    sourceDomain: 'example.com',
    type: 'content',
    status: 'kept',
    wakeCount: 0,
    source: 'bookmark',
    ...overrides,
  }
}

describe('ReleaseReasonPredictor', () => {
  it('migratedFromUsed → used (highest priority)', () => {
    const item = mkItem({ migratedFromUsed: true, savedAt: NOW - 5 * DAY })
    // 即使本来该走"misjudged"（新存+从未访问），migratedFromUsed 优先
    expect(predictReason(item, { visitCount: 0, now: NOW })).toBe('used')
  })

  it('high visit + old item → used', () => {
    const item = mkItem({ savedAt: NOW - 60 * DAY })
    expect(predictReason(item, { visitCount: 8, now: NOW })).toBe('used')
  })

  it('high visit but new item → not used (need both)', () => {
    const item = mkItem({ savedAt: NOW - 10 * DAY })
    // 10 天太新，即使 visit 高也不算"已用过"
    const r = predictReason(item, { visitCount: 8, now: NOW })
    expect(r).not.toBe('used')
  })

  it('many wakes + zero visits → not_interested', () => {
    const item = mkItem({ wakeCount: 6, savedAt: NOW - 90 * DAY })
    expect(predictReason(item, { visitCount: 0, now: NOW })).toBe('not_interested')
  })

  it('new save + zero visits → misjudged', () => {
    const item = mkItem({ savedAt: NOW - 10 * DAY, wakeCount: 0 })
    expect(predictReason(item, { visitCount: 0, now: NOW })).toBe('misjudged')
  })

  it('cluster heavily released → replaced', () => {
    const item = mkItem({ savedAt: NOW - 60 * DAY, wakeCount: 1 })
    expect(predictReason(item, { visitCount: 1, now: NOW, clusterReleasedCount: 7 })).toBe('replaced')
  })

  it('very old + zero visit + no notes → no_time', () => {
    const item = mkItem({ savedAt: NOW - 200 * DAY, wakeCount: 1 })
    expect(predictReason(item, { visitCount: 0, now: NOW })).toBe('no_time')
  })

  it('very old but has note → not no_time (returns null or other)', () => {
    const item = mkItem({ savedAt: NOW - 200 * DAY, wakeCount: 1, userNote: 'I wrote something' })
    const r = predictReason(item, { visitCount: 0, now: NOW })
    expect(r).not.toBe('no_time')
  })

  it('ambiguous case → returns null', () => {
    // 中等龄期、有一两次访问、无强信号
    const item = mkItem({ savedAt: NOW - 60 * DAY, wakeCount: 2 })
    expect(predictReason(item, { visitCount: 1, now: NOW })).toBe(null)
  })

  it('priority: migratedFromUsed beats no_time', () => {
    const item = mkItem({ migratedFromUsed: true, savedAt: NOW - 365 * DAY, wakeCount: 1 })
    expect(predictReason(item, { visitCount: 0, now: NOW })).toBe('used')
  })

  it('priority: high visit beats wake_count signal', () => {
    // wake>=5 + visit=0 应该是 not_interested
    // 但如果 visit>=3 + old，应该是 used（priority 高）
    const item = mkItem({ savedAt: NOW - 60 * DAY, wakeCount: 6 })
    expect(predictReason(item, { visitCount: 4, now: NOW })).toBe('used')
  })
})
