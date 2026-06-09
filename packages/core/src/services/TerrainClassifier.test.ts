/** TerrainClassifier 单测 · 5 种 type 各 1 个典型 + 边缘 case */
import { describe, it, expect } from 'vitest'
import { classifyTerrain, classifyAllClusters, pickRepresentatives } from './TerrainClassifier.js'
import type { Item } from '@chord/types'

const DAY = 86_400_000
const NOW = 1735689600000  // 固定时间方便复现（2025-01-01）

function mkItem(opts: Partial<Item> & { daysAgo: number }): Item {
  return {
    id: opts.id ?? Math.random().toString(36).slice(2),
    url: opts.url ?? 'https://example.com/' + (opts.id ?? Math.random()),
    title: opts.title ?? 'test',
    favicon: '',
    savedAt: NOW - opts.daysAgo * DAY,
    sourceDomain: 'example.com',
    type: 'content',
    status: opts.status ?? 'pending',
    wakeCount: 0,
    source: 'bookmark',
    usageChip: opts.usageChip,
    cluster: opts.cluster ?? 'test',
  }
}

describe('TerrainClassifier · 5 类典型样本', () => {
  it('ember · 最近爆发（recent30 ≥ 3 + > prev × 1.5）', () => {
    // 30 天内 10 条，30-90 天 1 条
    const items: Item[] = []
    for (let i = 0; i < 10; i++) items.push(mkItem({ daysAgo: i + 1 }))  // 最近 30 天
    items.push(mkItem({ daysAgo: 60 }))                                   // prev30-90: 1 条
    const r = classifyTerrain({ items, now: NOW })
    expect(r.type).toBe('ember')
    expect(r.recent30).toBe(10)
    expect(r.prev30to90).toBe(1)
  })

  it('sleep · 最近一条 > 90 天前 + 体量够', () => {
    const items: Item[] = []
    for (let i = 0; i < 8; i++) items.push(mkItem({ daysAgo: 200 + i * 10 }))  // 都 > 90 天
    const r = classifyTerrain({ items, now: NOW })
    expect(r.type).toBe('sleep')
    expect(r.lastSaveDays).toBeGreaterThan(90)
  })

  it('forest · reallyUsedRate ≥ 50%（用 visitCount 模拟真用过）', () => {
    const items: Item[] = []
    for (let i = 0; i < 10; i++) items.push(mkItem({ id: `f-${i}`, daysAgo: 30 + i }))  // 不进 ember/sleep
    const visitCounts = new Map<string, number>()
    for (let i = 0; i < 6; i++) visitCounts.set(`f-${i}`, 3)  // 60% 真用过
    const r = classifyTerrain({ items, visitCounts, now: NOW })
    expect(r.type).toBe('forest')
    expect(r.reallyUsedRate).toBeGreaterThanOrEqual(0.5)
  })

  it('swamp · reallyUsedRate < 30% + items ≥ 10', () => {
    // 30-90 天的 12 条，没有 visitCount
    const items: Item[] = []
    for (let i = 0; i < 12; i++) items.push(mkItem({ id: `s-${i}`, daysAgo: 35 + i * 3 }))
    const r = classifyTerrain({ items, now: NOW })
    expect(r.type).toBe('swamp')
    expect(r.reallyUsedRate).toBeLessThan(0.3)
    expect(r.total).toBeGreaterThanOrEqual(10)
  })

  it('middle · 中间态（50% > reallyUsedRate > 30%）', () => {
    const items: Item[] = []
    for (let i = 0; i < 10; i++) items.push(mkItem({ id: `m-${i}`, daysAgo: 30 + i }))
    const visitCounts = new Map<string, number>()
    for (let i = 0; i < 4; i++) visitCounts.set(`m-${i}`, 2)  // 40% 真用过
    const r = classifyTerrain({ items, visitCounts, now: NOW })
    expect(r.type).toBe('middle')
  })

  it('middle · 小于阈值的 cluster（items < 5）', () => {
    const items: Item[] = []
    for (let i = 0; i < 3; i++) items.push(mkItem({ daysAgo: 30 + i }))
    const r = classifyTerrain({ items, now: NOW })
    expect(r.type).toBe('middle')
  })

  it('ember 优先级 > forest · 最近爆发覆盖在用度', () => {
    // 最近 30 天 5 条，30-90 天 1 条 + 全部真用过（高 reallyUsedRate）
    const items: Item[] = []
    for (let i = 0; i < 5; i++) items.push(mkItem({ id: `e-${i}`, daysAgo: i + 1 }))
    items.push(mkItem({ id: 'e-old', daysAgo: 60 }))
    const visitCounts = new Map<string, number>()
    for (const it of items) visitCounts.set(it.id, 5)
    const r = classifyTerrain({ items, visitCounts, now: NOW })
    expect(r.type).toBe('ember')  // ember 先判定
  })

  it('sleep 优先级 > swamp · 长期无动作覆盖积压', () => {
    // 全部 200 天前 + 体量 12 + 无 visit
    const items: Item[] = []
    for (let i = 0; i < 12; i++) items.push(mkItem({ daysAgo: 200 + i }))
    const r = classifyTerrain({ items, now: NOW })
    expect(r.type).toBe('sleep')  // sleep 先判定
  })
})

describe('classifyAllClusters + pickRepresentatives · §3 4 块代表 picker', () => {
  it('多 cluster 场景 · 各 type 挑 score 最高的', () => {
    // 5 cluster, 4 type + middle
    const clusters = new Map<string, Item[]>()
    // forest cluster (高 visit)
    const forestItems = Array.from({ length: 10 }, (_, i) => mkItem({ id: `f-${i}`, daysAgo: 30 + i }))
    clusters.set('forestA', forestItems)
    // swamp cluster (低 visit, 体量大)
    clusters.set('swampA', Array.from({ length: 15 }, (_, i) => mkItem({ id: `s-${i}`, daysAgo: 35 + i })))
    // ember cluster
    const emberItems: Item[] = []
    for (let i = 0; i < 5; i++) emberItems.push(mkItem({ id: `e-${i}`, daysAgo: i + 1 }))
    emberItems.push(mkItem({ id: 'e-old', daysAgo: 60 }))
    clusters.set('emberA', emberItems)
    // sleep cluster
    clusters.set('sleepA', Array.from({ length: 10 }, (_, i) => mkItem({ daysAgo: 200 + i })))
    // middle cluster
    const middleItems = Array.from({ length: 10 }, (_, i) => mkItem({ id: `m-${i}`, daysAgo: 30 + i }))
    clusters.set('middleA', middleItems)

    const visitCounts = new Map<string, number>()
    for (let i = 0; i < 6; i++) visitCounts.set(`f-${i}`, 3)       // forest: 60% used
    for (let i = 0; i < 4; i++) visitCounts.set(`m-${i}`, 2)       // middle: 40% used

    const results = classifyAllClusters(clusters, visitCounts, NOW)
    const picks = pickRepresentatives(results)

    expect(picks.forest?.cluster).toBe('forestA')
    expect(picks.swamp?.cluster).toBe('swampA')
    expect(picks.ember?.cluster).toBe('emberA')
    expect(picks.sleep?.cluster).toBe('sleepA')
    expect(picks.middleCount).toBe(1)  // middleA
  })

  it('没有任何 cluster 命中某 type → 该槽位 null', () => {
    const clusters = new Map<string, Item[]>()
    // 只有 1 个 forest cluster
    const items = Array.from({ length: 10 }, (_, i) => mkItem({ id: `f-${i}`, daysAgo: 30 + i }))
    clusters.set('only', items)
    const visitCounts = new Map<string, number>()
    for (let i = 0; i < 6; i++) visitCounts.set(`f-${i}`, 3)

    const results = classifyAllClusters(clusters, visitCounts, NOW)
    const picks = pickRepresentatives(results)

    expect(picks.forest?.cluster).toBe('only')
    expect(picks.swamp).toBeNull()
    expect(picks.ember).toBeNull()
    expect(picks.sleep).toBeNull()
  })
})
