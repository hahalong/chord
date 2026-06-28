import type { StorageAdapter, Cluster } from '@chord/types'
import type { AIEngine } from './AIEngine.js'
import { nanoid } from '../utils/id.js'
import { rebindAndPersist } from '../services/ClusterUserIntentService.js'
import { classifyUnknownIntentsWithAI } from '../services/ItemService.js'
import { TFIDFEngine } from './TFIDFEngine.js'

const RECLUSTER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days
const RECLUSTER_NEW_ITEMS_THRESHOLD = 20
/**
 * 当存在 unclustered (item.cluster 字段空) 的 pending/kept item 时的最短重跑间隔。
 * 设计目的：用户保存 1 条新 item → 进 Dashboard → 触发 recluster → 看到分类
 * 失败/降级时（AI down）防止 shouldRecluster 一直返回 true 把 recluster spam 死，
 * 失败重试也得等满 cooldown。
 */
const UNCLUSTERED_COOLDOWN_MS = 5 * 60 * 1000  // 5 min
/**
 * 当上次 cluster 是 TFIDF fallback 结果时的最短重试间隔。
 * 比 unclustered cooldown 长（30 min）—— 因为 TFIDF 已经"看起来分了类"，没那么急
 * 但比 7 天短得多——TFIDF 残留产生「阿里云·报深」这种乱名 + 89 条 misc 兜底桶，
 * 用户体验差，要尽快被 AI 真正分类覆盖
 */
const TFIDF_FALLBACK_RETRY_MS = 30 * 60 * 1000  // 30 min

// 聚类算法版本号
// 每次算法行为有显著变化时 +1，旧 cluster 不匹配时强制重算
//   v1: 初始（停用词只硬编码，没全局域名停用集）
//   v2: 全局域名停用集 + 中文 bigram/trigram + buildClusterName 限制 2 段（CR-002/CR-009）
//   v3: cluster 名做 n-gram 重叠合并 + 去子串（CR-011）
//   v4: 扩充泛化范畴停用词（工具/产品/报告 等）（CR-012）
//   v5: 加 4-gram 分词 + cluster 名优先选最长 token（CR-014）
//   v6: 强制失效，确保 dev token cleanup + 切回 chord_bundled 的修复生效
//   v7: junk-drawer 修复——动态 k + 「其他」cluster + 低相似度兜底（CR-018）
//   v8: 递归子聚类——过大/「其他」cluster 自动再切；prompt 加强（CR-026）
//   v9: 切换到 L1 预定义大类（10 类 N 选 1 分类）（CR-028）
//       开放聚类准确率上限 ~20%，L1 分类准确率 69.3%（真实 166 条实测，temp 0）
//       cluster 名永远是 L1_CATEGORIES 里的 10 个之一，命名稳定 + 用户认知零成本
//       同时删除：递归子聚类、TF-IDF 命名拼接、cluster 数动态调整
//  v10: L1 prompt 优化——针对 baseline.json knownGaps 三个弱点（CR-029）
//       hardtech 0% → 期望 70%+：明确产业链研报归 hardtech 不归 invest
//       job 50% → 期望 80%+：Offer/求职关键词不管行业都归 job
//       misc 过用 → 期望 < 15%：严格限定「真正零散」的边界
export const CLUSTER_ALGO_VERSION = 10

export async function shouldRecluster(adapter: StorageAdapter): Promise<boolean> {
  const clusters = await adapter.getClusters()
  if (clusters.length === 0) return true

  // 算法版本失配 → 必须重算
  if (clusters.some((c) => (c.algoVersion ?? 0) < CLUSTER_ALGO_VERSION)) return true

  const lastUpdate = Math.max(...clusters.map((c) => c.updatedAt))
  const now = Date.now()

  // 7 天到期 → 必须重算
  if (now - lastUpdate > RECLUSTER_INTERVAL_MS) return true

  // ★ 触发条件：上次跑的是 TFIDF fallback（AI 之前失败了）且 ≥ 30 min
  // 不让 TFIDF 「阿里云·报深」类乱名 + 「其他」兜底桶永久卡死
  // 老数据没 algorithm 字段视作 'ai'（向后兼容）；新数据明确写入
  const lastUsedTfidf = clusters.some((c) => c.algorithm === 'tfidf')
  if (lastUsedTfidf && now - lastUpdate >= TFIDF_FALLBACK_RETRY_MS) return true

  const items = await adapter.getItems({ type: ['content'], status: ['pending', 'kept'] })

  // 触发条件 1：累积新增 ≥ 20 条
  const newItems = items.filter((i) => i.savedAt > lastUpdate)
  if (newItems.length >= RECLUSTER_NEW_ITEMS_THRESHOLD) return true

  // 触发条件 2：有 unclustered (cluster 字段空) item 且距上次 recluster ≥ 5 min
  // 不管是 1 条还是 100 条，下次 recluster 会一批处理（AI 调用 1 次解决所有）
  // 之前的设计要等 20 条新增或 7 天，期间用户看到「未分类」桶，体验差
  // cooldown 防止 AI 失败时把 recluster spam 死
  const unclusteredCount = items.filter((i) => !i.cluster).length
  if (unclusteredCount > 0 && now - lastUpdate >= UNCLUSTERED_COOLDOWN_MS) return true

  return false
}

export async function recluster(
  adapter: StorageAdapter,
  engine: AIEngine,
): Promise<Cluster[]> {
  const items = await adapter.getItems({ type: ['content'] })
  if (items.length < 5) return []

  const inputs = items.map((i) => ({
    id: i.id,
    title: i.title,
    domain: i.sourceDomain,
    userNote: i.userNote,
    excerpt: i.excerpt,
  }))

  // L1 分类：AI 把每条 item 归到 10 个预定义大类中的一个
  //
  // ★ 设计反转（之前是 CR-019 silent fallback 到 TFIDFEngine）：
  // AI 失败时直接抛错，让调用方写 chord_recluster_status.error 让 UI 提示用户配置不对。
  // 不再 silent fallback——TFIDF 产出 n-gram 片段名（「阿里云·报深」「89 条其他」）
  // 静默覆盖 AI 结果是用户陷阱（用户配错 AI key 不知道，看见乱名以为 Chord 坏了）。
  //
  // 唯一仍允许的 TFIDF 用法：调用方明确传入 TFIDFEngine 实例（如离线模式）
  let usedAlgorithm: 'ai' | 'tfidf' = engine instanceof TFIDFEngine ? 'tfidf' : 'ai'
  const results = await engine.cluster(inputs)

  // CR-028：不再做递归子聚类——L1 已经天然限制了 cluster 数量和命名
  // CR-026 的 subClusterOversized 已删

  const now = Date.now()

  // 第一遍：raw clusters（cluster 名来自 AI 返回的 L1 类别名）
  const rawClusters: Cluster[] = results.map((r) => {
    const clusterItems = items.filter((i) => r.itemIds.includes(i.id))
    const processedCount = clusterItems.filter(
      (i) => i.status === 'used' || i.status === 'released',
    ).length

    return {
      id: nanoid(),
      name: r.name,
      itemIds: r.itemIds,
      keywords: r.keywords,
      processedCount,
      totalCount: r.itemIds.length,
      updatedAt: now,
      algoVersion: CLUSTER_ALGO_VERSION,
      algorithm: usedAlgorithm,
    }
  })

  // v1.1.1 · 关闭意图拆分 · 一个 cluster 一个泡泡（简化视觉）
  //   旧逻辑：aspire 占比 > 40% 且 aspire 数 ≥ 5 → 拆「[原名] · 渴望」独立 cluster
  //   废弃理由：用户反馈"为什么会有两个相同的分类"——两个泡泡共存导致认知负担, aspire 关键词又偏宽松误判多
  //   item.saveIntent 字段保留（hover card / Profile §2 数字反差 / DramaticInsight 仍在用）
  //   只是不再产出独立 cluster 泡泡
  const clusters: Cluster[] = rawClusters

  await adapter.putClusters(clusters)

  // 更新每条 item 的 cluster 字段
  for (const cluster of clusters) {
    for (const itemId of cluster.itemIds) {
      const item = await adapter.getItem(itemId)
      if (item && item.cluster !== cluster.name) {
        await adapter.putItem({ ...item, cluster: cluster.name })
      }
    }
  }

  await rebindAndPersist(adapter, clusters)

  classifyUnknownIntentsWithAI(adapter, engine).catch(() => {})

  return clusters
}

// 为单条 item 生成问句（在每次唤醒时调用）
export async function generateQuestion(
  engine: AIEngine,
  item: { title: string; sourceDomain: string; savedAt: number; wakeCount: number; userNote?: string; cluster?: string },
): Promise<string> {
  return engine.generateQuestion({
    title: item.title,
    domain: item.sourceDomain,
    savedAt: item.savedAt,
    wakeCount: item.wakeCount,
    userNote: item.userNote,
    cluster: item.cluster,
  })
}
