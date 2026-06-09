import { describe, it, expect } from 'vitest'
import { computeStats, topAnomalies, userFacingHint } from './IntentValidationService.js'
import type { Item, SaveIntent, ReleaseReason, IntentSignal } from '@chord/types'

const NOW = 1700000000000

function mkItem(overrides: Partial<Item> = {}): Item {
  return {
    id: Math.random().toString(36).slice(2),
    url: 'https://example.com/a',
    title: 'Sample',
    favicon: '',
    savedAt: NOW - 86400_000 * 30,
    sourceDomain: 'example.com',
    type: 'content',
    status: 'released',
    wakeCount: 0,
    source: 'bookmark',
    ...overrides,
  }
}

/** 构造一条 released item + 指定 saveIntent + releaseReason */
function released(intent: SaveIntent, reason: ReleaseReason): Item {
  const signal: IntentSignal = { intent, confidence: 1.0, source: 'rule' }
  return mkItem({
    status: 'released',
    saveIntent: intent,
    saveIntents: [signal],
    releaseReason: reason,
    processedAt: NOW,
  })
}

/** 重复 n 次 */
function repeat(n: number, fn: () => Item): Item[] {
  return Array.from({ length: n }, fn)
}

describe('IntentValidationService.computeStats', () => {
  it('空列表 → 全 0', () => {
    const stats = computeStats([])
    expect(stats.totalReleased).toBe(0)
    expect(stats.totalAnalyzed).toBe(0)
    expect(stats.anomalies).toEqual([])
    expect(stats.perIntentTotal.tool).toBe(0)
  })

  it('non-released item 不计入 totalAnalyzed', () => {
    const items: Item[] = [
      mkItem({ status: 'kept', saveIntent: 'tool', releaseReason: 'used' }),
      mkItem({ status: 'pending' }),
    ]
    const stats = computeStats(items)
    expect(stats.totalReleased).toBe(0)
    expect(stats.totalAnalyzed).toBe(0)
  })

  it('released 但缺 releaseReason → 不计入 analyzed（仍计 released）', () => {
    const items: Item[] = [
      mkItem({ status: 'released', saveIntent: 'tool' }), // no releaseReason
    ]
    const stats = computeStats(items)
    expect(stats.totalReleased).toBe(1)
    expect(stats.totalAnalyzed).toBe(0)
  })

  it('正确累计 matrix', () => {
    const items: Item[] = [
      released('tool', 'used'),
      released('tool', 'used'),
      released('tool', 'not_interested'),
      released('learn', 'no_time'),
    ]
    const stats = computeStats(items)
    expect(stats.matrix.tool.used).toBe(2)
    expect(stats.matrix.tool.not_interested).toBe(1)
    expect(stats.matrix.learn.no_time).toBe(1)
    expect(stats.perIntentTotal.tool).toBe(3)
    expect(stats.perIntentTotal.learn).toBe(1)
    expect(stats.totalAnalyzed).toBe(4)
  })

  it('样本 < 5 不算异常', () => {
    // 4 条 tool 全是 not_interested → 100%，但样本不足
    const items = repeat(4, () => released('tool', 'not_interested'))
    const stats = computeStats(items)
    expect(stats.anomalies).toEqual([])
  })

  it('tool + not_interested ≥ 30% + 样本足够 → high severity anomaly', () => {
    // 10 条 tool：4 条 not_interested (40%), 6 条 used
    const items: Item[] = [
      ...repeat(4, () => released('tool', 'not_interested')),
      ...repeat(6, () => released('tool', 'used')),
    ]
    const stats = computeStats(items)
    const ano = stats.anomalies.find(
      (a) => a.intent === 'tool' && a.reason === 'not_interested',
    )
    expect(ano).toBeDefined()
    expect(ano!.severity).toBe('high')
    expect(ano!.count).toBe(4)
    expect(ano!.rate).toBeCloseTo(0.4, 2)
  })

  it('inspire + misjudged ≥ 40% → high severity（BC-012 detection）', () => {
    // 10 条 inspire：5 条 misjudged (50%)
    const items: Item[] = [
      ...repeat(5, () => released('inspire', 'misjudged')),
      ...repeat(5, () => released('inspire', 'not_interested')),
    ]
    const stats = computeStats(items)
    const ano = stats.anomalies.find(
      (a) => a.intent === 'inspire' && a.reason === 'misjudged',
    )
    expect(ano).toBeDefined()
    expect(ano!.severity).toBe('high')
    expect(ano!.hint).toContain('BC-012')
  })

  it('低于 threshold 不产生 anomaly', () => {
    // tool + not_interested 20%（threshold 30%）
    const items: Item[] = [
      ...repeat(2, () => released('tool', 'not_interested')),
      ...repeat(8, () => released('tool', 'used')),
    ]
    const stats = computeStats(items)
    const ano = stats.anomalies.find(
      (a) => a.intent === 'tool' && a.reason === 'not_interested',
    )
    expect(ano).toBeUndefined()
  })

  it('aspire + used 正常（不算异常）', () => {
    // 10 条全是 aspire + used → 不应产出 anomaly（这是好信号）
    const items = repeat(10, () => released('aspire', 'used'))
    const stats = computeStats(items)
    const ano = stats.anomalies.find(
      (a) => a.intent === 'aspire' && a.reason === 'used',
    )
    expect(ano).toBeUndefined()
  })

  it('忽略缺 saveIntent 的 item', () => {
    const items: Item[] = [
      mkItem({ status: 'released', releaseReason: 'used' }),  // 无 saveIntent
    ]
    const stats = computeStats(items)
    expect(stats.totalAnalyzed).toBe(0)
  })
})

describe('IntentValidationService.topAnomalies', () => {
  it('high severity 排在前', () => {
    const items: Item[] = [
      // tool + not_interested 40% high
      ...repeat(4, () => released('tool', 'not_interested')),
      ...repeat(6, () => released('tool', 'used')),
      // track + misjudged 40% low
      ...repeat(4, () => released('track', 'misjudged')),
      ...repeat(6, () => released('track', 'no_time')),
    ]
    const stats = computeStats(items)
    const top = topAnomalies(stats, 5)
    expect(top.length).toBeGreaterThan(0)
    expect(top[0]!.severity).toBe('high')
  })

  it('同等级按 rate 降序', () => {
    const items: Item[] = [
      // tool + not_interested 50% high
      ...repeat(5, () => released('tool', 'not_interested')),
      ...repeat(5, () => released('tool', 'used')),
      // inspire + misjudged 60% high
      ...repeat(6, () => released('inspire', 'misjudged')),
      ...repeat(4, () => released('inspire', 'not_interested')),
    ]
    const stats = computeStats(items)
    const top = topAnomalies(stats, 5)
    const highs = top.filter((a) => a.severity === 'high')
    if (highs.length >= 2) {
      expect(highs[0]!.rate).toBeGreaterThanOrEqual(highs[1]!.rate)
    }
  })

  it('limit n 生效', () => {
    const items: Item[] = [
      ...repeat(4, () => released('tool', 'not_interested')),
      ...repeat(6, () => released('tool', 'used')),
      ...repeat(5, () => released('inspire', 'misjudged')),
      ...repeat(5, () => released('inspire', 'not_interested')),
    ]
    const stats = computeStats(items)
    const top = topAnomalies(stats, 1)
    expect(top.length).toBe(1)
  })
})

describe('IntentValidationService.userFacingHint', () => {
  it('样本不足 10 → null', () => {
    const items = repeat(8, () => released('tool', 'not_interested'))
    const stats = computeStats(items)
    expect(userFacingHint(stats)).toBeNull()
  })

  it('无 high severity → null', () => {
    // 全是正常的 aspire + used
    const items = repeat(15, () => released('aspire', 'used'))
    const stats = computeStats(items)
    expect(userFacingHint(stats)).toBeNull()
  })

  it('high anomaly 时返回中文提示', () => {
    const items: Item[] = [
      ...repeat(5, () => released('inspire', 'misjudged')),
      ...repeat(5, () => released('inspire', 'not_interested')),
      ...repeat(5, () => released('aspire', 'used')),  // 凑 totalAnalyzed >= 10
    ]
    const stats = computeStats(items)
    const hint = userFacingHint(stats)
    expect(hint).not.toBeNull()
    expect(hint).toContain('意图分类可能有偏差')
  })
})
