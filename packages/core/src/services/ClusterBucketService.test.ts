import { describe, it, expect } from 'vitest'
import {
  UNCLUSTERED_BUCKET,
  groupByCluster,
  filterByClusterBucket,
  type HasCluster,
} from './ClusterBucketService.js'

interface T extends HasCluster { id: string }

describe('ClusterBucketService.groupByCluster', () => {
  it('空数组 → 空 Map', () => {
    expect(groupByCluster([]).size).toBe(0)
  })

  it('按 cluster 名分组', () => {
    const items: T[] = [
      { id: 'a', cluster: 'AI 应用与工具' },
      { id: 'b', cluster: 'AI 应用与工具' },
      { id: 'c', cluster: '编程' },
    ]
    const m = groupByCluster(items)
    expect(m.get('AI 应用与工具')!.map((i) => i.id)).toEqual(['a', 'b'])
    expect(m.get('编程')!.map((i) => i.id)).toEqual(['c'])
  })

  it('cluster 缺失的归入 UNCLUSTERED_BUCKET 虚拟桶', () => {
    const items: T[] = [
      { id: 'a' },
      { id: 'b', cluster: undefined },
      { id: 'c', cluster: 'X' },
    ]
    const m = groupByCluster(items)
    expect(m.get(UNCLUSTERED_BUCKET)!.map((i) => i.id)).toEqual(['a', 'b'])
    expect(m.get('X')!.map((i) => i.id)).toEqual(['c'])
  })
})

describe('ClusterBucketService.filterByClusterBucket', () => {
  const items: T[] = [
    { id: 'a', cluster: 'AI' },
    { id: 'b' },
    { id: 'c', cluster: 'AI' },
    { id: 'd' },
    { id: 'e', cluster: '编程' },
  ]

  it('普通桶名 → 严格相等', () => {
    expect(filterByClusterBucket(items, 'AI').map((i) => i.id)).toEqual(['a', 'c'])
    expect(filterByClusterBucket(items, '编程').map((i) => i.id)).toEqual(['e'])
  })

  it('UNCLUSTERED_BUCKET → 过滤 cluster 字段为空的', () => {
    expect(filterByClusterBucket(items, UNCLUSTERED_BUCKET).map((i) => i.id)).toEqual(['b', 'd'])
  })

  // ↓ Process.tsx 历史 bug 的回归测试：
  it('回归：UNCLUSTERED_BUCKET 不应被当作普通字符串严格匹配（会 0 命中）', () => {
    // 旧 bug 写法：i.cluster === '未分类' 永远返回 []，因为没人会把 cluster 设成字面量 '未分类'
    // 新写法返回 2 条
    const result = filterByClusterBucket(items, UNCLUSTERED_BUCKET)
    expect(result.length).toBe(2)
    expect(result.every((i) => !i.cluster)).toBe(true)
  })

  it('Dashboard ↔ Process 计数一致：分组 N 条 → filterByBucket 拿到的也是 N 条', () => {
    const grouped = groupByCluster(items)
    for (const [bucket, group] of grouped) {
      const filtered = filterByClusterBucket(items, bucket)
      expect(filtered.length).toBe(group.length)
    }
  })

  it('不存在的桶名 → 空数组（不静默 fallback 到全部）', () => {
    expect(filterByClusterBucket(items, '不存在的桶')).toEqual([])
  })
})
