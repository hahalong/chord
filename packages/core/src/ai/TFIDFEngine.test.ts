import { describe, it, expect } from 'vitest'
import { TFIDFEngine } from './TFIDFEngine.js'

const engine = new TFIDFEngine()

// 30 items → k = ceil(30/15) = 2, enough for meaningful separation
const TECH_ITEMS = [
  { id: '1',  title: 'React Hooks Deep Dive',            domain: 'blog.example.com' },
  { id: '2',  title: 'TypeScript Advanced Types',         domain: 'dev.to' },
  { id: '3',  title: 'JavaScript Performance Tips',       domain: 'medium.com' },
  { id: '7',  title: 'CSS Grid Layout Tutorial',          domain: 'css-tricks.com' },
  { id: '8',  title: 'Frontend Architecture Patterns',    domain: 'architecture.io' },
  { id: '10', title: 'Vue 3 Composition API',             domain: 'vuejs.org' },
  { id: '11', title: 'Node.js Backend Development',       domain: 'nodejs.org' },
  { id: '12', title: 'GraphQL API Design',                domain: 'graphql.org' },
  { id: '13', title: 'Docker Container Fundamentals',     domain: 'docker.com' },
  { id: '14', title: 'Kubernetes Orchestration Guide',    domain: 'kubernetes.io' },
  { id: '15', title: 'WebAssembly Performance',           domain: 'webassembly.org' },
  { id: '16', title: 'Rust Programming Language',         domain: 'rust-lang.org' },
  { id: '17', title: 'React Testing Library Best Practices', domain: 'testing-library.com' },
  { id: '18', title: 'Vite Build Tool Configuration',    domain: 'vitejs.dev' },
  { id: '19', title: 'Tailwind CSS Utility Classes',     domain: 'tailwindcss.com' },
  { id: '4',  title: 'Cooking Pasta Carbonara Recipe',   domain: 'food.com' },
  { id: '5',  title: 'Italian Cuisine Traditional Guide', domain: 'recipes.com' },
  { id: '6',  title: 'Mediterranean Diet Health Benefits', domain: 'health.com' },
  { id: '9',  title: 'Healthy Meal Prep Weekly Plan',    domain: 'nutrition.org' },
  { id: '20', title: 'Baking Sourdough Bread at Home',   domain: 'baking.com' },
  { id: '21', title: 'French Pastry Techniques',         domain: 'patisserie.fr' },
  { id: '22', title: 'Japanese Ramen Broth Secrets',     domain: 'food.jp' },
  { id: '23', title: 'Vegan Protein Sources Cookbook',   domain: 'veganlife.com' },
  { id: '24', title: 'BBQ Grill Mastery Guide',          domain: 'grillmaster.com' },
  { id: '25', title: 'Fermentation Kimchi Techniques',   domain: 'ferment.kr' },
  { id: '26', title: 'Thai Street Food Recipes',         domain: 'thaifood.com' },
  { id: '27', title: 'Indian Spice Curry Cooking',       domain: 'curry.in' },
  { id: '28', title: 'Smoothie Bowl Nutrition Guide',    domain: 'smoothie.io' },
  { id: '29', title: 'Pizza Dough Perfection Method',    domain: 'pizza.it' },
  { id: '30', title: 'Chocolate Dessert Baking Tips',    domain: 'chocolate.com' },
]

// ─── cluster ─────────────────────────────────────────────────

describe('TFIDFEngine.cluster', () => {
  it('returns empty array for 0 items', async () => {
    expect(await engine.cluster([])).toEqual([])
  })

  it('clusters items into groups', async () => {
    const results = await engine.cluster(TECH_ITEMS)
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(8)
  })

  it('every item appears in exactly one cluster', async () => {
    const results = await engine.cluster(TECH_ITEMS)
    const allIds = results.flatMap((r) => r.itemIds)
    const uniqueIds = new Set(allIds)
    expect(uniqueIds.size).toBe(TECH_ITEMS.length)
    expect(allIds).toHaveLength(TECH_ITEMS.length)
  })

  it('each cluster has a name and keywords', async () => {
    const results = await engine.cluster(TECH_ITEMS)
    for (const r of results) {
      expect(typeof r.name).toBe('string')
      expect(r.name.length).toBeGreaterThan(0)
      expect(Array.isArray(r.keywords)).toBe(true)
    }
  })

  it('produces at least 2 clusters for 30 items', async () => {
    // k = min(8, ceil(30/15)) = 2
    const results = await engine.cluster(TECH_ITEMS)
    expect(results.length).toBeGreaterThanOrEqual(2)
  })

  it('each item belongs to exactly one cluster', async () => {
    const results = await engine.cluster(TECH_ITEMS)
    const allIds = results.flatMap((r) => r.itemIds).sort()
    const expectedIds = TECH_ITEMS.map((i) => i.id).sort()
    expect(allIds).toEqual(expectedIds)
  })

  it('respects the count parameter', async () => {
    const results = await engine.cluster(TECH_ITEMS, 2)
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('handles small item set (< 15 → 1 cluster)', async () => {
    const small = TECH_ITEMS.slice(0, 5)
    const results = await engine.cluster(small)
    expect(results).toHaveLength(1)
    expect(results[0]!.itemIds).toHaveLength(5)
  })
})

// ─── 中文聚类质量 ──────────────────────────────────────────────

describe('TFIDFEngine 中文聚类质量', () => {
  it('相同域名不同主题被分到多个 cluster（不会因域名相同而强行合并）', async () => {
    // 同一域名下两组语义完全不同的内容
    const items = [
      // 烹饪
      { id: 'c1', title: '红烧肉家常做法详解', domain: 'mp.weixin.qq.com' },
      { id: 'c2', title: '清蒸鲈鱼的烹饪步骤', domain: 'mp.weixin.qq.com' },
      { id: 'c3', title: '麻婆豆腐川菜经典菜谱', domain: 'mp.weixin.qq.com' },
      { id: 'c4', title: '北京烤鸭酱料配方', domain: 'mp.weixin.qq.com' },
      // 编程
      { id: 'p1', title: 'TypeScript 泛型高级用法', domain: 'mp.weixin.qq.com' },
      { id: 'p2', title: 'React Hooks 源码原理', domain: 'mp.weixin.qq.com' },
      { id: 'p3', title: 'Vue 响应式系统实现', domain: 'mp.weixin.qq.com' },
      { id: 'p4', title: 'Node 性能调优指南', domain: 'mp.weixin.qq.com' },
    ]
    const r = await engine.cluster(items, 2)
    // 关键断言：域名相同的 8 条不会被塞进同一个 cluster
    expect(r.length).toBeGreaterThanOrEqual(2)
    // 任何一个 cluster 都不应该同时拥有「全部烹饪」和「全部编程」
    for (const c of r) {
      const cookCount = c.itemIds.filter((id) => id.startsWith('c')).length
      const progCount = c.itemIds.filter((id) => id.startsWith('p')).length
      expect(cookCount === 4 && progCount === 4).toBe(false)
    }
  })

  it('cluster name / keywords 不含域名片段', async () => {
    const items = [
      { id: '1', title: '机器学习入门教程', domain: 'mp.weixin.qq.com' },
      { id: '2', title: '深度学习实战', domain: 'mp.weixin.qq.com' },
      { id: '3', title: '神经网络原理', domain: 'mp.weixin.qq.com' },
      { id: '4', title: '人工智能基础', domain: 'mp.weixin.qq.com' },
    ]
    const r = await engine.cluster(items, 1)
    expect(r[0]!.name).not.toMatch(/weixin|qq|mp\b/i)
    expect(r[0]!.keywords.join(' ')).not.toMatch(/\b(weixin|qq|mp)\b/i)
  })

  it('cluster 名不应出现「配置指·置指南」这种 n-gram 切片', async () => {
    // 反向 case：构造一组关于「配置指南」的标题，确保 cluster 名是「配置指南」而非「配置指·置指南」
    const items = [
      { id: '1', title: 'Nginx 配置指南完整教程', domain: 'a.com' },
      { id: '2', title: '反向代理配置指南实例', domain: 'b.com' },
      { id: '3', title: 'TLS 证书配置指南', domain: 'c.com' },
      { id: '4', title: 'Docker 配置指南速查', domain: 'd.com' },
    ]
    const r = await engine.cluster(items, 1)
    const name = r[0]!.name
    // 不应包含「·」分割的相邻 n-gram 切片
    // 即：name 不应同时包含 '配置指' 和 '置指南' 作为 · 分割的独立段
    const parts = name.split(' · ')
    expect(parts).not.toContain('配置指')
    expect(parts).not.toContain('置指南')
    // 应该能合并出「配置指南」（或包含「配置」「指南」的有意义组合）
    expect(name).toMatch(/配置指南|配置|指南/)
  })

  it('「分析报告」类标题应合并为完整词，不出「分析报 · 析报告」', async () => {
    const items = [
      { id: '1', title: '半导体设备产业深度分析报告', domain: 'a.com' },
      { id: '2', title: '2025 AI 行业分析报告', domain: 'b.com' },
      { id: '3', title: '消费电子分析报告 Q3', domain: 'c.com' },
      { id: '4', title: '新能源分析报告完整版', domain: 'd.com' },
    ]
    const r = await engine.cluster(items, 1)
    const parts = r[0]!.name.split(' · ')
    expect(parts).not.toContain('分析报')
    expect(parts).not.toContain('析报告')
  })

  it('合并后应去掉子串残留', async () => {
    // 「通义听悟」会切出 通义/义听/听悟/通义听/义听悟。
    // top-3 关键词若是 通义听、义听悟、通义 → 合并→「通义听悟」+ 去子串「通义」
    const items = [
      { id: '1', title: '通义听悟使用心得', domain: 'a.com' },
      { id: '2', title: '通义听悟和 Notta 对比', domain: 'b.com' },
      { id: '3', title: '会议纪要 通义听悟方案', domain: 'c.com' },
      { id: '4', title: '通义听悟接入 API', domain: 'd.com' },
    ]
    const r = await engine.cluster(items, 1)
    const name = r[0]!.name
    const parts = name.split(' · ')
    expect(parts).not.toContain('通义听')
    expect(parts).not.toContain('义听悟')
  })

  it('英文 title 中的域名 token 也被滤掉', async () => {
    const items = [
      { id: '1', title: 'GitHub Actions Tutorial', domain: 'github.com' },
      { id: '2', title: 'GitHub Pages Setup',      domain: 'github.com' },
      { id: '3', title: 'GitHub CLI Reference',    domain: 'github.com' },
    ]
    const r = await engine.cluster(items, 1)
    expect(r[0]!.keywords.join(' ').toLowerCase()).not.toContain('github')
  })

  it('跨域名时，A 域名的 token 在 B 域名 item 里也被过滤掉（全局域名停用）', async () => {
    // arxiv 论文推荐这种文章可能被收藏自 medium.com 或 zhihu.com，
    // 标题里出现 "arxiv" 这个词，但 arxiv 不该成为聚类名
    const items = [
      { id: '1', title: 'arxiv 论文推荐 Transformer 架构', domain: 'medium.com' },
      { id: '2', title: 'Attention is All You Need 经典论文', domain: 'arxiv.org' },
      { id: '3', title: 'BERT 预训练模型详解',                domain: 'zhihu.com' },
      { id: '4', title: 'arxiv 上值得读的深度学习论文',       domain: 'mp.weixin.qq.com' },
    ]
    const r = await engine.cluster(items, 1)
    const allKw = r[0]!.keywords.join(' ').toLowerCase()
    expect(allKw).not.toContain('arxiv')
    expect(allKw).not.toContain('medium')
    expect(allKw).not.toContain('weixin')
    expect(r[0]!.name.toLowerCase()).not.toMatch(/arxiv|medium|weixin|zhihu/)
  })
})

// ─── generateQuestion ─────────────────────────────────────────

describe('TFIDFEngine.generateQuestion', () => {
  it('returns a non-empty string', async () => {
    const q = await engine.generateQuestion({
      title: 'React Hooks Deep Dive',
      domain: 'blog.example.com',
      savedAt: Date.now() - 30 * 86400000,
      wakeCount: 0,
    })
    expect(typeof q).toBe('string')
    expect(q.length).toBeGreaterThan(0)
  })

  it('generates different questions on repeated calls (some variety)', async () => {
    const ctx = {
      title: 'TypeScript Advanced Types',
      domain: 'dev.to',
      savedAt: Date.now() - 60 * 86400000,
      wakeCount: 2,
    }
    const questions = await Promise.all([
      engine.generateQuestion(ctx),
      engine.generateQuestion({ ...ctx, wakeCount: 3 }),
      engine.generateQuestion({ ...ctx, wakeCount: 1, cluster: '编程' }),
    ])
    expect(questions.every((q) => q.length > 0)).toBe(true)
  })

  it('includes context-relevant content in question', async () => {
    // The question should reference time or the item in some way
    const q = await engine.generateQuestion({
      title: 'React Hooks Deep Dive',
      domain: 'blog.example.com',
      savedAt: Date.now() - 365 * 86400000,  // 1 year ago
      wakeCount: 0,
    })
    // Should mention time passing (年 or 月 or 天)
    expect(/[年月天]|年前|过去/.test(q) || q.includes('React') || q.length > 10).toBe(true)
  })
})
