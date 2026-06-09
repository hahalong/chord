import { describe, it, expect } from 'vitest'
import { rebindUserIntents } from './ClusterUserIntentService.js'
import type { ClusterUserIntent, Cluster } from '@chord/types'

function makeCluster(name: string, keywords: string[]): Cluster {
  return {
    id: name,
    name,
    itemIds: [],
    keywords,
    processedCount: 0,
    totalCount: 0,
    updatedAt: 0,
  }
}

function makeIntent(label: string, topKeywords: string[]): ClusterUserIntent {
  return {
    label,
    topKeywords,
    intent: 'project',
    setAt: 0,
  }
}

describe('ClusterUserIntentService.rebindUserIntents', () => {
  it('字面 label 匹配 → 保持不变', () => {
    const intents = [makeIntent('独立开发', ['独立', '开发', '副业'])]
    const clusters = [makeCluster('独立开发', ['独立', '开发', '产品'])]
    const r = rebindUserIntents(intents, clusters)
    expect(r[0]!.label).toBe('独立开发')
  })

  it('label 漂移但 keywords 高度重叠 → Jaccard 兜底重绑', () => {
    // 用户之前在「独立开发」声明意图
    const intents = [makeIntent('独立开发', ['独立', '开发', '副业', '产品'])]
    // recluster 后该主题被 AI 重命名为「独立开发者」
    const clusters = [
      makeCluster('独立开发者', ['独立', '开发', '副业', '产品']),  // Jaccard = 4/4 = 1.0
      makeCluster('设计感悟', ['设计', '感悟', '审美']),             // Jaccard = 0
    ]
    const r = rebindUserIntents(intents, clusters)
    expect(r[0]!.label).toBe('独立开发者')
    expect(r[0]!.intent).toBe('project')   // intent 保留
  })

  it('多个候选时挑 Jaccard 最高的', () => {
    const intents = [makeIntent('知识管理', ['笔记', '知识', '管理', 'Obsidian'])]
    const clusters = [
      makeCluster('个人知识管理', ['笔记', '知识', '管理', '体系']),  // J = 3/5 = 0.6
      makeCluster('笔记方法', ['笔记', 'Obsidian', '工作流']),         // J = 2/5 = 0.4
    ]
    const r = rebindUserIntents(intents, clusters)
    expect(r[0]!.label).toBe('个人知识管理')
  })

  it('Jaccard < 0.5 → 孤儿保留原 label', () => {
    const intents = [makeIntent('独立开发', ['独立', '开发', '副业'])]
    const clusters = [
      makeCluster('产品设计', ['产品', '设计', 'UX']),  // 完全不重叠
    ]
    const r = rebindUserIntents(intents, clusters)
    expect(r[0]!.label).toBe('独立开发')  // 原样保留，等下次 recluster 再试
  })

  it('空 keywords 不会爆', () => {
    const intents = [makeIntent('独立开发', [])]
    const clusters = [makeCluster('独立开发', [])]
    const r = rebindUserIntents(intents, clusters)
    expect(r[0]!.label).toBe('独立开发')  // 字面匹配命中
  })

  it('多条 intents 各自独立 rebind', () => {
    const intents = [
      makeIntent('独立开发', ['独立', '开发']),
      makeIntent('写作', ['写作', '文章', '思考']),
    ]
    const clusters = [
      makeCluster('独立开发者', ['独立', '开发']),       // 命中第 1 条
      makeCluster('深度写作', ['写作', '文章', '思考']),  // 命中第 2 条
    ]
    const r = rebindUserIntents(intents, clusters)
    expect(r[0]!.label).toBe('独立开发者')
    expect(r[1]!.label).toBe('深度写作')
  })
})
