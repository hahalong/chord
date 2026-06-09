import { describe, it, expect } from 'vitest'
import { generateDramaticInsights } from './DramaticInsightService.js'
import type { Item } from '@chord/types'

const NOW = 1716000000000
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

describe('DramaticInsightService.generateDramaticInsights', () => {
  it('数据 < 10 → 空数组', () => {
    const items = Array.from({ length: 5 }, (_, i) => mkItem({ id: `${i}`, cluster: 'X' }))
    expect(generateDramaticInsights({ items, now: NOW })).toEqual([])
  })

  // ─── 模板 1：保存 vs 处理反差 ──────────────
  it('save_vs_process 触发：某 cluster 保存 27 条处理 0 条', () => {
    const items: Item[] = []
    for (let i = 0; i < 27; i++) {
      items.push(mkItem({
        id: `eng-${i}`,
        cluster: '学英语',
        savedAt: NOW - (14 * 30 - i * 14) * DAY,  // 14 个月前到上周
      }))
    }
    // 加点别的让总数充足
    for (let i = 0; i < 15; i++) items.push(mkItem({ id: `o-${i}`, cluster: '其他', status: 'kept', processedAt: NOW - i * DAY }))

    const insights = generateDramaticInsights({ items, now: NOW })
    const found = insights.find((i) => i.template === 'save_vs_process')
    expect(found).toBeDefined()
    expect(found!.text).toContain('学英语')
    expect(found!.text).toContain('27 条')
    expect(found!.cluster).toBe('学英语')
  })

  it('save_vs_process 不触发：cluster 保存 < 10 条', () => {
    const items: Item[] = []
    for (let i = 0; i < 8; i++) items.push(mkItem({ id: `eng-${i}`, cluster: '学英语' }))
    for (let i = 0; i < 5; i++) items.push(mkItem({ id: `o-${i}`, cluster: '其他' }))
    const insights = generateDramaticInsights({ items, now: NOW })
    expect(insights.find((i) => i.template === 'save_vs_process')).toBeUndefined()
  })

  it('save_vs_process 不触发：cluster 处理率 ≥ 15%', () => {
    const items: Item[] = []
    for (let i = 0; i < 12; i++) {
      const isProcessed = i < 3  // 25% 处理率
      items.push(mkItem({
        id: `e-${i}`,
        cluster: '学英语',
        status: isProcessed ? 'kept' : 'pending',
        processedAt: isProcessed ? NOW - i * DAY : undefined,
      }))
    }
    const insights = generateDramaticInsights({ items, now: NOW })
    expect(insights.find((i) => i.template === 'save_vs_process')).toBeUndefined()
  })

  // ─── 模板 2：主题集中度 ──────────────────
  it('topic_concentration 触发：top cluster 占 ≥ 30%', () => {
    const items: Item[] = []
    for (let i = 0; i < 12; i++) items.push(mkItem({ id: `ai-${i}`, cluster: 'AI 工具' }))  // 40%
    for (let i = 0; i < 8; i++) items.push(mkItem({ id: `c-${i}`, cluster: '编程' }))
    for (let i = 0; i < 5; i++) items.push(mkItem({ id: `d-${i}`, cluster: '学英语' }))
    for (let i = 0; i < 5; i++) items.push(mkItem({ id: `e-${i}`, cluster: '其他' }))

    const insights = generateDramaticInsights({ items, now: NOW })
    const found = insights.find((i) => i.template === 'topic_concentration')
    expect(found).toBeDefined()
    expect(found!.text).toContain('AI 工具')
    expect(found!.text).toContain('40%')
  })

  // ─── 模板 3：最老的还在等 ────────────────
  it('oldest_waiting 触发：pending 中最老 > 6 个月', () => {
    const items: Item[] = []
    // 5 条 pending，最老 14 个月前
    for (let i = 0; i < 5; i++) {
      items.push(mkItem({
        id: `old-${i}`,
        cluster: 'X',
        savedAt: NOW - (14 * 30 - i * 5) * DAY,
        status: 'pending',
      }))
    }
    for (let i = 0; i < 10; i++) items.push(mkItem({ id: `o-${i}`, cluster: 'Y' }))

    const insights = generateDramaticInsights({ items, now: NOW })
    const found = insights.find((i) => i.template === 'oldest_waiting')
    expect(found).toBeDefined()
    expect(found!.text).toMatch(/等你|月前/)
  })

  // ─── 模板 4：放手原因 ─────────────────────
  it('release_reason_mix 触发：近 90 天 release 中某 reason 占 ≥ 40%', () => {
    const items: Item[] = []
    // 10 条放手，6 条 not_interested (60%)
    for (let i = 0; i < 10; i++) {
      items.push(mkItem({
        id: `r-${i}`,
        cluster: 'X',
        savedAt: NOW - 60 * DAY,
        status: 'released',
        processedAt: NOW - (i + 1) * DAY,
        releaseReason: i < 6 ? 'not_interested' : 'used',
      }))
    }
    for (let i = 0; i < 10; i++) items.push(mkItem({ id: `o-${i}`, cluster: 'Y' }))

    const insights = generateDramaticInsights({ items, now: NOW })
    const found = insights.find((i) => i.template === 'release_reason_mix')
    expect(found).toBeDefined()
    expect(found!.text).toContain('不感兴趣了')
    expect(found!.text).toContain('6')
  })

  // ─── 模板 5：时间分布 ─────────────────────
  it('time_concentration 触发：cluster 60%+ 来自深夜', () => {
    const items: Item[] = []
    // 8 条 AI 工具，其中 6 条凌晨 2 点（75%）
    for (let i = 0; i < 8; i++) {
      const baseDate = new Date(NOW - (15 + i) * DAY)
      if (i < 6) baseDate.setHours(2, 0, 0, 0)
      else baseDate.setHours(15, 0, 0, 0)
      items.push(mkItem({ id: `ai-${i}`, cluster: 'AI 工具', savedAt: baseDate.getTime() }))
    }
    // 填充：避免触发"其他" cluster 自己的时段集中（混合时段）
    for (let i = 0; i < 10; i++) {
      const baseDate = new Date(NOW - (20 + i) * DAY)
      baseDate.setHours(i * 2 % 24, 0, 0, 0)  // 0/2/4/.../18 错开
      items.push(mkItem({ id: `o-${i}`, cluster: '其他', savedAt: baseDate.getTime() }))
    }

    const insights = generateDramaticInsights({ items, now: NOW })
    const found = insights.find((i) => i.template === 'time_concentration')
    expect(found).toBeDefined()
    expect(found!.text).toContain('AI 工具')
    expect(found!.text).toMatch(/凌晨/)
  })

  // ─── 模板 6：真实 vs 渴望 ─────────────────
  it('reality_vs_aspiration 触发：幻觉 cluster (10 条 0 访问) + 真实 cluster (3 条高访问)', () => {
    const items: Item[] = []
    // 幻觉：「早起方法」10 条，访问全 0（saved > 任何其他 cluster 才能赢得"max saved 0 访问"竞争）
    for (let i = 0; i < 10; i++) items.push(mkItem({ id: `early-${i}`, cluster: '早起方法' }))
    // 真实：「诗」5 条，平均 18 次访问
    for (let i = 0; i < 5; i++) items.push(mkItem({ id: `poem-${i}`, cluster: '诗' }))
    // 填充：让"其他"也有访问，避免它也被识别成幻觉竞争
    for (let i = 0; i < 8; i++) items.push(mkItem({ id: `f-${i}`, cluster: '其他' }))

    const visitCounts = new Map<string, number>()
    for (let i = 0; i < 5; i++) visitCounts.set(`poem-${i}`, 18)
    for (let i = 0; i < 8; i++) visitCounts.set(`f-${i}`, 2)  // 给"其他" 少量访问，逃出"幻觉"判定

    const insights = generateDramaticInsights({ items, visitCounts, now: NOW })
    const found = insights.find((i) => i.template === 'reality_vs_aspiration')
    expect(found).toBeDefined()
    expect(found!.text).toContain('早起方法')
    expect(found!.text).toContain('诗')
    // v3.1.20 · diversifyInsights：save_vs_process 也是 backlog 家族 → 第二个 backlog 降权 0.25
    //   原 drama 0.95 → 0.70。降权是设计行为（§2 多样性，避免 top2 都是积压型）
    expect(found!.drama).toBeGreaterThan(0.6)
  })

  it('reality_vs_aspiration 不触发：没有 visitCounts', () => {
    const items: Item[] = []
    for (let i = 0; i < 15; i++) items.push(mkItem({ id: `x-${i}`, cluster: 'X' }))
    const insights = generateDramaticInsights({ items, now: NOW })
    expect(insights.find((i) => i.template === 'reality_vs_aspiration')).toBeUndefined()
  })

  // ─── 多模板 + 排序 ────────────────────────
  it('多模板同时触发时按 drama 降序排列', () => {
    const items: Item[] = []
    // 触发模板 1（save_vs_process，drama 高）
    for (let i = 0; i < 30; i++) items.push(mkItem({ id: `e-${i}`, cluster: '学英语' }))
    // 触发模板 3（oldest_waiting，drama 中）
    items[0]!.savedAt = NOW - 14 * 30 * DAY
    // 触发模板 2（topic_concentration）
    // 30 学英语占主导

    const insights = generateDramaticInsights({ items, now: NOW })
    expect(insights.length).toBeGreaterThanOrEqual(2)
    // 验证降序
    for (let i = 1; i < insights.length; i++) {
      expect(insights[i - 1]!.drama).toBeGreaterThanOrEqual(insights[i]!.drama)
    }
  })

  // ─── 文案纪律 ─────────────────────────────
  it('所有触发的句子都符合活人感纪律（不含 AI 报告腔禁词）', () => {
    const items: Item[] = []
    for (let i = 0; i < 25; i++) items.push(mkItem({ id: `e-${i}`, cluster: '学英语', savedAt: NOW - (200 - i) * DAY }))
    for (let i = 0; i < 15; i++) items.push(mkItem({ id: `o-${i}`, cluster: 'AI 工具', status: 'kept', processedAt: NOW - i * DAY }))

    const insights = generateDramaticInsights({ items, now: NOW })
    expect(insights.length).toBeGreaterThan(0)
    for (const insight of insights) {
      expect(insight.text).not.toMatch(/您|建议您|根据您的数据|认知心理学|属于.*机制/)
      // 必有具体数字
      expect(insight.text).toMatch(/\d/)
    }
  })
})
