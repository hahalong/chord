import { describe, it, expect } from 'vitest'
import { selectItemToResuface, isTimeToResuface, findCachedTodayItem } from './ResurfaceService.js'
import type { Item, UserSettings } from '@chord/types'
import { DEFAULT_SETTINGS } from '@chord/types'

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: Math.random().toString(36).slice(2),
    url: 'https://example.com/post',
    title: 'Test Article',
    favicon: '',
    savedAt: Date.now() - 7 * 86400000,
    sourceDomain: 'example.com',
    type: 'content',
    status: 'pending',
    wakeCount: 0,
    source: 'saved',
    ...overrides,
  }
}

const BASE_SETTINGS: UserSettings = {
  ...DEFAULT_SETTINGS,
  userId: 'u',
  deviceId: 'd',
  resurfaceTime: '09:00',
  resurfaceFreq: 'daily',
}

// ─── selectItemToResuface ────────────────────────────────────

describe('ResurfaceService.selectItemToResuface', () => {
  it('returns null when no candidates', () => {
    expect(selectItemToResuface([])).toBeNull()
  })

  it('returns null when all items are released/used', () => {
    const items = [
      makeItem({ status: 'released' }),
      makeItem({ status: 'used' }),
    ]
    expect(selectItemToResuface(items)).toBeNull()
  })

  it('returns null for tool items', () => {
    const items = [makeItem({ type: 'tool' })]
    expect(selectItemToResuface(items)).toBeNull()
  })

  it('returns a content item in pending or kept status', () => {
    const p = makeItem({ status: 'pending' })
    const k = makeItem({ status: 'kept' })
    const r = selectItemToResuface([p, k])
    expect(['pending', 'kept']).toContain(r?.status)
  })

  it('strongly prefers items saved > 30 days ago with wakeCount=0', () => {
    // Run multiple times to reduce jitter effects
    const old = makeItem({ savedAt: Date.now() - 60 * 86400000, wakeCount: 0 })
    const recent = makeItem({ savedAt: Date.now() - 2 * 86400000, wakeCount: 5 })

    let oldWins = 0
    for (let i = 0; i < 20; i++) {
      if (selectItemToResuface([old, recent])?.id === old.id) oldWins++
    }
    // Should win at least 15/20 runs
    expect(oldWins).toBeGreaterThanOrEqual(15)
  })

  it('prefers items with lower wakeCount', () => {
    const highWake = makeItem({ wakeCount: 10, savedAt: Date.now() - 5 * 86400000 })
    const lowWake = makeItem({ wakeCount: 0, savedAt: Date.now() - 5 * 86400000 })

    let lowWins = 0
    for (let i = 0; i < 20; i++) {
      if (selectItemToResuface([highWake, lowWake])?.id === lowWake.id) lowWins++
    }
    expect(lowWins).toBeGreaterThanOrEqual(12)
  })

  it('clusters with low conversion rate get bonus weight', () => {
    // Cluster "X" has 10 items, only 1 processed → low conversion
    const clusterItems: Item[] = []
    for (let i = 0; i < 9; i++) {
      clusterItems.push(makeItem({ cluster: 'X', status: 'pending', savedAt: Date.now() - 40 * 86400000 }))
    }
    clusterItems.push(makeItem({ cluster: 'X', status: 'used' }))

    const noCluster = makeItem({ savedAt: Date.now() - 5 * 86400000 })
    const candidate = clusterItems[0]!

    let clusterWins = 0
    for (let i = 0; i < 20; i++) {
      if (selectItemToResuface([...clusterItems, noCluster])?.id === candidate.id ||
          selectItemToResuface([...clusterItems, noCluster])?.cluster === 'X') {
        clusterWins++
      }
    }
    expect(clusterWins).toBeGreaterThan(0)
  })

  it('high-visit items are deprioritized via visitCounts', () => {
    // 两条年龄相近的 item：一条 90 天高频访问，一条从未访问
    const visited = makeItem({ id: 'v', savedAt: Date.now() - 60 * 86400000 })
    const unvisited = makeItem({ id: 'u', savedAt: Date.now() - 60 * 86400000 })
    const visitCounts = new Map<string, number>([['v', 12], ['u', 0]])
    let unvisitedWins = 0
    // jitter 是 ±15，访问差是 +25 - (-35) = 60，理论上几乎必胜
    for (let i = 0; i < 30; i++) {
      if (selectItemToResuface([visited, unvisited], visitCounts)?.id === 'u') unvisitedWins++
    }
    expect(unvisitedWins).toBeGreaterThan(25)
  })

  it('visitCounts is optional — old behavior preserved when absent', () => {
    const it = makeItem({ savedAt: Date.now() - 60 * 86400000 })
    expect(selectItemToResuface([it])?.id).toBe(it.id)
  })

  it('dormant cluster 的内容被加权（比 active cluster 同龄 item 更易被选中）', () => {
    // dormant cluster：8 条全 pending，最后 save 200 天前
    const dormantItems: Item[] = Array.from({ length: 8 }, (_, i) =>
      makeItem({ id: `d${i}`, cluster: '沉睡', savedAt: Date.now() - 200 * 86400000 })
    )
    // active cluster：3 条 used + 2 条 pending，近期
    const activeItems: Item[] = [
      makeItem({ id: 'a1', cluster: '活跃', savedAt: Date.now() - 10 * 86400000, status: 'used' }),
      makeItem({ id: 'a2', cluster: '活跃', savedAt: Date.now() - 5 * 86400000, status: 'used' }),
      makeItem({ id: 'a3', cluster: '活跃', savedAt: Date.now() - 15 * 86400000, status: 'used' }),
      makeItem({ id: 'a4', cluster: '活跃', savedAt: Date.now() - 200 * 86400000 }),   // 同样老
      makeItem({ id: 'a5', cluster: '活跃', savedAt: Date.now() - 200 * 86400000 }),
    ]
    const all = [...dormantItems, ...activeItems]

    // 多次跑，统计 dormant cluster 的 item 中签率
    let dormantWins = 0
    for (let i = 0; i < 50; i++) {
      const r = selectItemToResuface(all)
      if (r && r.cluster === '沉睡') dormantWins++
    }
    // 不要求每次都赢，但应该显著偏向 dormant
    expect(dormantWins).toBeGreaterThan(30)
  })
})

// ─── isTimeToResuface ─────────────────────────────────────────

describe('ResurfaceService.isTimeToResuface', () => {
  it('returns false when freq=off', () => {
    expect(isTimeToResuface({ ...BASE_SETTINGS, resurfaceFreq: 'off' })).toBe(false)
  })

  it('returns true when never surfaced before and past scheduled time', () => {
    const settings: UserSettings = {
      ...BASE_SETTINGS,
      resurfaceTime: '00:00', // just past midnight — definitely before now
      lastResurfacedAt: undefined,
    }
    expect(isTimeToResuface(settings)).toBe(true)
  })

  it('returns false when already resurfaced today', () => {
    const settings: UserSettings = {
      ...BASE_SETTINGS,
      resurfaceTime: '00:00',
      lastResurfacedAt: Date.now(), // just now = same day
    }
    expect(isTimeToResuface(settings)).toBe(false)
  })
})

// ─── findCachedTodayItem（修 popup "永远卡在同一条" bug）─────────────
describe('ResurfaceService.findCachedTodayItem', () => {
  it('空列表 → null', () => {
    expect(findCachedTodayItem([])).toBeNull()
  })

  it('pending + aiQuestion + wakeCount > 0 → 命中（正常缓存路径）', () => {
    const items = [makeItem({
      id: 'a',
      status: 'pending',
      aiQuestion: '你保存这个的时候在想什么？',
      wakeCount: 1,
    })]
    expect(findCachedTodayItem(items)?.id).toBe('a')
  })

  it('wakeCount = 0 → 不命中（还没被 alarm/fresh 选中过）', () => {
    const items = [makeItem({
      status: 'pending',
      aiQuestion: '问句',
      wakeCount: 0,
    })]
    expect(findCachedTodayItem(items)).toBeNull()
  })

  it('没 aiQuestion → 不命中（popup 会显示空白）', () => {
    const items = [makeItem({
      status: 'pending',
      aiQuestion: undefined,
      wakeCount: 2,
    })]
    expect(findCachedTodayItem(items)).toBeNull()
  })

  // ↓ 这是用户报告的 bug 的核心回归测试
  it('回归：kept item 即使带 aiQuestion + wakeCount > 0 也不命中（修「永远卡在同一条」bug）', () => {
    const items = [makeItem({
      id: 'kept-item',
      status: 'kept',
      aiQuestion: '你保存这个的时候在想什么？',
      wakeCount: 1,
      processedAt: Date.now(),   // 刚刚被用户处理
    })]
    expect(findCachedTodayItem(items)).toBeNull()
  })

  it('回归：released item 同样不命中', () => {
    const items = [makeItem({
      status: 'released',
      aiQuestion: '问句',
      wakeCount: 1,
    })]
    expect(findCachedTodayItem(items)).toBeNull()
  })

  it('多条命中时按 processedAt/savedAt 降序返回最新', () => {
    const now = Date.now()
    const items = [
      makeItem({ id: 'old', status: 'pending', aiQuestion: 'q1', wakeCount: 1, savedAt: now - 100_000 }),
      makeItem({ id: 'new', status: 'pending', aiQuestion: 'q2', wakeCount: 1, savedAt: now - 1000 }),
    ]
    expect(findCachedTodayItem(items)?.id).toBe('new')
  })

  it('混合场景：一条 kept 一条 pending，返回 pending（不返回 kept 即使 kept 更新）', () => {
    const now = Date.now()
    const items = [
      // kept item 是最新处理的，但不应被返回
      makeItem({ id: 'kept', status: 'kept', aiQuestion: 'q1', wakeCount: 1, processedAt: now }),
      // pending item 较老
      makeItem({ id: 'pending', status: 'pending', aiQuestion: 'q2', wakeCount: 1, savedAt: now - 100_000 }),
    ]
    expect(findCachedTodayItem(items)?.id).toBe('pending')
  })
})
