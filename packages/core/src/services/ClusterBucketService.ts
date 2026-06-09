/**
 * ClusterBucketService —— 把"按 cluster 字段分组"的契约固化在一处
 *
 * 背景：Item.cluster 字段可能缺失（新 item、recluster 没覆盖到、孤儿样本）。
 * Dashboard 把缺失的 item 归入虚拟桶 '未分类' 显示；Process 收到 cluster 参数后
 * 需要识别这个虚拟桶名（否则严格相等会 0 命中）。
 *
 * 历史 bug：Dashboard 用 `item.cluster ?? '未分类'` 分组（4 条），Process 用
 * `i.cluster === '未分类'` 过滤（0 命中），加上一句静默 fallback `if (filtered.length === 0) filtered = all`
 * 把"未分类"撑成"全部 161 条"——计数错位 + 静默兜底掩盖 bug。
 *
 * 现在所有调用方都从这里取 UNCLUSTERED_BUCKET / groupByCluster / filterByClusterBucket，
 * 契约只在一处定义。
 */

/** 没有 cluster 字段的 item 归入这个虚拟桶名 */
export const UNCLUSTERED_BUCKET = '未分类'

/** Item-like 形状：只要有可选 cluster 就行 */
export interface HasCluster {
  cluster?: string
}

/** 按 cluster 字段分组；缺失字段的归入 UNCLUSTERED_BUCKET 桶 */
export function groupByCluster<T extends HasCluster>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = item.cluster ?? UNCLUSTERED_BUCKET
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return map
}

/**
 * 用桶名过滤：识别 UNCLUSTERED_BUCKET 为「cluster 字段为空」语义，
 * 其他名字走严格相等。
 *
 * ⚠️ 不要在调用处加 `if (filtered.length === 0) filtered = all` 兜底——
 * 那会把"空结果"伪装成"全部"，掩盖真问题。让空状态自然呈现。
 */
export function filterByClusterBucket<T extends HasCluster>(items: T[], bucket: string): T[] {
  if (bucket === UNCLUSTERED_BUCKET) return items.filter((i) => !i.cluster)
  return items.filter((i) => i.cluster === bucket)
}
