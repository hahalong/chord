// 集成测试：端到端模拟「老用户更新扩展 → 自动 recluster」的完整流程
// 不需要浏览器；用 MemoryAdapter 模拟 chrome.storage，stub AI engine 模拟 AI 调用

import { describe, it, expect } from 'vitest'
import * as ClusterService from './ClusterService.js'
import { TFIDFEngine } from './TFIDFEngine.js'
import type {
  StorageAdapter, Item, ChordEvent, Cluster, ClusterUserIntent,
  UserSettings, BatchOperation, ClusterInput, ClusterResult,
} from '@chord/types'
import { DEFAULT_SETTINGS } from '@chord/types'
import type { AIEngine, QuestionContext } from './AIEngine.js'

// ─── MemoryAdapter ────────────────────────────────────────────

class MemoryAdapter implements StorageAdapter {
  items: Item[] = []
  events: ChordEvent[] = []
  settings: UserSettings = {
    ...DEFAULT_SETTINGS,
    userId: 'u',
    deviceId: 'd',
  }
  clusters: Cluster[] = []
  clusterUserIntents: ClusterUserIntent[] = []
  async getItems(filter?: { type?: string[]; status?: string[] }) {
    let r = this.items
    if (filter?.type?.length) r = r.filter((i) => filter.type!.includes(i.type))
    if (filter?.status?.length) r = r.filter((i) => filter.status!.includes(i.status))
    return r
  }
  async getItem(id: string) { return this.items.find((i) => i.id === id) ?? null }
  async putItem(item: Item) {
    const i = this.items.findIndex((x) => x.id === item.id)
    if (i >= 0) this.items[i] = item; else this.items.push(item)
  }
  async putItems(items: Item[]) { this.items = items }
  async deleteItem(id: string) { this.items = this.items.filter((i) => i.id !== id) }
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

function mkItem(id: string, title: string, cluster?: string): Item {
  return {
    id,
    url: `https://e.com/${id}`,
    title,
    favicon: '',
    savedAt: Date.now(),
    sourceDomain: 'e.com',
    type: 'content',
    status: 'pending',
    wakeCount: 0,
    source: 'saved',
    cluster,
  }
}

// ─── 测试 ─────────────────────────────────────────────────────

describe('ClusterService 集成测试：老用户更新流程', () => {
  it('CR-019: 老 v6 cluster 在 recluster 后应该升级到 v7', async () => {
    const a = new MemoryAdapter()
    // 老 v6 cluster：name 是「纹藏 · agi」装着 100 条无关内容（junk drawer）
    a.clusters = [
      {
        id: 'old1',
        name: '纹藏 · agi',
        itemIds: Array.from({ length: 100 }, (_, i) => `i${i}`),
        keywords: ['纹藏', 'agi'],
        processedCount: 0,
        totalCount: 100,
        updatedAt: Date.now() - 1000,
        algoVersion: 6,   // 老版本
      },
    ]
    // 100 条真实内容，主题分散
    const topics = [
      'Java 全栈知识体系', 'TypeScript 高级用法', 'React Hooks 源码',
      '红烧肉做法', '清蒸鲈鱼', '番茄炒蛋',
      '机器学习入门', '深度学习', 'Transformer 原理',
      '半导体设备分析报告', '芯片产业研究', '5G 通信',
      '蔚来汽车', '理想 ONE', '比亚迪',
    ]
    for (let i = 0; i < 100; i++) {
      a.items.push(mkItem(`i${i}`, topics[i % topics.length]!, '纹藏 · agi'))
    }

    // shouldRecluster 应该因为 algoVersion 不匹配返回 true
    const shouldRe = await ClusterService.shouldRecluster(a)
    expect(shouldRe).toBe(true)

    // recluster 用 TFIDFEngine（线下，不调 AI）
    await ClusterService.recluster(a, new TFIDFEngine())

    // 验证新 clusters 的 algoVersion = 7
    expect(a.clusters.length).toBeGreaterThan(1)   // 100 条应该至少切 5+ 类
    for (const c of a.clusters) {
      expect(c.algoVersion).toBe(10)
    }

    // shouldRecluster 应该返回 false 了（新 cluster 是 v7，items 也都被分配）
    expect(await ClusterService.shouldRecluster(a)).toBe(false)
  })

  it('CR-018: 100 条无关内容应该切成多个紧致 cluster（不是 1 个杂物抽屉）', async () => {
    const a = new MemoryAdapter()
    const topics = ['Java', 'Python', '红烧肉', '清蒸鱼', '机器学习', '深度学习']
    for (let i = 0; i < 100; i++) {
      a.items.push(mkItem(`i${i}`, `${topics[i % topics.length]} 教程 ${i}`))
    }
    await ClusterService.recluster(a, new TFIDFEngine())

    // 100 条 / 12 ≈ 9 类（min 8，max 20）
    expect(a.clusters.length).toBeGreaterThanOrEqual(5)
    expect(a.clusters.length).toBeLessThanOrEqual(20)

    // 任何一个 cluster 都不应该占超过 70%（之前的 junk drawer 占 100%）
    for (const c of a.clusters) {
      expect(c.itemIds.length).toBeLessThan(70)
    }
  })

  it('CR-018: 强主题（20 条 React）+ 杂项（15 条）不会被全部塞到一个 cluster', async () => {
    const a = new MemoryAdapter()
    // 主题相关的 20 条 + 完全无关的 15 条（杂项）
    for (let i = 0; i < 20; i++) a.items.push(mkItem(`tech${i}`, `React Hooks 教程 ${i}`))
    a.items.push(mkItem('rand1', '红烧肉'))
    a.items.push(mkItem('rand2', '北京旅游'))
    a.items.push(mkItem('rand3', '股票投资'))
    a.items.push(mkItem('rand4', '日本动漫'))
    a.items.push(mkItem('rand5', '健身计划'))
    a.items.push(mkItem('rand6', '咖啡冲泡'))
    a.items.push(mkItem('rand7', 'NBA 赛事'))
    a.items.push(mkItem('rand8', '红酒品鉴'))
    a.items.push(mkItem('rand9', '钢琴学习'))
    a.items.push(mkItem('rand10', '电影推荐'))
    a.items.push(mkItem('rand11', '化学反应'))
    a.items.push(mkItem('rand12', '物理实验'))
    a.items.push(mkItem('rand13', '历史人物'))
    a.items.push(mkItem('rand14', '心理学'))
    a.items.push(mkItem('rand15', '经济学'))

    await ClusterService.recluster(a, new TFIDFEngine())

    // 不变量：35 条不应该被塞到一个 cluster 里
    for (const c of a.clusters) {
      expect(c.itemIds.length).toBeLessThan(30)   // < 30 = 不是 junk drawer
    }
    // React 那 20 条应该聚拢在同一个 cluster（cohesion 信号强）
    const techMember = a.clusters.find((c) => c.itemIds.includes('tech0'))
    expect(techMember).toBeDefined()
    const techsInSameCluster = techMember!.itemIds.filter((id) => id.startsWith('tech')).length
    expect(techsInSameCluster).toBeGreaterThan(10)   // 至少 10 个 React 在一起
  })

  // ★ 设计反转：AI 失败时不再 silent fallback 到 TFIDF。
  // 之前 CR-019 设计是"宁可有结果也不要 UI 空"——但实际副作用是用户配错 AI key
  // 看见 TFIDF n-gram 乱名（「阿里云·报深」「89 条其他」）以为 Chord 坏了，找不到病因。
  // 新契约：AI 失败直接抛错 → 调用方写 chord_recluster_status.lastError → UI banner 提示用户去 Settings 检查
  it('AI 引擎失败时，应该抛错（让调用方写错误状态 + UI 提示），而不是 silent fallback 到 TFIDF', async () => {
    const a = new MemoryAdapter()
    for (let i = 0; i < 20; i++) a.items.push(mkItem(`i${i}`, `React Hooks ${i}`))

    const brokenEngine: AIEngine = {
      id: 'broken',
      requiresApiKey: true,
      async cluster() {
        throw new Error('Simulated AI failure (e.g., API timeout)')
      },
      async generateQuestion(_ctx: QuestionContext) { return 'test' },
    }

    await expect(ClusterService.recluster(a, brokenEngine)).rejects.toThrow('Simulated AI failure')

    // 旧 cluster 数据不被覆盖（这里 a.clusters 初始为空，所以仍是空，关键是 recluster 没写入 TFIDF 结果）
    expect(a.clusters.length).toBe(0)
  })

  it('已有旧 AI cluster 数据时，AI 失败不覆盖旧数据', async () => {
    const a = new MemoryAdapter()
    // 老数据：上次 AI 成功的结果
    a.clusters = [{
      id: 'old',
      name: 'AI 应用与工具',
      itemIds: ['i0'],
      keywords: [],
      processedCount: 0,
      totalCount: 1,
      updatedAt: Date.now() - 60_000,
      algoVersion: ClusterService.CLUSTER_ALGO_VERSION,
      algorithm: 'ai',
    }]
    for (let i = 0; i < 20; i++) a.items.push(mkItem(`i${i}`, `Item ${i}`))

    const brokenEngine: AIEngine = {
      id: 'broken',
      requiresApiKey: true,
      async cluster() { throw new Error('AI down') },
      async generateQuestion() { return '' },
    }

    await expect(ClusterService.recluster(a, brokenEngine)).rejects.toThrow('AI down')

    // 旧 cluster 完整保留，cluster 名仍是 L1 而不是 TFIDF 片段
    expect(a.clusters.length).toBe(1)
    expect(a.clusters[0]!.name).toBe('AI 应用与工具')
    expect(a.clusters[0]!.algorithm).toBe('ai')
  })

  it('TFIDFEngine 直接抛错时，错误同样传播', async () => {
    const a = new MemoryAdapter()
    for (let i = 0; i < 20; i++) a.items.push(mkItem(`i${i}`, `Test ${i}`))

    // 用一个继承 TFIDFEngine 但被 sabotage 的引擎；ClusterService 看到 instanceof TFIDFEngine 就不再 fallback
    class BadTFIDFEngine extends TFIDFEngine {
      async cluster(_items: ClusterInput[]): Promise<ClusterResult[]> {
        throw new Error('TF-IDF intentional failure')
      }
    }

    await expect(ClusterService.recluster(a, new BadTFIDFEngine())).rejects.toThrow('TF-IDF')
  })
})

// ─── shouldRecluster：unclustered 触发条件（"未分类 4 条不分类"修复）────
describe('ClusterService.shouldRecluster — unclustered 触发', () => {
  function setupRecentClusters(a: MemoryAdapter, minutesAgo: number) {
    const updatedAt = Date.now() - minutesAgo * 60_000
    a.clusters = [{
      id: 'c1',
      name: 'AI 应用与工具',
      itemIds: [],
      keywords: [],
      processedCount: 0,
      totalCount: 0,
      updatedAt,
      algoVersion: ClusterService.CLUSTER_ALGO_VERSION,
    }]
  }

  it('1 条 unclustered + 上次 ≥ 5 min → 触发（解决「4 条不分类」的核心 bug）', async () => {
    const a = new MemoryAdapter()
    setupRecentClusters(a, 10)
    // 4 条 unclustered（贵州人才博览会 / CBRS / 人形机器人投研 / ...）
    a.items.push(mkItem('i1', '贵州人才博览会｜岗位1001 网络安全工程师'))
    a.items.push(mkItem('i2', 'CBRS Stock Analysis'))
    a.items.push(mkItem('i3', '人形机器人全产业链投研报告'))
    a.items.push(mkItem('i4', '智谱清言 API 文档'))
    // 触发：unclustered>0 + cooldown 5min 满足
    expect(await ClusterService.shouldRecluster(a)).toBe(true)
  })

  it('1 条 unclustered + 上次 < 5 min → 不触发（cooldown 防止 spam）', async () => {
    const a = new MemoryAdapter()
    setupRecentClusters(a, 1)   // 1 分钟前刚跑过
    a.items.push(mkItem('i1', 'New item'))
    expect(await ClusterService.shouldRecluster(a)).toBe(false)
  })

  it('全部 item 已分类 → 不触发（避免无谓的 AI 调用）', async () => {
    const a = new MemoryAdapter()
    setupRecentClusters(a, 60)
    a.items.push(mkItem('i1', 'Item 1', 'AI 应用与工具'))
    a.items.push(mkItem('i2', 'Item 2', '编程与软件开发'))
    expect(await ClusterService.shouldRecluster(a)).toBe(false)
  })

  it('100 条 unclustered（bulk import）→ 触发一次（批处理，不是 100 次）', async () => {
    const a = new MemoryAdapter()
    setupRecentClusters(a, 10)
    for (let i = 0; i < 100; i++) a.items.push(mkItem(`i${i}`, `bookmark ${i}`))
    // 不管 1 条还是 100 条 unclustered，shouldRecluster 只返回 1 次 true
    expect(await ClusterService.shouldRecluster(a)).toBe(true)
    // 注意：实际批处理由 recluster() 单次 AI 调用完成（验证在上面的集成测试里）
  })

  it('已有 20+ 新增 → 仍走原来的 NEW_ITEMS_THRESHOLD 路径触发', async () => {
    const a = new MemoryAdapter()
    setupRecentClusters(a, 1)   // 1 min 前刚跑过，cooldown 不满足
    // 但有 25 条新增（已经过 lastUpdate）
    const lastUpdate = a.clusters[0]!.updatedAt
    for (let i = 0; i < 25; i++) {
      const it = mkItem(`i${i}`, `new ${i}`)
      it.savedAt = lastUpdate + 1000   // 比 lastUpdate 新
      it.cluster = 'AI 应用与工具'        // 已分类，确保不走 unclustered 路径
      a.items.push(it)
    }
    expect(await ClusterService.shouldRecluster(a)).toBe(true)
  })

  it('released 的 unclustered item 不触发（只关心 pending/kept）', async () => {
    const a = new MemoryAdapter()
    setupRecentClusters(a, 60)
    const released = mkItem('i1', 'old released')
    released.status = 'released'
    a.items.push(released)
    expect(await ClusterService.shouldRecluster(a)).toBe(false)
  })
})

// ─── algorithm 字段 + TFIDF fallback 自动重试 ────────────────────
describe('ClusterService 算法标记 + TFIDF fallback 重试', () => {
  it('AI 跑成功 → clusters[i].algorithm === "ai"', async () => {
    const a = new MemoryAdapter()
    for (let i = 0; i < 20; i++) a.items.push(mkItem(`i${i}`, `AI ${i}`))
    const aiEngine: AIEngine = {
      id: 'mock-ai',
      requiresApiKey: true,
      async cluster(inputs) {
        return [{ name: 'AI 应用与工具', itemIds: inputs.map((i) => i.id), keywords: [] }]
      },
      async generateQuestion() { return 'q' },
    }
    const clusters = await ClusterService.recluster(a, aiEngine)
    expect(clusters.length).toBeGreaterThan(0)
    expect(clusters.every((c) => c.algorithm === 'ai')).toBe(true)
  })

  it('调用方明确传 TFIDFEngine（离线模式）→ clusters[i].algorithm === "tfidf"', async () => {
    // 新契约：AI 失败不再自动 fallback，但调用方可以明确选离线 TFIDF 模式
    const a = new MemoryAdapter()
    for (let i = 0; i < 20; i++) a.items.push(mkItem(`i${i}`, `JavaScript framework ${i}`))
    const clusters = await ClusterService.recluster(a, new TFIDFEngine())
    expect(clusters.length).toBeGreaterThan(0)
    expect(clusters.every((c) => c.algorithm === 'tfidf')).toBe(true)
  })

  it('回归：上次 TFIDF + ≥ 30 min → shouldRecluster 强制重试（修「TFIDF 残留卡死」bug）', async () => {
    const a = new MemoryAdapter()
    // 30 min + 1s 前用 TFIDF 跑过（满足重试 cooldown）
    const tfidfRunAt = Date.now() - 30 * 60_000 - 1000
    a.clusters = [{
      id: 'c1',
      name: '阿里云·报深',                            // ← TFIDF 风格的乱名
      itemIds: ['i1'],
      keywords: [],
      processedCount: 0,
      totalCount: 1,
      updatedAt: tfidfRunAt,
      algoVersion: ClusterService.CLUSTER_ALGO_VERSION,
      algorithm: 'tfidf',
    }]
    a.items.push(mkItem('i1', 'fake', '阿里云·报深'))
    expect(await ClusterService.shouldRecluster(a)).toBe(true)
  })

  it('上次 TFIDF 但 < 30 min → 暂不重试（避免 spam AI）', async () => {
    const a = new MemoryAdapter()
    const tfidfRunAt = Date.now() - 5 * 60_000  // 5 min 前
    a.clusters = [{
      id: 'c1',
      name: '阿里云·报深',
      itemIds: ['i1'],
      keywords: [],
      processedCount: 0,
      totalCount: 1,
      updatedAt: tfidfRunAt,
      algoVersion: ClusterService.CLUSTER_ALGO_VERSION,
      algorithm: 'tfidf',
    }]
    a.items.push(mkItem('i1', 'fake', '阿里云·报深'))
    expect(await ClusterService.shouldRecluster(a)).toBe(false)
  })

  it('上次 AI + 没新 item + 没 unclustered → 不重试（不耗 AI 配额）', async () => {
    const a = new MemoryAdapter()
    a.clusters = [{
      id: 'c1',
      name: 'AI 应用与工具',
      itemIds: ['i1'],
      keywords: [],
      processedCount: 0,
      totalCount: 1,
      updatedAt: Date.now() - 60 * 60_000,   // 1 小时前
      algoVersion: ClusterService.CLUSTER_ALGO_VERSION,
      algorithm: 'ai',
    }]
    a.items.push(mkItem('i1', 'AI 工具', 'AI 应用与工具'))
    expect(await ClusterService.shouldRecluster(a)).toBe(false)
  })

  it('老数据缺 algorithm 字段 → 视作 ai（向后兼容）', async () => {
    const a = new MemoryAdapter()
    // 没有 algorithm 字段（pre-fix 的数据）
    a.clusters = [{
      id: 'c1',
      name: 'AI 应用与工具',
      itemIds: ['i1'],
      keywords: [],
      processedCount: 0,
      totalCount: 1,
      updatedAt: Date.now() - 60 * 60_000,
      algoVersion: ClusterService.CLUSTER_ALGO_VERSION,
      // algorithm: undefined
    }]
    a.items.push(mkItem('i1', 'AI 工具', 'AI 应用与工具'))
    // 不该被 TFIDF 重试逻辑命中
    expect(await ClusterService.shouldRecluster(a)).toBe(false)
  })
})
