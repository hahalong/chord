export type FindingType =
  | 'ai_headline'         // AI 生成的反直觉头条洞察（CR-030）
  // v3.1.29 · 地形系统 v2 · 共享 TerrainClassifier 算法
  | 'terrain_forest'      // 真实热情之林（reallyUsedRate ≥ 50% + items ≥ 5）
  | 'terrain_swamp'       // 焦虑沼泽（reallyUsedRate < 30% + items ≥ 10）· v3.1.29 阈值 B
  | 'terrain_ember'       // 新冒火苗（recent30 ≥ 3 + 1.5× prev30-90）
  | 'terrain_sleep'       // 沉睡之地（lastSaveDays > 90 + items ≥ 5）
  // @deprecated v3.1.29 起不再 emit（用 terrain_* 替代）· 保留 type 以防别处引用
  | 'illusion_anxiety'    // @deprecated 用 terrain_swamp
  | 'anxiety_panorama'    // @deprecated 多个 illusion_anxiety 合并
  | 'real_passion'        // @deprecated 用 terrain_forest
  | 'long_wait'           // @deprecated 用 terrain_sleep（v3.1.28-2 已 fallback 到 sleep 槽）
  | 'momentum_rising'     // @deprecated 用 terrain_ember
  | 'momentum_falling'    // @deprecated 用 terrain_sleep
  | 'hidden_strength'     // @deprecated 用 terrain_forest（被低估真兴趣 score 用 visit 补强）
  | 'frequent_topic'      // @deprecated 用 terrain_forest
  // 用户级别 findings（不属于地形系统）
  | 'growing_honest'      // 本月放手数环比上月增加
  | 'consumption_style'   // 用户级标签（executor/thinker/curator/hoarder/slow_reader/minimalist/balanced）

// 用户内容消费方式：基于全局 chip 分布 + noteRate + avgDecisionLag 推断的「你是哪种类型的人」
// v3.1 新增 minimalist：少而稳的画像（items <= 50）
// v3.1.5 新增 balanced：items > 50 但所有其他身份都不踩阈值的稳态用户（10-25% 占比，避免归 NEWCOMER）
export type ConsumptionStyle = 'executor' | 'thinker' | 'curator' | 'hoarder' | 'slow_reader' | 'minimalist' | 'balanced'

// 兴趣生命状态：基于时间序列描述每个 cluster 当前的"势能"
export type InterestState = 'emerging' | 'active' | 'fading' | 'dormant'

export interface Finding {
  type: FindingType
  cluster?: string        // 相关主题名
  claim: string           // 主标题
  evidence: string        // 证据说明（斜体衬线体展示）
  accentColor: string     // 左侧色条颜色
  eyebrow: string         // 小标签文字
  metricLabel: string
  metricValue: number     // 0-1，用于进度条
  metricText: string      // 如 '18% · 28 条'
  ctaLabel?: string       // 行动 CTA 文字
  ctaTarget?: string      // 跳转目标（hash）

  // CR-030 扩展：
  // anxiety_panorama 用：多个 cluster 的对比数据
  panoramaRows?: { cluster: string; total: number; processed: number; visits: number }[]
  // ai_headline 用：AI 输出的可选补充段落
  aiNarrative?: string[]
  // 通用：用于反馈回路的稳定 hash（同一条洞察多次刷新仍能识别）
  feedbackKey?: string
}

export interface ProfileBanner {
  totalItems: number
  processedRate: number   // 处理完成度 0-1
  realPassionRate: number // 真实热情率 0-1
  releasedThisMonth: number
  dataBasedOn: string     // 'X 条收藏、M% 的处理率、P 次放手'
}

export interface JourneyMoment {
  type: 'sweet' | 'tear'
  timestamp: number
  itemId?: string
  cluster?: string
  savedDaysAgo?: number
  userNote?: string       // 用户原话（仅「泪」类型中用于引用）
  description: string     // AI 生成的旁白文字（≤30字）
}
