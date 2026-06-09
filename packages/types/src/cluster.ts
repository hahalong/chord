export interface Cluster {
  id: string
  name: string
  itemIds: string[]
  keywords: string[]
  processedCount: number
  totalCount: number
  updatedAt: number
  algoVersion?: number   // 聚类算法版本号；不匹配时强制重算，避免老 cluster 残留（如「weixin·qq·mp」之类的域名片段名）
  /**
   * 这批 cluster 来自哪个 engine：
   *   - 'ai'    = AI L1 分类（CR-028 起的标准路径），cluster 名是 L1_CATEGORIES 里的 10 个之一
   *   - 'tfidf' = TFIDFEngine 兜底（AI 失败时 CR-019 fallback 路径），cluster 名是 n-gram 片段
   *
   * 用途：shouldRecluster 看到 'tfidf' 时强制重试，避免 TFIDF 残留永久卡死分类。
   * 老数据没这个字段 → 视作 'ai'（向后兼容；旧数据要么是 v9+ 的 L1 名，要么算法版本失配会被先一步触发重算）。
   */
  algorithm?: 'ai' | 'tfidf'
}

export interface ClusterInput {
  id: string
  title: string
  domain: string
  userNote?: string   // 只传摘要，不传 privateNote
  excerpt?: string    // 页面摘要（保存时提取，用于提升聚类质量）
}

export interface ClusterResult {
  name: string
  keywords: string[]
  itemIds: string[]
}

// ─── 用户行动意图（Cluster.userIntent）─────────────────────────────────
// 用户在 Terrain 实线气泡里主动声明的「我想用这个主题做什么」。
// 与 Item.saveIntent 严格分开：
//   - Item.saveIntent  = AI/规则推断的保存动机（历史 / 被动 / 内容维度）
//   - Cluster.userIntent = 用户主动声明的行动方向（前瞻 / 主动 / 行动维度）

export type UserActionIntent = 'writing' | 'project' | 'share' | 'learn' | 'enjoy'

export interface ClusterUserIntent {
  // 主 key：当时绑定的 cluster label
  label: string
  // 兜底 key：top keywords 集合。recluster 后 label 漂移时用 Jaccard 相似度重新绑定（≥0.5 视为同一主题）
  topKeywords: string[]
  intent: UserActionIntent
  setAt: number
}
