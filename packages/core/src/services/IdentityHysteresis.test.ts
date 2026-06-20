/**
 * v0.1.4 滞后区护航 · 解决"同一天身份反复跳变"
 *
 * 起因: 用户截图 90d 窗口 7 cluster + top1=38.1% + entNorm=0.78 → 落"看不清"
 *      用户反馈"同一天结果会一直变"——临界值附近的小波动让身份在 SPECIALIST/GENERALIST/看不清间跳
 *
 * 修法: computeAllIdentities 接受 previousCards · radius 落中间态前先用"宽松版条件"重判 prev 身份
 *      在 ± HYSTERESIS_*_BAND 死区内视为仍是 prev 身份, 不让用户看到身份反复变化
 *
 * 此测试: 同一份数据多次跑结果一致; 临界值小波动时 prev 身份保留; 真正远离时才换
 */

import { describe, it, expect } from 'vitest'
import { computeAllIdentities } from './IdentityService.js'
import type { Item, Cluster, IdentityCard, RadiusIdentity } from '@chord/types'

const NOW = 1_700_000_000_000
const DAY = 86_400_000

/** 造一个 cluster 分布的 fixture: clusters=[[name, count], ...], 全 pending 全 content */
function buildItems(clusters: Array<[string, number]>): Item[] {
  const items: Item[] = []
  let id = 0
  for (const [name, count] of clusters) {
    for (let i = 0; i < count; i++) {
      items.push({
        id: `i${id++}`,
        type: 'content',
        url: `https://example.com/${id}`,
        title: `t${id}`,
        source: 'manual',
        sourceDomain: 'example.com',
        favicon: '',
        savedAt: NOW - 30 * DAY,  // 都在 90d 窗口内
        firstSeenAt: NOW - 30 * DAY,
        status: 'pending',
        wakeCount: 0,
        cluster: name,
      } as Item)
    }
  }
  return items
}

function getRadius(cards: IdentityCard[]): RadiusIdentity | null {
  return (cards.find((c) => c.dimension === 'radius')?.id as RadiusIdentity | undefined) ?? null
}

describe('滞后区 · 同一份数据多次跑必须一致', () => {
  it('GENERALIST 长尾形态 · 同一数据跑 5 次结果稳定', () => {
    // 用户真实场景: 7 cluster + top1=38.1% + entNorm≈0.78
    const items = buildItems([
      ['AI 工程与论文', 40], ['AI 应用与工具', 34], ['投资与金融市场', 10],
      ['招聘信息', 8], ['测试与面试', 7], ['编程与软件开发', 4], ['个人创作与生活', 2],
    ])
    const results = [0,1,2,3,4].map(() => getRadius(computeAllIdentities(items, undefined, NOW)))
    expect(results.every((r) => r === results[0])).toBe(true)
    expect(results[0]).toBe('generalist')  // v0.1.4 阈值 8→7 cover
  })

  it('SPECIALIST 形态 · 同一数据跑 5 次结果稳定', () => {
    const items = buildItems([
      ['投资', 60], ['AI', 15], ['职场', 10], ['其他', 5],
    ])
    const results = [0,1,2,3,4].map(() => getRadius(computeAllIdentities(items, undefined, NOW)))
    expect(results.every((r) => r === results[0])).toBe(true)
    expect(results[0]).toBe('specialist')
  })
})

describe('滞后区 · 临界值小波动 prev 身份保留', () => {
  it('prev=GENERALIST + cluster 7→6 (差 1 在死区内) · 保留 GENERALIST', () => {
    // T0: 7 cluster + top1=38% → GENERALIST 长尾路径触发
    const items0 = buildItems([
      ['A', 40], ['B', 34], ['C', 10], ['D', 8], ['E', 7], ['F', 4], ['G', 2],
    ])
    const cards0 = computeAllIdentities(items0, undefined, NOW)
    expect(getRadius(cards0)).toBe('generalist')

    // T1: 6 cluster (G 没了) — 没滞后区会落中间态, 有滞后区保留 GENERALIST
    const items1 = buildItems([
      ['A', 40], ['B', 34], ['C', 10], ['D', 8], ['E', 7], ['F', 4],
    ])
    const cardsNoCache = computeAllIdentities(items1, undefined, NOW)
    const cardsWithCache = computeAllIdentities(items1, undefined, NOW, cards0)
    // 不带 cache → null (中间态)
    expect(getRadius(cardsNoCache)).toBe(null)
    // 带 cache → 保留 generalist
    expect(getRadius(cardsWithCache)).toBe('generalist')
  })

  it('prev=SPECIALIST + top1 41%→38% (差 3% 在 5% 死区内) · 保留 SPECIALIST', () => {
    // T0: top1=43% (>40%), top3=82% → SPECIALIST
    const items0 = buildItems([
      ['投资', 43], ['AI', 25], ['职场', 14], ['其他', 18],
    ])
    const cards0 = computeAllIdentities(items0, undefined, NOW)
    expect(getRadius(cards0)).toBe('specialist')

    // T1: top1 跌到 38% — 失去 SPECIALIST 严格阈值 (40%), 但在死区内
    const items1 = buildItems([
      ['投资', 38], ['AI', 25], ['职场', 18], ['其他', 19],
    ])
    expect(getRadius(computeAllIdentities(items1, undefined, NOW))).toBe(null)  // 无 cache 看不清
    expect(getRadius(computeAllIdentities(items1, undefined, NOW, cards0))).toBe('specialist')  // 有 cache 保留
  })
})

describe('滞后区 · 数据真正远离时换身份', () => {
  it('prev=SPECIALIST + top1 暴跌到 25% (远离阈值) · 换 GENERALIST', () => {
    const items0 = buildItems([['A', 60], ['B', 25], ['C', 15]])
    const cards0 = computeAllIdentities(items0, undefined, NOW)
    expect(getRadius(cards0)).toBe('specialist')

    // 用户真的换了形态: top1 25%, 10 cluster 均匀
    const items1 = buildItems([
      ['A', 25], ['B', 25], ['C', 15], ['D', 15], ['E', 8], ['F', 6], ['G', 3], ['H', 3], ['I', 2], ['J', 2],
    ])
    // 即使 cache 是 specialist, 新数据远离 → 应判 generalist
    const result = getRadius(computeAllIdentities(items1, undefined, NOW, cards0))
    expect(result).toBe('generalist')
  })

  it('prev=GENERALIST + top1 飙到 60% (远离阈值) · 换 SPECIALIST', () => {
    const items0 = buildItems([
      ['A', 30], ['B', 25], ['C', 15], ['D', 10], ['E', 8], ['F', 7], ['G', 5],
    ])
    const cards0 = computeAllIdentities(items0, undefined, NOW)
    expect(getRadius(cards0)).toBe('generalist')

    const items1 = buildItems([['A', 60], ['B', 20], ['C', 12], ['D', 8]])
    const result = getRadius(computeAllIdentities(items1, undefined, NOW, cards0))
    expect(result).toBe('specialist')
  })
})

describe('阈值微调 · GENERALIST_LONGTAIL_MIN_CLUSTERS 8→7', () => {
  it('用户实际数据 (7 cluster + top1=38% + top3=80%) · 不带 cache 也判 GENERALIST', () => {
    const items = buildItems([
      ['AI 工程与论文', 40], ['AI 应用与工具', 34], ['投资与金融市场', 10],
      ['招聘信息', 8], ['测试与面试', 7], ['编程与软件开发', 4], ['个人创作与生活', 2],
    ])
    expect(getRadius(computeAllIdentities(items, undefined, NOW))).toBe('generalist')
  })
})
