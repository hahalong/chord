/**
 * Item status.
 *
 * 'used' 是历史值（v1 三向决策时代的「用过了」状态）。v2 之后用户决策只剩二向（留下来 / 放手），
 * 'used' 不再被任何新代码写入；SW 启动时 Migration.migrateUsedToKept() 会把所有老 'used' 数据
 * 迁移到 'kept' 并标 migratedFromUsed=true。类型保留 'used' 是为了向后兼容旧 storage——
 * 等所有 UI 改造完成 + 迁移落地一段时间后会在后续版本里彻底移除。
 */
export type ItemStatus = 'pending' | 'kept' | 'used' | 'released'
export type ItemType = 'content' | 'tool'

/**
 * 放手原因（v2 二向决策新增）。
 * 用户点「放手」时通过 ReleaseReasonDialog 选一个，写入 item.releaseReason。
 * 6 个原因 + 用户自定义文本。详见 Chord_二向决策_实施方案.md §2。
 *
 * 注意：'used' 在这里是「我已经用过它了」的语义（放手原因），区别于 ItemStatus='used'
 * （历史状态）——二者同名但属不同维度，不冲突。
 */
export type ReleaseReason =
  | 'used'           // 已经用过了 ✓
  | 'not_interested' // 不感兴趣了 💭
  | 'misjudged'      // 当时存错了 🤷
  | 'replaced'       // 找到更好的了 ✨
  | 'no_time'        // 没时间看了 ⏰
  | 'custom'         // ＋ 自己说 ✏
export type ItemSource =
  | 'bookmark'       // 首次导入的历史书签
  | 'bookmark_auto'  // 用户新增书签时自动监听
  | 'saved'          // 用户主动点击插件「保存到书房」
  | 'platform_auto'  // 第三方平台保存动作监听（P1）
  | 'weread'         // 微信读书导入（P1）

// 保存意图：这条内容当时为什么被保存
// rule = 规则引擎判定；ai = AI 兜底判定；unknown = 都判不出来；user = 用户手动纠正
export type SaveIntent = 'tool' | 'learn' | 'aspire' | 'inspire' | 'track'
export type SaveIntentSource = 'rule' | 'ai' | 'unknown' | 'user'

/**
 * v2 多标签信号（Sprint B.1）
 * 一条 item 可同时含多个意图（如「我是如何学 React 的」同时是 aspire + learn）
 * top-N 按 confidence 降序，调用方默认用 [0]，需要细分析时用 [0..N-1]
 */
export interface IntentSignal {
  intent: SaveIntent
  confidence: number    // 0-1
  source: SaveIntentSource
}

export interface Item {
  id: string
  url: string
  title: string
  favicon: string
  savedAt: number              // 用户原始收藏时间（书签 dateAdded，或主动保存的 Date.now()）
  sourceDomain: string
  type: ItemType
  status: ItemStatus
  processedAt?: number
  wakeCount: number
  userNote?: string      // 保存时的备注
  privateNote?: string   // 私人注释（永远不上报内容）
  usageChip?: string     // 「派上用场了？」选项
  usageCustom?: string   // 自定义填写
  cluster?: string       // AI 聚类主题
  aiQuestion?: string    // AI 生成的回响问句
  excerpt?: string       // 保存时提取的页面摘要（用于聚类，限 500 字）
  source: ItemSource

  // ─── 洞察模型字段（v1.1 Batch 2 新增）──────────────────────
  // firstSeenAt = Chord 看到此 item 的时间。导入老书签时 = Date.now()，主动保存也 = Date.now()。
  // 用于 EngagementService 计算决策速度，避免「3 年前 Chrome 书签今天才处理」拿不到速度分。
  firstSeenAt?: number
  saveIntent?: SaveIntent                  // ⚠️ DEPRECATED（v2 后保留兼容）：用 saveIntents[0]?.intent
  saveIntentSource?: SaveIntentSource      // ⚠️ DEPRECATED（v2 后保留兼容）：用 saveIntents[0]?.source
  /**
   * v2 多标签意图（Sprint B.1）。按 confidence 降序排列，通常 top-2。
   * 一条 item 可同时是 tool + aspire（如「我是如何用 React 的」）。
   * 兼容：老代码读 saveIntent，新代码读 saveIntents[0]。
   * 数据迁移由 sw.ts migrateSaveIntentsV2 在启动时做一次。
   */
  saveIntents?: IntentSignal[]
  engagementScore?: number                 // 0-100，决策/笔记/速度的综合参与度，processItem 后实时更新

  // ─── 主动出现系统字段（Phase 1+ 新增）──────────────────────
  /**
   * 用户最近一次访问该 URL 的时间戳。
   * 来源：chrome.history（Phase 3 通过 onVisited listener 写入）。
   * Phase 1 只读、用于 EchoIndex 计算 freshness；Phase 3 才真正实时更新。
   */
  lastVisitedAt?: number
  /**
   * Echo Moment 上次触发的时间戳（14 天冷却用）
   */
  echoMomentTriggeredAt?: number
  /**
   * Echo Moment 上次触发时的 visitCount 快照
   * 用于判定本次 visit 是否跨越新阈值
   */
  echoMomentLastVisitCount?: number

  // ─── 二向决策字段（v2 新增，见 Chord_二向决策_实施方案.md）──────────
  releaseReason?: ReleaseReason             // 放手原因（status === 'released' 才有）
  releaseReasonCustom?: string              // 自由文本（releaseReason === 'custom' 时）
  releaseReasonKeywords?: string[]          // v1 简单分词提取，喂给 AnalyticsService 聚合（v2 加 embedding）
  migratedFromUsed?: boolean                // 老 status='used' 一次性迁移过来的标记，下次放手时预填 reason='used'
}

export interface ItemFilter {
  status?: ItemStatus[]
  type?: ItemType[]
  cluster?: string
  since?: number
  limit?: number
  orderBy?: 'savedAt' | 'wakeCount' | 'processedAt'
  orderDir?: 'asc' | 'desc'
}

export interface SaveItemInput {
  url: string
  title: string
  favicon?: string
  source: ItemSource
  type?: ItemType
  userNote?: string
  excerpt?: string
  savedAt?: number       // 可选覆盖：导入历史书签时传入原始 dateAdded
  firstSeenAt?: number   // 可选覆盖：导入路径传 Date.now()。不传则在 saveItem 内默认 Date.now()
}

// P0-4 · v2 二向决策 · 'used' 已撤销
export type Decision = 'keep' | 'release'
