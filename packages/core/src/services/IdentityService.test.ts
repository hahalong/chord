import { describe, it, expect } from 'vitest'
import { computeAllIdentities } from './IdentityService.js'
import type { Item } from '@chord/types'

const NOW = 1716000000000 // 2024-05-18，固定时间戳便于断言
const DAY = 86400_000

function mkItem(overrides: Partial<Item> = {}): Item {
  return {
    id: Math.random().toString(36).slice(2),
    url: 'https://example.com/a',
    title: 'Sample',
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

/** 构造一批 N 条 item，给定 cluster + 时间跨度 + status 分布 */
function batch(
  count: number,
  cluster: string,
  options: {
    savedDaysAgoStart: number
    savedDaysAgoEnd: number
    statusPattern?: 'pending' | 'kept' | 'released' | 'half-processed'
  },
): Item[] {
  const { savedDaysAgoStart, savedDaysAgoEnd, statusPattern = 'pending' } = options
  const items: Item[] = []
  for (let i = 0; i < count; i++) {
    const daysAgo = savedDaysAgoStart + (savedDaysAgoEnd - savedDaysAgoStart) * (i / Math.max(1, count - 1))
    const savedAt = NOW - daysAgo * DAY
    let status: Item['status'] = 'pending'
    let processedAt: number | undefined
    if (statusPattern === 'kept') {
      status = 'kept'; processedAt = savedAt + DAY
    } else if (statusPattern === 'released') {
      status = 'released'; processedAt = savedAt + DAY
    } else if (statusPattern === 'half-processed' && i % 2 === 0) {
      status = 'kept'; processedAt = savedAt + DAY
    }
    items.push(mkItem({
      id: `${cluster}-${i}`,
      cluster,
      savedAt,
      status,
      processedAt,
    }))
  }
  return items
}

// ─── 数据不足 ──────────────────────────────────────────

describe('IdentityService.computeAllIdentities · 数据少', () => {
  // v3.1.4: items < 10 不再让 consumption 直接 null，MINIMALIST 兜底接住
  it('5 items → consumption=MINIMALIST，mindset/radius=null', () => {
    const items = batch(5, 'X', { savedDaysAgoStart: 30, savedDaysAgoEnd: 5 })
    const cards = computeAllIdentities(items, undefined, NOW)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.dimension).toBe('consumption')
    expect(cards[0]!.id).toBe('minimalist')
  })

  it('0 items → consumption=MINIMALIST（v3.1.5 改：items=0 也归 MINIMALIST，NEWCOMER 几乎永不触发）', () => {
    const cards = computeAllIdentities([], undefined, NOW)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.dimension).toBe('consumption')
    expect(cards[0]!.id).toBe('minimalist')
    expect(cards[0]!.evidence).toContain('书房等你存第一条')
  })
})

// ─── Consumption Style 5 类 ───────────────────────────

describe('IdentityService · consumption 维度', () => {
  it('50+ 条 + 处理率 < 20% → HOARDER（v3.1 阈值上调，跟 MINIMALIST 边界对齐）', () => {
    const items = batch(60, 'AI', { savedDaysAgoStart: 90, savedDaysAgoEnd: 5 })
    const cards = computeAllIdentities(items, undefined, NOW)
    const consumption = cards.find((c) => c.dimension === 'consumption')
    expect(consumption?.id).toBe('hoarder')
    expect(consumption?.name).toBe('收藏家')
    expect(consumption?.claim).toContain('图书馆')
  })

  // v3.1.26 改：MINIMALIST 阈值从 items≤50 降到 active≤15
  it('active <= 15 + 无 chip 信号 → MINIMALIST（兜底）', () => {
    const items = batch(8, 'X', { savedDaysAgoStart: 60, savedDaysAgoEnd: 10 })
    const cards = computeAllIdentities(items, undefined, NOW)
    const consumption = cards.find((c) => c.dimension === 'consumption')
    expect(consumption?.id).toBe('minimalist')
    expect(consumption?.name).toBe('极简者')
    expect(consumption?.claim).toContain('跟世界相处的节奏')
  })

  it('items=1 → MINIMALIST（边界）+ 特殊 evidence 文案', () => {
    const items = batch(1, 'X', { savedDaysAgoStart: 30, savedDaysAgoEnd: 30 })
    const cards = computeAllIdentities(items, undefined, NOW)
    const consumption = cards.find((c) => c.dimension === 'consumption')
    expect(consumption?.id).toBe('minimalist')
    expect(consumption?.evidence).toContain('不喧哗')
  })

  // v3.1.5 BALANCED 测试
  it('items > 50 + 无 chip + 处理率中等 → BALANCED 平衡者（兜底）', () => {
    // 80 条，处理率 35%（不踩 HOARDER<20% 也不踩 CURATOR>50%）
    const items: Item[] = []
    const totalItems = 80
    const processedCount = Math.round(totalItems * 0.35)
    for (let i = 0; i < totalItems; i++) {
      const it = batch(1, `B${i}`, { savedDaysAgoStart: 200, savedDaysAgoEnd: 5 })[0]!
      if (i < processedCount) {
        it.status = 'kept'
        it.processedAt = it.savedAt + 20 * 86400000  // avgLag ~20 天，不踩 SLOW_READER
      }
      items.push(it)
    }
    const cards = computeAllIdentities(items, undefined, NOW)
    const consumption = cards.find((c) => c.dimension === 'consumption')
    expect(consumption?.id).toBe('balanced')
    expect(consumption?.name).toBe('平衡者')
    expect(consumption?.claim).toContain('均衡')
  })

  it('5-50 条 但 chip 信号显示 EXECUTOR → EXECUTOR 优先，不归 MINIMALIST', () => {
    const items: Item[] = []
    for (let i = 0; i < 30; i++) {
      const it = batch(1, `EX${i}`, { savedDaysAgoStart: 90, savedDaysAgoEnd: 10 })[0]!
      it.usageChip = i < 18 ? '实际用到了' : (i < 22 ? '启发思路' : '仅此一读，够了')
      items.push(it)
    }
    const cards = computeAllIdentities(items, undefined, NOW)
    const consumption = cards.find((c) => c.dimension === 'consumption')
    expect(consumption?.id).toBe('executor')
  })

  it('avgLag > 60 天 + 处理率 > 30% → SLOW_READER', () => {
    // 30 条 item，每条 savedAt 至少 90 天前，processedAt 最近——延迟 ≥ 60 天
    const items: Item[] = []
    for (let i = 0; i < 30; i++) {
      items.push(mkItem({
        id: `slow-${i}`,
        cluster: 'X',
        savedAt: NOW - (120 + i) * DAY,
        status: 'kept',
        processedAt: NOW - i * DAY,
      }))
    }
    const cards = computeAllIdentities(items, undefined, NOW)
    const consumption = cards.find((c) => c.dimension === 'consumption')
    expect(consumption?.id).toBe('slow_reader')
  })

  it('chip "实际用到了" > 40% → EXECUTOR', () => {
    const items: Item[] = []
    for (let i = 0; i < 20; i++) {
      items.push(mkItem({
        id: `e-${i}`,
        cluster: 'X',
        status: 'kept',
        processedAt: NOW - i * DAY,
        usageChip: i < 12 ? '实际用到了' : '仅此一读，够了',
      }))
    }
    const cards = computeAllIdentities(items, undefined, NOW)
    const consumption = cards.find((c) => c.dimension === 'consumption')
    expect(consumption?.id).toBe('executor')
  })
})

// ─── Mindset 4 类 ────────────────────────────────────

describe('IdentityService · mindset 维度', () => {
  it('多新主题 + 保存量爆发 → EXPLORER 探索者', () => {
    // 60-90 天前只有 X 主题 10 条；最近 30 天突然进入 3 个新主题 (A/B/C) 各 5 条
    const historical = batch(10, 'X', { savedDaysAgoStart: 90, savedDaysAgoEnd: 60 })
    const newA = batch(5, 'A', { savedDaysAgoStart: 28, savedDaysAgoEnd: 5 })
    const newB = batch(5, 'B', { savedDaysAgoStart: 25, savedDaysAgoEnd: 10 })
    const newC = batch(5, 'C', { savedDaysAgoStart: 20, savedDaysAgoEnd: 2 })
    const items = [...historical, ...newA, ...newB, ...newC]
    const cards = computeAllIdentities(items, undefined, NOW)
    const mindset = cards.find((c) => c.dimension === 'mindset')
    expect(mindset?.id).toBe('explorer')
    expect(mindset?.claim).toContain('试')
  })

  it('单一主题强烈聚焦 → SEEKER 求索者', () => {
    // 最近 30 天 10 条全部在 X 主题；之前 60-90 天涉及多主题
    const recent = batch(10, 'X', { savedDaysAgoStart: 28, savedDaysAgoEnd: 2 })
    const historicalA = batch(5, 'A', { savedDaysAgoStart: 90, savedDaysAgoEnd: 60 })
    const historicalB = batch(5, 'B', { savedDaysAgoStart: 90, savedDaysAgoEnd: 60 })
    const items = [...recent, ...historicalA, ...historicalB]
    const cards = computeAllIdentities(items, undefined, NOW)
    const mindset = cards.find((c) => c.dimension === 'mindset')
    expect(mindset?.id).toBe('seeker')
    expect(mindset?.evidence).toContain('X')
  })

  it('老 item 大量处理 + release 增长 → RETURNER 回归者', () => {
    // 20 条老收藏（180-90 天前），最近 30 天处理 + 放手了一半
    const items: Item[] = []
    for (let i = 0; i < 20; i++) {
      const isProcessed = i < 10
      items.push(mkItem({
        id: `old-${i}`,
        cluster: 'X',
        savedAt: NOW - (180 - i * 5) * DAY,  // 180 ~ 85 天前
        status: isProcessed ? 'released' : 'pending',
        processedAt: isProcessed ? NOW - (5 + i) * DAY : undefined,
      }))
    }
    const cards = computeAllIdentities(items, undefined, NOW)
    const mindset = cards.find((c) => c.dimension === 'mindset')
    expect(mindset?.id).toBe('returner')
    expect(mindset?.claim).toContain('过去')
  })

  it('保存爆发但无新主题 + 多主题平行 → DEEPENER 深化者', () => {
    // 历史 60-180 天：4 个老主题各 5 条
    const historicalA = batch(5, 'A', { savedDaysAgoStart: 150, savedDaysAgoEnd: 60 })
    const historicalB = batch(5, 'B', { savedDaysAgoStart: 150, savedDaysAgoEnd: 60 })
    const historicalC = batch(5, 'C', { savedDaysAgoStart: 150, savedDaysAgoEnd: 60 })
    const historicalD = batch(5, 'D', { savedDaysAgoStart: 150, savedDaysAgoEnd: 60 })
    // 最近 30 天：同样 4 个主题，但保存量爆发（每个 +10）
    const recentA = batch(10, 'A', { savedDaysAgoStart: 28, savedDaysAgoEnd: 2 })
    const recentB = batch(10, 'B', { savedDaysAgoStart: 28, savedDaysAgoEnd: 2 })
    const recentC = batch(10, 'C', { savedDaysAgoStart: 28, savedDaysAgoEnd: 2 })
    const recentD = batch(10, 'D', { savedDaysAgoStart: 28, savedDaysAgoEnd: 2 })
    const items = [...historicalA, ...historicalB, ...historicalC, ...historicalD,
                   ...recentA, ...recentB, ...recentC, ...recentD]
    const cards = computeAllIdentities(items, undefined, NOW)
    const mindset = cards.find((c) => c.dimension === 'mindset')
    expect(mindset?.id).toBe('deepener')
    expect(mindset?.claim).toContain('深里走')
    expect(mindset?.evidence).toMatch(/\d 个老主题/)
  })

  it('保存量 < 60% 月均 + 无新主题 → SETTLER 沉淀者', () => {
    // 历史 60-180 天有 40 条；最近 30 天只 2 条（< 60% × 历史月均 ≈ 13）
    const historical = batch(40, 'X', { savedDaysAgoStart: 180, savedDaysAgoEnd: 35 })
    const recentLittle = batch(2, 'X', { savedDaysAgoStart: 28, savedDaysAgoEnd: 2 })  // 同主题
    const items = [...historical, ...recentLittle]
    const cards = computeAllIdentities(items, undefined, NOW)
    const mindset = cards.find((c) => c.dimension === 'mindset')
    expect(mindset?.id).toBe('settler')
    expect(mindset?.claim).toContain('慢')
  })
})

// ─── Radius 3 类 ─────────────────────────────────────

describe('IdentityService · radius 维度', () => {
  it('单一主题 > 40% + top3 > 70% → SPECIALIST 专精派', () => {
    // 90 天内 30 条：X 15 条 (50%), Y 6 条 (20%), Z 5 条 (17%) → top3 = 87%
    const x = batch(15, 'X', { savedDaysAgoStart: 85, savedDaysAgoEnd: 5 })
    const y = batch(6, 'Y', { savedDaysAgoStart: 85, savedDaysAgoEnd: 5 })
    const z = batch(5, 'Z', { savedDaysAgoStart: 85, savedDaysAgoEnd: 5 })
    const w = batch(4, 'W', { savedDaysAgoStart: 85, savedDaysAgoEnd: 5 })
    const items = [...x, ...y, ...z, ...w]
    const cards = computeAllIdentities(items, undefined, NOW)
    const radius = cards.find((c) => c.dimension === 'radius')
    expect(radius?.id).toBe('specialist')
    expect(radius?.claim).toContain('深耕')
  })

  it('max < 25% + cluster > 10 + 高熵 → GENERALIST 广博派', () => {
    // 90 天内 36 条均匀分布在 12 个主题（每个 3 条）
    const items: Item[] = []
    for (let c = 0; c < 12; c++) {
      items.push(...batch(3, `C${c}`, { savedDaysAgoStart: 85, savedDaysAgoEnd: 5 }))
    }
    const cards = computeAllIdentities(items, undefined, NOW)
    const radius = cards.find((c) => c.dimension === 'radius')
    expect(radius?.id).toBe('generalist')
    expect(radius?.claim).toContain('什么都感兴趣')
  })

  it('30 天 vs 60-90 天主题集合差异大 → SWITCHER 跳跃者', () => {
    // 60-90 天主题 X/Y/Z 各 5 条；30 天前主题 A/B/C 各 5 条（重合 0%）
    const oldX = batch(5, 'X', { savedDaysAgoStart: 88, savedDaysAgoEnd: 60 })
    const oldY = batch(5, 'Y', { savedDaysAgoStart: 88, savedDaysAgoEnd: 60 })
    const oldZ = batch(5, 'Z', { savedDaysAgoStart: 88, savedDaysAgoEnd: 60 })
    const newA = batch(5, 'A', { savedDaysAgoStart: 28, savedDaysAgoEnd: 2 })
    const newB = batch(5, 'B', { savedDaysAgoStart: 28, savedDaysAgoEnd: 2 })
    const newC = batch(5, 'C', { savedDaysAgoStart: 28, savedDaysAgoEnd: 2 })
    const items = [...oldX, ...oldY, ...oldZ, ...newA, ...newB, ...newC]
    const cards = computeAllIdentities(items, undefined, NOW)
    const radius = cards.find((c) => c.dimension === 'radius')
    expect(radius?.id).toBe('switcher')
    expect(radius?.claim).toContain('潮汐')
  })

  it('中间态（既不专精也不广博也不跳跃）→ null', () => {
    // 4 个主题各 4 条，max = 25%，top3 = 75%，cluster=4 — 介于 specialist 和 generalist
    const items: Item[] = []
    for (let c = 0; c < 4; c++) {
      items.push(...batch(4, `C${c}`, { savedDaysAgoStart: 85, savedDaysAgoEnd: 5 }))
    }
    const cards = computeAllIdentities(items, undefined, NOW)
    const radius = cards.find((c) => c.dimension === 'radius')
    expect(radius).toBeUndefined()
  })
})

// ─── 综合：信息焦虑囤积家 HOARDER + EXPLORER + GENERALIST ───────

describe('IdentityService · 综合场景', () => {
  it('信息焦虑囤积家 = HOARDER + EXPLORER + GENERALIST（demo 同款）', () => {
    // 构造满足三维条件的样本（v3.1 HOARDER 阈值从 30 → 50，items 量级相应上调）：
    //  - 60+ 条 content，处理率 < 20%（HOARDER）
    //  - 30 天内进入 3 个新主题（EXPLORER）
    //  - 12 个主题分布均匀（GENERALIST）

    const items: Item[] = []
    // 历史 60-180 天，分散在 9 个主题，处理率低
    for (let c = 0; c < 9; c++) {
      const isProc = c === 0  // 只第 1 个主题有 1 条处理
      items.push(...batch(5, `OLD${c}`, {  // 每主题 3→5 条
        savedDaysAgoStart: 180,
        savedDaysAgoEnd: 60,
        statusPattern: isProc ? 'half-processed' : 'pending',
      }))
    }
    // 最近 30 天 3 个新主题各 5 条
    items.push(...batch(5, 'NEW_A', { savedDaysAgoStart: 28, savedDaysAgoEnd: 5 }))
    items.push(...batch(5, 'NEW_B', { savedDaysAgoStart: 25, savedDaysAgoEnd: 3 }))
    items.push(...batch(5, 'NEW_C', { savedDaysAgoStart: 20, savedDaysAgoEnd: 2 }))
    // 共 9×5 + 3×5 = 60 条，processed 仅 OLD0 半处理 2-3 条，processRate ~5%，HOARDER 触发

    const cards = computeAllIdentities(items, undefined, NOW)
    const ids = cards.map((c) => c.id)

    expect(cards).toHaveLength(3)
    expect(ids).toContain('hoarder')
    expect(ids).toContain('explorer')
    expect(ids).toContain('generalist')
  })
})

// ─── 文案纪律 sanity check ──────────────────────────────

describe('IdentityService · 文案纪律', () => {
  it('claim / evidence 都有"活人感"——不含 AI 报告腔禁词', () => {
    const items = batch(40, 'AI', { savedDaysAgoStart: 90, savedDaysAgoEnd: 5 })
    const cards = computeAllIdentities(items, undefined, NOW)
    const allText = cards.map((c) => c.claim + ' ' + c.evidence).join(' ')
    expect(allText).not.toMatch(/您|建议您|根据您的数据|认知心理学|属于.*机制/)
  })

  it('evidence 都含具体数字', () => {
    const items = batch(40, 'AI', { savedDaysAgoStart: 90, savedDaysAgoEnd: 5 })
    const cards = computeAllIdentities(items, undefined, NOW)
    for (const card of cards) {
      // evidence 应该至少有一个数字
      expect(card.evidence).toMatch(/\d/)
    }
  })
})
