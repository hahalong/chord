/**
 * Mock 数据工厂 —— 用高层参数反推 chord_items / chord_clusters / chord_settings
 *
 * 不手抠每个 itemId / savedAt——给参数就能生成出能跑通 IdentityService / Profile 的完整数据。
 */

import type { Item, UserSettings, Cluster } from '@chord/types'
import { DEFAULT_SETTINGS } from '@chord/types'

type Status = Item['status']

const DAY = 86_400_000

export interface MockUserSpec {
  /** case ID，用于稳定生成 itemId（preview/case-id 切换时数据可复现）*/
  caseId: string
  /** 用例可读名 */
  name: string
  /** 主题分布——cluster 名 → 该主题的 item 数 */
  clusterDistribution: { name: string; count: number }[]
  /** 整体处理率（0-1）—— 用于决定有多少 item.status='kept' 或 'released'  */
  processRate?: number  // 默认 0.5
  /** release 占处理总数的比例（0-1）—— 剩下的是 kept */
  releaseShare?: number  // 默认 0.3
  /** items 跨度（最老 item 距今天数 / 最新 item 距今天数）*/
  ageRange?: { oldestDaysAgo: number; newestDaysAgo: number }
  /** chip 分布——每条 item 有 X% 概率打这个 chip */
  chipDistribution?: {
    used?: number       // "实际用到了" 占比
    inspire?: number    // "启发思路" 占比
    oneRead?: number    // "仅此一读，够了" 占比
  }
  /** note 比例 */
  noteRate?: number
  /** visitCount 倍数 —— 用来生成 chord_history mock，默认每条 ~1 visit */
  visitMultiplier?: number
  /** 近 30 天的爆发倍率（实现 EXPLORER/DEEPENER 等场景）*/
  recentBurst?: {
    /** recent 30 天 item 数（覆盖 ageRange 计算）*/
    recentCount: number
    /** recent 30 天的新 cluster 数（之前 60-90 天没出现过的）*/
    brandNewClusters: number
    /** 新 cluster 的名字前缀 */
    brandNewPrefix?: string
  }
  /** DORMANT 模拟：最近 N 天完全没保存 */
  idleDays?: number
  /** SETTLER 模拟：recent 30 量降到月均 X 倍 */
  declineFactor?: number
  /**
   * RETURNER 模拟：强制让 N 条老 item（savedAt > 90 天前）在最近 30 天内被处理为 'released'
   * factory 默认 processedAt 均匀随机分布，落到最近 30 天的概率太低
   */
  recentReleaseCount?: number
}

/** 生成 chord_items / chord_clusters / chord_settings / chord_history 四份数据 */
export function generateMockData(spec: MockUserSpec): {
  chord_items: Item[]
  chord_clusters: Cluster[]
  chord_settings: UserSettings
  chord_history: Record<string, number>
} {
  const now = Date.now()
  const items: Item[] = []
  const visitCounts: Record<string, number> = {}

  // 稳定的 seed（基于 caseId）
  let seq = 0
  function nextId(): string { return `${spec.caseId}-${(seq++).toString(36)}` }
  function rand(): number {
    // 简单线性同余
    seq++
    const x = Math.sin(seq * 9999 + spec.caseId.length) * 10000
    return x - Math.floor(x)
  }

  const oldestDaysAgo = spec.ageRange?.oldestDaysAgo ?? 90
  const newestDaysAgo = spec.ageRange?.newestDaysAgo ?? 2
  const processRate = spec.processRate ?? 0.5
  const releaseShare = spec.releaseShare ?? 0.3
  const chipDist = spec.chipDistribution ?? {}
  const noteRate = spec.noteRate ?? 0
  const visitMul = spec.visitMultiplier ?? 1

  // 生成主题里的 items
  for (const cluster of spec.clusterDistribution) {
    for (let i = 0; i < cluster.count; i++) {
      const id = nextId()
      // 时间分布：均匀分散在 [oldestDaysAgo, newestDaysAgo]
      const daysAgo = newestDaysAgo + rand() * (oldestDaysAgo - newestDaysAgo)
      const savedAt = now - daysAgo * DAY
      // status
      const isProcessed = rand() < processRate
      let status: Status = 'pending'
      let processedAt: number | undefined
      if (isProcessed) {
        const isReleased = rand() < releaseShare
        status = isReleased ? 'released' : 'kept'
        processedAt = savedAt + rand() * (now - savedAt)
      }
      // chip
      let usageChip: string | undefined
      const chipRoll = rand()
      const usedCut = chipDist.used ?? 0
      const inspireCut = usedCut + (chipDist.inspire ?? 0)
      const oneReadCut = inspireCut + (chipDist.oneRead ?? 0)
      if (chipRoll < usedCut) usageChip = '实际用到了'
      else if (chipRoll < inspireCut) usageChip = '启发思路'
      else if (chipRoll < oneReadCut) usageChip = '仅此一读，够了'
      // note
      const privateNote = rand() < noteRate ? '示例笔记 ' + id.slice(-4) : undefined

      const item: Item = {
        id,
        url: `https://example.com/${cluster.name}/${i}`,
        title: `${cluster.name} 文章 ${i + 1}`,
        favicon: '',
        savedAt,
        firstSeenAt: savedAt,
        sourceDomain: 'example.com',
        type: 'content',
        status,
        processedAt,
        wakeCount: 0,
        userNote: undefined,
        privateNote,
        usageChip,
        cluster: cluster.name,
        source: 'bookmark',
      }
      items.push(item)

      // visitCount
      visitCounts[id] = Math.round(rand() * visitMul * 3)
    }
  }

  // recentBurst —— 添加最近 30 天的爆发
  if (spec.recentBurst) {
    const prefix = spec.recentBurst.brandNewPrefix ?? '新主题'
    const burstClusters: string[] = []
    if (spec.recentBurst.brandNewClusters > 0) {
      // brandNew > 0 → 创建新主题
      for (let c = 0; c < spec.recentBurst.brandNewClusters; c++) {
        burstClusters.push(`${prefix}${c + 1}`)
      }
    } else if (spec.recentBurst.recentCount > 0 && spec.clusterDistribution.length > 0) {
      // v3.1.27 · brandNew=0 + recentCount>0 → 注入已有 top 3 cluster（DEEPENER 场景：保存爆发但不开新方向）
      const sortedExisting = [...spec.clusterDistribution].sort((a, b) => b.count - a.count)
      for (const c of sortedExisting.slice(0, 3)) burstClusters.push(c.name)
    }
    const perCluster = burstClusters.length > 0
      ? Math.floor(spec.recentBurst.recentCount / burstClusters.length)
      : 0
    for (const clusterName of burstClusters) {
      for (let i = 0; i < perCluster; i++) {
        const id = nextId()
        const savedAt = now - (2 + rand() * 28) * DAY
        // v3.1.27 · burst items 也走 processRate/releaseShare，避免一直 pending 让 active 失控
        const isProcessed = rand() < processRate
        let status: Status = 'pending'
        let processedAt: number | undefined
        if (isProcessed) {
          const isReleased = rand() < releaseShare
          status = isReleased ? 'released' : 'kept'
          processedAt = savedAt + rand() * (now - savedAt)
        }
        items.push({
          id,
          url: `https://example.com/${clusterName}/${i}`,
          title: `${clusterName} 文章 ${i + 1}`,
          favicon: '',
          savedAt,
          firstSeenAt: savedAt,
          sourceDomain: 'example.com',
          type: 'content',
          status,
          processedAt,
          wakeCount: 0,
          cluster: clusterName,
          source: 'bookmark',
        })
        visitCounts[id] = Math.round(rand() * visitMul * 2)
      }
    }
  }

  // DORMANT 模拟：清空最近 idleDays 天的所有 item
  if (spec.idleDays !== undefined) {
    const cutoff = now - spec.idleDays * DAY
    for (const item of items) {
      if (item.savedAt > cutoff) {
        // 把它推回 idleDays + 1 天前
        item.savedAt = cutoff - rand() * DAY * 10
      }
    }
  }

  // SETTLER 模拟：减少最近 30 天的 item 数到 declineFactor 比例
  if (spec.declineFactor !== undefined) {
    const recent30 = items.filter((i) => i.savedAt > now - 30 * DAY)
    const target = Math.floor(recent30.length * spec.declineFactor)
    const toRemove = recent30.length - target
    for (let i = 0; i < toRemove && i < recent30.length; i++) {
      const idx = items.indexOf(recent30[i]!)
      if (idx >= 0) items.splice(idx, 1)
    }
  }

  // v3.1.18 · RETURNER 模拟：强制 N 条老 item（savedAt > 90 天前）在最近 30 天内 release
  // factory 默认 processedAt 均匀随机，落到 recent30 概率太低 → 显式注入
  if (spec.recentReleaseCount !== undefined && spec.recentReleaseCount > 0) {
    const oldOnes = items.filter((i) =>
      i.savedAt < now - 90 * DAY && i.status === 'pending',
    )
    const targetCount = Math.min(spec.recentReleaseCount, oldOnes.length)
    for (let i = 0; i < targetCount; i++) {
      const it = oldOnes[i]!
      it.status = 'released'
      it.processedAt = now - (1 + Math.floor(rand() * 28)) * DAY  // 1-29 天前处理
    }
  }

  // 构造 chord_clusters（实际存储格式是 Cluster[]）
  const allClusterNames = new Set<string>()
  for (const it of items) {
    if (it.cluster) allClusterNames.add(it.cluster)
  }
  const chord_clusters: Cluster[] = [...allClusterNames].map((name) => {
    const clusterItems = items.filter((it) => it.cluster === name)
    return {
      id: `cluster-${spec.caseId}-${name}`,
      name,
      itemIds: clusterItems.map((it) => it.id),
      keywords: [name],
      processedCount: clusterItems.filter((it) => it.status !== 'pending').length,
      totalCount: clusterItems.length,
      updatedAt: now,
      algoVersion: 10,
      algorithm: 'ai',
    }
  })

  return {
    chord_items: items,
    chord_clusters,
    chord_settings: DEFAULT_SETTINGS,
    chord_history: visitCounts,
  }
}
