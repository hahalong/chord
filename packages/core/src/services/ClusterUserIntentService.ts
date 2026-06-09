// ClusterUserIntent 重绑：解决 recluster 后 cluster label 漂移导致 userIntent 丢失的问题
//
// 场景：用户在「独立开发」气泡里声明了 intent='project'。下次 recluster 后，
// 同一批 item 可能被 AI 重命名成「独立开发者」「副业」。如果按字面 label 匹配会丢失。
//
// 兜底策略：
//   1. 字面 label 匹配（O(1) 直接）
//   2. 失败时按 topKeywords 集合的 Jaccard 相似度，最大 ≥0.5 视为同主题
//   3. 仍失败则该 userIntent 暂时孤儿（保留在表里，等下次 recluster 再尝试）

import type { ClusterUserIntent, Cluster, StorageAdapter } from '@chord/types'

/** Jaccard 相似度 = 交集 / 并集 */
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersect = 0
  for (const x of setA) if (setB.has(x)) intersect++
  const union = setA.size + setB.size - intersect
  return union === 0 ? 0 : intersect / union
}

const REBIND_THRESHOLD = 0.5

/**
 * 把已存的 userIntents 重新绑定到当前 clusters 的 label 上。
 * 返回更新后的 intents 数组（label 字段可能被替换为新 cluster 的 label）。
 */
export function rebindUserIntents(
  intents: ClusterUserIntent[],
  clusters: Cluster[],
): ClusterUserIntent[] {
  return intents.map((intent) => {
    // 1. 字面匹配
    const direct = clusters.find((c) => c.name === intent.label)
    if (direct) return intent

    // 2. Jaccard 兜底
    let best: { cluster: Cluster; score: number } | null = null
    for (const c of clusters) {
      const score = jaccard(intent.topKeywords, c.keywords ?? [])
      if (score >= REBIND_THRESHOLD && (best === null || score > best.score)) {
        best = { cluster: c, score }
      }
    }
    if (best) {
      return { ...intent, label: best.cluster.name }
    }

    // 3. 孤儿：保持原样，下次 recluster 再试
    return intent
  })
}

/** 用 label 查 userIntent；约定 cluster.name 此时已经经过 rebind。 */
export function findIntentByLabel(
  intents: ClusterUserIntent[],
  label: string,
): ClusterUserIntent | null {
  return intents.find((i) => i.label === label) ?? null
}

/**
 * 写入/更新一条 userIntent，并同步重绑全部到最新 clusters。
 * 调用者：Terrain 气泡点击 → 选 chip → 这里。
 */
export async function setUserIntent(
  adapter: StorageAdapter,
  args: { label: string; topKeywords: string[]; intent: ClusterUserIntent['intent'] },
): Promise<void> {
  const all = await adapter.getClusterUserIntents()
  const existing = all.findIndex((i) => i.label === args.label)
  const next: ClusterUserIntent = {
    label: args.label,
    topKeywords: args.topKeywords,
    intent: args.intent,
    setAt: Date.now(),
  }
  if (existing >= 0) {
    all[existing] = next
  } else {
    all.push(next)
  }
  await adapter.putClusterUserIntents(all)
}

/**
 * recluster 完成后调用：把 userIntents 按新 clusters 重绑并持久化。
 */
export async function rebindAndPersist(
  adapter: StorageAdapter,
  clusters: Cluster[],
): Promise<void> {
  const intents = await adapter.getClusterUserIntents()
  if (intents.length === 0) return
  const rebound = rebindUserIntents(intents, clusters)
  await adapter.putClusterUserIntents(rebound)
}
