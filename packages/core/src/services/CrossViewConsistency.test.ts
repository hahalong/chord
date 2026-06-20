/**
 * 跨视图一致性护航 · v0.1.2 新增
 *
 * 起因: 用户在 v0.1.1 看到"兴趣地图全虚线 / 投资类基本未动 79% pending"
 *       但同一份数据在 §3 隐性自我地形里 "投资 = 真热情之林 79%"
 *       两个视图给出完全相反结论, 用户混乱
 *
 * 根因: EngagementService.scoreItem (兴趣地图用) 之前 pending=0 分,
 *       不看 chrome.history visitCount → pending item 始终 zero engagement
 *       TerrainClassifier.classifyTerrain (§3 用) 用 reallyUsedRate = chip='实际用到了' OR visitCount>0 OR lastVisitedAt 近 90d
 *       → 同样 pending 但 visit 多次的 item, §3 判"真用过", 兴趣地图判"基本未动"
 *
 * 修法 v0.1.2: EngagementService.scoreItem 加 visitCount/lastVisitedAt 注入 (~30 分给真访问过的)
 *
 * 此测试: 同一份 items + visitCounts 喂两边, 断言"用过"判定方向一致
 *       任何一方动了"用过"定义, 另一方不同步 → CI 红, 不准发版
 */

import { describe, it, expect } from 'vitest'
import * as EngagementService from './EngagementService.js'
import * as TerrainClassifier from './TerrainClassifier.js'
import type { Item } from '@chord/types'

const NOW = 1_700_000_000_000
const DAY = 86_400_000

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    type: 'content',
    url: 'https://example.com',
    title: 'test',
    source: 'manual',
    savedAt: NOW - 60 * DAY,
    firstSeenAt: NOW - 60 * DAY,
    status: 'pending',
    sourceDomain: 'example.com',
    favicon: '',
    wakeCount: 0,
    ...overrides,
  } as Item
}

describe('跨视图一致性 · EngagementService (兴趣地图) ↔ TerrainClassifier (§3 地形)', () => {
  it('pending + 高 visit (≥5) · 兴趣地图必须给 ≥20 分 · §3 也判 reallyUsed', () => {
    const item = makeItem({ id: 'a', status: 'pending' })
    const visits = new Map([['a', 8]])

    const eng = EngagementService.scoreItem(item, 8, NOW)
    const terrain = TerrainClassifier.classifyTerrain({ items: [item], visitCounts: visits, now: NOW })

    expect(eng.score, '兴趣地图: visit=8 应≥20 分（v0.1.2 修法）').toBeGreaterThanOrEqual(20)
    expect(eng.level, '兴趣地图: visit=8 应判 light/deep').not.toBe('zero')
    expect(terrain.reallyUsedRate, '§3: 1/1 真用过').toBe(1)
  })

  it('pending + visit=1 · 兴趣地图给少量分 · §3 也判 reallyUsed (visitCount>0)', () => {
    const item = makeItem({ id: 'b', status: 'pending' })
    const visits = new Map([['b', 1]])

    const eng = EngagementService.scoreItem(item, 1, NOW)
    const terrain = TerrainClassifier.classifyTerrain({ items: [item], visitCounts: visits, now: NOW })

    expect(eng.score, '兴趣地图: visit=1 应>0').toBeGreaterThan(0)
    expect(terrain.reallyUsedRate, '§3: 1 次访问也算 reallyUsed').toBe(1)
  })

  it('pending + 近 90d lastVisitedAt · 两边都判用过', () => {
    const item = makeItem({ id: 'c', status: 'pending', lastVisitedAt: NOW - 30 * DAY })
    const visits = new Map<string, number>()  // visit 数据可能没拿到

    const eng = EngagementService.scoreItem(item, 0, NOW)
    const terrain = TerrainClassifier.classifyTerrain({ items: [item], visitCounts: visits, now: NOW })

    expect(eng.score, '兴趣地图: 近 90d lastVisitedAt 应≥5 分').toBeGreaterThanOrEqual(5)
    expect(terrain.reallyUsedRate, '§3: 近 90d 算 reallyUsed').toBe(1)
  })

  it('pending + 无任何访问信号 · 两边都判没用过', () => {
    const item = makeItem({ id: 'd', status: 'pending' })

    const eng = EngagementService.scoreItem(item, 0, NOW)
    const terrain = TerrainClassifier.classifyTerrain({ items: [item], visitCounts: new Map(), now: NOW })

    expect(eng.score, '兴趣地图: 纯 pending = 0').toBe(0)
    expect(terrain.reallyUsedRate, '§3: 0/1 没用过').toBe(0)
  })

  it('混合 cluster (10 条 8 条 visit>0) · 兴趣地图均分应反映"真热情" · §3 reallyUsedRate=0.8', () => {
    const items: Item[] = []
    const visits = new Map<string, number>()
    for (let i = 0; i < 10; i++) {
      items.push(makeItem({ id: `m${i}`, status: 'pending' }))
      if (i < 8) visits.set(`m${i}`, 5)  // 8 条 visit=5 → bonus 30
    }

    let scoreSum = 0
    for (const it of items) {
      scoreSum += EngagementService.scoreItem(it, visits.get(it.id) ?? 0, NOW).score
    }
    const avgScore = scoreSum / items.length

    const terrain = TerrainClassifier.classifyTerrain({ items, visitCounts: visits, now: NOW })

    expect(avgScore, '兴趣地图: 80% 重访问 → 均分应 ≥ 20 (避免"全虚线/基本未动")').toBeGreaterThanOrEqual(20)
    expect(terrain.reallyUsedRate, '§3: 0.8 真用过').toBe(0.8)
    // 两个视图方向一致: §3 判真热情时, 兴趣地图也得 light+ 不能 zero
    expect(avgScore >= 20).toBe(terrain.reallyUsedRate >= 0.6)
  })

  it('卡死的 bug 场景回归 · pending + chrome.history 多次访问 · §3 判真热情, 兴趣地图必须同方向', () => {
    // 复刻 v0.1.1 CWS 用户截图: 投资类 cluster
    // §3 判 79% 真热情之林, 兴趣地图却显示"基本未动"
    const items: Item[] = []
    const visits = new Map<string, number>()
    for (let i = 0; i < 19; i++) {
      items.push(makeItem({ id: `inv${i}`, status: 'pending', savedAt: NOW - (60 + i) * DAY }))
      if (i < 15) visits.set(`inv${i}`, 3 + (i % 5))  // 大部分 visit 3-7 次
    }

    const scores = items.map((it) => EngagementService.scoreItem(it, visits.get(it.id) ?? 0, NOW).score)
    const avgScore = scores.reduce((s, n) => s + n, 0) / scores.length
    const nonZeroPct = scores.filter((s) => s > 0).length / scores.length
    const terrain = TerrainClassifier.classifyTerrain({ items, visitCounts: visits, now: NOW })

    // §3 应该判出真热情
    expect(terrain.reallyUsedRate, '§3: 投资类 reallyUsedRate ≥ 0.7').toBeGreaterThanOrEqual(0.7)
    // v0.1.1 bug 复刻: 兴趣地图 100% items 都是 0 分 → 全虚线"基本未动"
    // v0.1.2 修后: 至少 70% items 应 > 0 (有过访问的都该计分)
    expect(nonZeroPct, '兴趣地图: §3 判真热情时, 非零 item 比例 ≥ 0.7').toBeGreaterThanOrEqual(0.7)
    expect(avgScore, '兴趣地图: avg 应 ≥ 15 (避免整体 zero)').toBeGreaterThanOrEqual(15)
  })
})

describe('硬约束 · 任何一方动"用过"定义必须双向同步', () => {
  it('EngagementService.visitPoints 应该至少包含 visitCount + lastVisitedAt 两个信号', () => {
    // 用反射验证: 没 visit/lastVisit 的 item 给 0 分; 有任一信号给 > 0 分
    const baseItem = makeItem({ status: 'pending' })

    expect(EngagementService.scoreItem(baseItem, 0, NOW).score, 'pending + 无信号 = 0').toBe(0)
    expect(EngagementService.scoreItem(baseItem, 1, NOW).score, 'pending + visit=1 应 > 0').toBeGreaterThan(0)
    expect(
      EngagementService.scoreItem({ ...baseItem, lastVisitedAt: NOW - 10 * DAY }, 0, NOW).score,
      'pending + 近 lastVisitedAt 应 > 0',
    ).toBeGreaterThan(0)
  })

  it('TerrainClassifier.isUsed 应该包含 chip + visitCount + lastVisitedAt 三个信号', () => {
    // 三个分支各测一遍
    const baseItem = makeItem({ status: 'pending' })

    // chip 分支
    const r1 = TerrainClassifier.classifyTerrain({
      items: [{ ...baseItem, status: 'used', usageChip: '实际用到了' }],
      visitCounts: new Map(),
      now: NOW,
    })
    expect(r1.reallyUsedRate, 'chip 分支').toBe(1)

    // visitCount 分支
    const r2 = TerrainClassifier.classifyTerrain({
      items: [baseItem],
      visitCounts: new Map([['i1', 5]]),
      now: NOW,
    })
    expect(r2.reallyUsedRate, 'visitCount 分支').toBe(1)

    // lastVisitedAt 分支
    const r3 = TerrainClassifier.classifyTerrain({
      items: [{ ...baseItem, lastVisitedAt: NOW - 20 * DAY }],
      visitCounts: new Map(),
      now: NOW,
    })
    expect(r3.reallyUsedRate, 'lastVisitedAt 分支').toBe(1)
  })
})
