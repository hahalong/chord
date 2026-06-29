import { describe, it, expect } from 'vitest'
import { computeInsights } from './AnalyticsService.js'
import type { StorageAdapter, Item, ChordEvent, Cluster, ClusterUserIntent, UserSettings, BatchOperation, SaveIntent } from '@chord/types'
import { DEFAULT_SETTINGS } from '@chord/types'

class MemoryAdapter implements StorageAdapter {
  items: Item[] = []
  events: ChordEvent[] = []
  settings: UserSettings = { ...DEFAULT_SETTINGS, userId: 'u', deviceId: 'd' }
  clusters: Cluster[] = []
  clusterUserIntents: ClusterUserIntent[] = []
  async getItems() { return this.items }
  async getItem(id: string) { return this.items.find((i) => i.id === id) ?? null }
  async putItem(item: Item) { const i = this.items.findIndex(x => x.id === item.id); if (i >= 0) this.items[i] = item; else this.items.push(item) }
  async putItems(items: Item[]) { this.items = items }
  async deleteItem(id: string) { this.items = this.items.filter(i => i.id !== id) }
  async appendEvent(e: ChordEvent) { this.events.push(e) }
  async getEvents() { return this.events }
  async getSettings() { return this.settings }
  async putSettings(s: Partial<UserSettings>) { this.settings = { ...this.settings, ...s } }
  async getClusters() { return this.clusters }
  async putClusters(c: Cluster[]) { this.clusters = c }
  async getClusterUserIntents() { return this.clusterUserIntents }
  async putClusterUserIntents(i: ClusterUserIntent[]) { this.clusterUserIntents = i }
  async batch(_ops: BatchOperation[]) {}
}

function makeItem(cluster: string, intent: SaveIntent | undefined, status: Item['status']): Item {
  return {
    id: Math.random().toString(36).slice(2),
    url: 'https://e.com/p',
    title: 't',
    favicon: '',
    savedAt: Date.now() - 30 * 86_400_000,
    sourceDomain: 'e.com',
    type: 'content',
    status,
    wakeCount: 0,
    source: 'saved',
    cluster,
    saveIntent: intent,
  }
}

describe('AnalyticsService.computeInsights — illusion_anxiety 升级分支', () => {
  it('aspire 占比 > 40% → 命中渴望落差文案', async () => {
    const a = new MemoryAdapter()
    // 10 条「副业」cluster：6 aspire + 4 learn，全部 pending（处理率 0）
    for (let i = 0; i < 6; i++) a.items.push(makeItem('副业', 'aspire', 'pending'))
    for (let i = 0; i < 4; i++) a.items.push(makeItem('副业', 'learn', 'pending'))

    const findings = await computeInsights(a)
    const f = findings.find((x) => x.cluster === '副业')!
    expect(f).toBeDefined()
    expect(f.eyebrow).toBe('渴望落差')
    expect(f.claim).toContain('几乎没有处理过')
    expect(f.evidence).toContain('渴望')
    expect(f.ctaLabel).toContain('扫一遍')
  })

  it('aspire 占比 < 40% → 保留原焦虑文案', async () => {
    const a = new MemoryAdapter()
    // 10 条「学习」cluster：2 aspire + 8 learn，全部 pending
    for (let i = 0; i < 2; i++) a.items.push(makeItem('学习', 'aspire', 'pending'))
    for (let i = 0; i < 8; i++) a.items.push(makeItem('学习', 'learn', 'pending'))

    const findings = await computeInsights(a)
    const f = findings.find((x) => x.cluster === '学习')!
    expect(f).toBeDefined()
    expect(f.eyebrow).toBe('你可能只是在焦虑')
    expect(f.claim).toContain('可能不是你的兴趣')
    expect(f.ctaLabel).toBe('现在去批量放手')
  })

  it('saveIntent 全部 undefined → 走原焦虑文案（aspire 占比 = 0）', async () => {
    const a = new MemoryAdapter()
    for (let i = 0; i < 12; i++) a.items.push(makeItem('堆积', undefined, 'pending'))

    const findings = await computeInsights(a)
    const f = findings.find((x) => x.cluster === '堆积')!
    expect(f).toBeDefined()
    expect(f.eyebrow).toBe('你可能只是在焦虑')
  })

  it('处理率 ≥ 25% 但 visitCount 0 → v3.1.28 仍触发 illusion_anxiety（"真没在用"才是焦虑）', async () => {
    const a = new MemoryAdapter()
    // 6 pending + 4 used，但都没 visitCount 也没 chip → reallyUsedRate = 0
    for (let i = 0; i < 6; i++) a.items.push(makeItem('副业', 'aspire', 'pending'))
    for (let i = 0; i < 4; i++) a.items.push(makeItem('副业', 'aspire', 'used'))

    const findings = await computeInsights(a)
    const f = findings.find((x) => x.cluster === '副业')
    // v3.1.28 后：processRate 不再主导；reallyUsedRate=0 < 20% 仍归 illusion_anxiety
    expect(f?.type).toBe('terrain_swamp')
  })
})

// ─── v3.1.28 · 真用过率主导 §3 验收 ────────────────────────
describe('v3.1.28 · §3 reallyUsedRate 主信号 + cluster 去重', () => {
  it('case D · 集中放手 + visitCount=0 → NOT real_passion（核心 bug fix）', async () => {
    const a = new MemoryAdapter()
    // 30 条「历史链接」：15 kept + 15 released + 全无 chip、无 visit
    // 旧规则：processRate = 100% → 错误触发 real_passion
    // 新规则：reallyUsedRate = 0 → 不该触发
    for (let i = 0; i < 15; i++) a.items.push(makeItem('历史链接', undefined, 'kept'))
    for (let i = 0; i < 15; i++) a.items.push(makeItem('历史链接', undefined, 'released'))

    const findings = await computeInsights(a)
    const f = findings.find((x) => x.cluster === '历史链接')
    expect(f?.type).not.toBe('terrain_forest')
  })

  it('case C · visitCount 高 → real_passion（即使 processRate 低）', async () => {
    const a = new MemoryAdapter()
    // 20 条「编程」全 pending（processRate=0）但 visitCount 都 ≥ 3
    for (let i = 0; i < 20; i++) a.items.push(makeItem('编程', undefined, 'pending'))
    const visitCounts = new Map<string, number>()
    for (const it of a.items) visitCounts.set(it.id, 5)

    const findings = await computeInsights(a, visitCounts)
    const f = findings.find((x) => x.cluster === '编程')
    expect(f?.type).toBe('terrain_forest')
    expect(f?.evidence).toContain('累计访问')
  })

  it('case B · 大量保存 + visitCount=0 + 无 chip → illusion_anxiety（真焦虑）', async () => {
    const a = new MemoryAdapter()
    for (let i = 0; i < 15; i++) a.items.push(makeItem('待办收藏', undefined, 'pending'))

    const findings = await computeInsights(a)
    const f = findings.find((x) => x.cluster === '待办收藏')
    expect(f?.type).toBe('terrain_swamp')
    expect(f?.metricLabel).toBe('真用过率')
  })

  it('case A · processRate 高 + visitCount 高 → real_passion（混合场景）', async () => {
    const a = new MemoryAdapter()
    for (let i = 0; i < 12; i++) a.items.push(makeItem('AI 工程', undefined, 'kept'))
    const visitCounts = new Map<string, number>()
    for (const it of a.items) visitCounts.set(it.id, 2)

    const findings = await computeInsights(a, visitCounts)
    const f = findings.find((x) => x.cluster === 'AI 工程')
    expect(f?.type).toBe('terrain_forest')
  })

  it('case E · 去重 — 同 cluster 只 1 个 finding · v3.1.29 ember 优先于 forest（时间维度先判）', async () => {
    const a = new MemoryAdapter()
    // 「编程」满足 forest (visitCount 高 + ≥5 条) + ember (30 天爆发)
    const now = Date.now()
    const DAY = 86_400_000
    // 历史 (60-90d ago) 4 条
    for (let i = 0; i < 4; i++) {
      const it = makeItem('编程', undefined, 'pending')
      it.savedAt = now - (60 + i * 5) * DAY
      a.items.push(it)
    }
    // 最近 30 天 20 条爆发
    for (let i = 0; i < 20; i++) {
      const it = makeItem('编程', undefined, 'pending')
      it.savedAt = now - (i + 1) * DAY
      a.items.push(it)
    }
    const visitCounts = new Map<string, number>()
    for (const it of a.items) visitCounts.set(it.id, 3)

    const findings = await computeInsights(a, visitCounts)
    const programFindings = findings.filter((x) => x.cluster === '编程')
    expect(programFindings.length).toBe(1)  // TerrainClassifier 输出每个 cluster 只属 1 个 type
    // v3.1.29 ember 优先：最近爆发 trumps 在用度
    expect(programFindings[0]?.type).toBe('terrain_ember')
  })

  it('case · chip="实际用到了" → 视作"真用过"（即使无 visitCount）', async () => {
    const a = new MemoryAdapter()
    for (let i = 0; i < 10; i++) {
      const it = makeItem('Rust', undefined, 'kept')
      it.usageChip = '实际用到了'
      a.items.push(it)
    }
    const findings = await computeInsights(a)
    const f = findings.find((x) => x.cluster === 'Rust')
    expect(f?.type).toBe('terrain_forest')
  })

  it('case · v3.1.29 多焦虑主题 → terrain_swamp 只挑最强 1 个（不再 panorama 合并）', async () => {
    const a = new MemoryAdapter()
    // 两个焦虑主题：都 visit 0 + 全 pending
    for (let i = 0; i < 12; i++) a.items.push(makeItem('焦虑A', undefined, 'pending'))
    for (let i = 0; i < 12; i++) a.items.push(makeItem('焦虑B', undefined, 'pending'))

    const findings = await computeInsights(a)
    const swamps = findings.filter((f) => f.type === 'terrain_swamp')
    expect(swamps.length).toBe(1)   // 只挑代表性最强的 1 个
    expect(swamps[0]?.evidence ?? '').not.toContain('确实在用')
  })
})
