// CR-028：合成数据集回归测试（CI 友好版）
// 用 mock AIEngine 跑评测，验证：
//   1. cluster 函数能消化合成数据集
//   2. 评测指标计算正确
//   3. L1 cluster 名永远稳定（无 `·` 拼接）
//   4. cluster 输出顺序按 L1_CATEGORIES 定义
//
// 真实 AI 评测在 packages/core/test/eval/run-eval.mjs，手动跑

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { L1_NAMES, L1_NAME_SET, L1_CATEGORIES } from '../../src/ai/L1Categories.js'
import type { AIEngine, QuestionContext, IntentClassificationInput, IntentClassificationResult, PingResult } from '../../src/ai/AIEngine.js'
import type { ClusterInput, ClusterResult } from '@chord/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATASET_PATH = resolve(__dirname, 'synthetic-dataset.json')

interface SyntheticItem {
  id: string
  title: string
  url: string
  sourceDomain: string
  label: string
  labelConfidence?: string
  boundaryNote?: string
}

// ─── Mock 引擎：完美按 ground truth 分类（用于测评测脚本本身）
class PerfectMockEngine implements AIEngine {
  readonly id = 'mock-perfect'
  readonly requiresApiKey = false
  constructor(private labelByItemId: Map<string, string>) {}

  async cluster(items: ClusterInput[]): Promise<ClusterResult[]> {
    const byLabel = new Map<string, string[]>()
    for (const it of items) {
      const label = this.labelByItemId.get(it.id) ?? '其他'
      if (!byLabel.has(label)) byLabel.set(label, [])
      byLabel.get(label)!.push(it.id)
    }
    // 按 L1_CATEGORIES 顺序输出
    const results: ClusterResult[] = []
    for (const cat of L1_CATEGORIES) {
      const ids = byLabel.get(cat.name)
      if (!ids || ids.length === 0) continue
      results.push({ name: cat.name, keywords: [cat.id], itemIds: ids })
    }
    return results
  }

  async generateQuestion(_ctx: QuestionContext): Promise<string> { return 'mock' }
  async classifyIntents(_items: IntentClassificationInput[]): Promise<IntentClassificationResult[]> { return [] }
  async ping(): Promise<PingResult> { return { ok: true } }
}

// ─── 模拟 80% 准确的 AI 引擎（10 条里 2 条随机错）
class NoisyMockEngine implements AIEngine {
  readonly id = 'mock-noisy'
  readonly requiresApiKey = false
  constructor(
    private labelByItemId: Map<string, string>,
    private noiseRate = 0.2,
  ) {}

  async cluster(items: ClusterInput[]): Promise<ClusterResult[]> {
    const byLabel = new Map<string, string[]>()
    for (const [idx, it] of items.entries()) {
      const truth = this.labelByItemId.get(it.id) ?? '其他'
      // 用 idx 作伪随机种子（保证测试确定性）
      const noise = (idx * 7) % 10 < this.noiseRate * 10
      const label = noise ? '编程与软件开发' : truth  // 错的统一打成「编程」
      if (!byLabel.has(label)) byLabel.set(label, [])
      byLabel.get(label)!.push(it.id)
    }
    const results: ClusterResult[] = []
    for (const cat of L1_CATEGORIES) {
      const ids = byLabel.get(cat.name)
      if (!ids || ids.length === 0) continue
      results.push({ name: cat.name, keywords: [cat.id], itemIds: ids })
    }
    return results
  }

  async generateQuestion(_ctx: QuestionContext): Promise<string> { return 'mock' }
  async classifyIntents(_items: IntentClassificationInput[]): Promise<IntentClassificationResult[]> { return [] }
  async ping(): Promise<PingResult> { return { ok: true } }
}

// ─── 评测指标计算（脱离 run-eval.mjs，复用核心逻辑）
function evaluate(items: SyntheticItem[], clusters: ClusterResult[]) {
  const itemToCluster = new Map<string, string>()
  for (const c of clusters) {
    for (const id of c.itemIds) itemToCluster.set(id, c.name)
  }
  let correct = 0
  const perClass: Record<string, { correct: number; total: number }> = {}
  for (const it of items) {
    const truth = it.label
    const pred = itemToCluster.get(it.id) ?? '(missing)'
    if (!perClass[truth]) perClass[truth] = { correct: 0, total: 0 }
    perClass[truth].total++
    if (truth === pred) {
      correct++
      perClass[truth].correct++
    }
  }
  const total = items.length
  const maxClusterSize = Math.max(...clusters.map((c) => c.itemIds.length))
  const othersSize = clusters.find((c) => c.name === '其他')?.itemIds.length ?? 0
  return {
    accuracy: correct / total,
    coverage: itemToCluster.size / total,
    clusterCount: clusters.length,
    maxClusterRatio: maxClusterSize / total,
    othersRatio: othersSize / total,
    perClass,
  }
}

// ─── 测试 ───────────────────────────────────────────────
describe('CR-028 合成数据集回归', () => {
  const dataset = JSON.parse(readFileSync(DATASET_PATH, 'utf8')) as { items: SyntheticItem[] }
  const items: SyntheticItem[] = dataset.items
  const labelByItemId = new Map(items.map((it) => [it.id, it.label]))
  const clusterInputs: ClusterInput[] = items.map((it) => ({
    id: it.id, title: it.title, domain: it.sourceDomain,
  }))

  it('合成数据集每条都有合法 L1 标签', () => {
    for (const it of items) {
      expect(L1_NAME_SET.has(it.label)).toBe(true)
    }
  })

  it('合成数据集涵盖所有 10 个 L1 类别（除非 misc 类别故意为空）', () => {
    const labels = new Set(items.map((it) => it.label))
    expect(labels.size).toBeGreaterThanOrEqual(8)   // 至少 8 类
    for (const cat of L1_CATEGORIES) {
      if (cat.name === '其他') continue            // 「其他」少几条 OK
      expect(labels.has(cat.name)).toBe(true)
    }
  })

  it('PerfectMockEngine 应得 100% 准确率（验证评测计算正确）', async () => {
    const engine = new PerfectMockEngine(labelByItemId)
    const clusters = await engine.cluster(clusterInputs)
    const m = evaluate(items, clusters)
    expect(m.accuracy).toBe(1.0)
    expect(m.coverage).toBe(1.0)
  })

  it('PerfectMockEngine 的 cluster 顺序按 L1_CATEGORIES 定义', async () => {
    const engine = new PerfectMockEngine(labelByItemId)
    const clusters = await engine.cluster(clusterInputs)
    const order = clusters.map((c) => c.name)
    const expectedOrder = L1_CATEGORIES.filter((cat) =>
      items.some((it) => it.label === cat.name),
    ).map((cat) => cat.name)
    expect(order).toEqual(expectedOrder)
  })

  it('所有 cluster 名都来自 L1 预定义（无 `·` 拼接）', async () => {
    const engine = new PerfectMockEngine(labelByItemId)
    const clusters = await engine.cluster(clusterInputs)
    for (const c of clusters) {
      expect(L1_NAME_SET.has(c.name)).toBe(true)
      expect(c.name).not.toContain('·')
    }
  })

  it('NoisyMockEngine 20% 噪声下，准确率仍 ≥ 70%', async () => {
    const engine = new NoisyMockEngine(labelByItemId, 0.2)
    const clusters = await engine.cluster(clusterInputs)
    const m = evaluate(items, clusters)
    expect(m.accuracy).toBeGreaterThanOrEqual(0.7)
  })

  it('cluster 覆盖率 = 100%（每条 item 都被分到某个 cluster）', async () => {
    const engine = new PerfectMockEngine(labelByItemId)
    const clusters = await engine.cluster(clusterInputs)
    const totalAssigned = clusters.reduce((s, c) => s + c.itemIds.length, 0)
    expect(totalAssigned).toBe(items.length)
  })

  it('cluster 互斥（每条 item 只在一个 cluster 里）', async () => {
    const engine = new PerfectMockEngine(labelByItemId)
    const clusters = await engine.cluster(clusterInputs)
    const seen = new Set<string>()
    for (const c of clusters) {
      for (const id of c.itemIds) {
        expect(seen.has(id)).toBe(false)
        seen.add(id)
      }
    }
  })

  it('最大 cluster 占比 < 30%（避免 junk drawer）', async () => {
    const engine = new PerfectMockEngine(labelByItemId)
    const clusters = await engine.cluster(clusterInputs)
    const m = evaluate(items, clusters)
    expect(m.maxClusterRatio).toBeLessThan(0.3)
  })

  it('L1_NAMES 长度恰好 10', () => {
    expect(L1_NAMES.length).toBe(10)
  })
})
