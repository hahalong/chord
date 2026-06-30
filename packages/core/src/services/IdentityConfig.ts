/**
 * IdentityConfig · 所有身份判定阈值集中化（v3.1.27）
 *
 * 设计原则：
 *   - 任何身份判定阈值都不能硬编码在算法里，必须从这里读
 *   - 调阈值只在一处改，避免散在 5 个 service 里
 *   - 每个阈值带注释解释"为什么是这个数"
 *   - 通过 audit (pnpm test -- audit-cli) 验证调整后所有 case 触发是否如预期
 *
 * 用法：
 *   import { IDENTITY_CONFIG } from './IdentityConfig.js'
 *   if (items.length <= IDENTITY_CONFIG.MINIMALIST_MAX_ACTIVE) { ... }
 */

export const IDENTITY_CONFIG = {
  // ─── Consumption · MINIMALIST（极简者）─────────────
  /** 严格极简：active items ≤ 15（路径 A：真的少）*/
  MINIMALIST_STRICT_MAX_ACTIVE: 15,
  /** 中量极简："精挑型"：active 在 [16, 49] 区间且真用过率高（路径 B：中量但都在用）*/
  MINIMALIST_PRAGMATIC_MIN_ACTIVE: 16,
  MINIMALIST_PRAGMATIC_MAX_ACTIVE: 49,
  /** 中量极简的真用过率阈值：≥ 60% 算"都在用"（v3.1.27 用户定，可跑数据调）*/
  MINIMALIST_PRAGMATIC_MIN_REALLY_USED_RATE: 0.6,

  // ─── Consumption · HOARDER（信息囤积者）──────────────
  /** 大量囤积：active ≥ 50 + processRate < 20%（原 v3.1 规则保留）*/
  HOARDER_HIGH_VOLUME_MIN_ACTIVE: 50,
  HOARDER_HIGH_VOLUME_MAX_PROCESS_RATE: 0.2,
  /** 中量囤积：active 20-49 + 真用过率 < 60% + processRate < 50%（防"已处理但未必真打开"的 kept 用户）*/
  HOARDER_MID_VOLUME_MIN_ACTIVE: 20,
  HOARDER_MID_VOLUME_MAX_ACTIVE: 49,
  HOARDER_MID_VOLUME_MAX_REALLY_USED_RATE: 0.6,
  HOARDER_MID_VOLUME_MAX_PROCESS_RATE: 0.5,

  // ─── Consumption · chip-based ──────────────────────
  /** chip-based 身份至少需要 N 条 item 有 chip 才进判定 */
  CHIP_BASED_MIN_TOTAL: 5,
  /** EXECUTOR: 标'实际用到了'比例 > 40% */
  EXECUTOR_USED_RATIO: 0.4,
  /** THINKER: 标'启发思路'比例 > 35% AND 私注比例 > 20% */
  THINKER_INSPIRE_RATIO: 0.35,
  THINKER_NOTE_RATE: 0.2,
  /** CURATOR: processRate > 50% AND 标'仅此一读'比例 > 40% */
  CURATOR_MIN_PROCESS_RATE: 0.5,
  CURATOR_ONEREAD_RATIO: 0.4,

  // ─── Consumption · SLOW_READER ─────────────────────
  /** 平均决策延迟 > 60 天 + processRate > 30% */
  SLOW_READER_MIN_LAG_DAYS: 60,
  SLOW_READER_MIN_PROCESS_RATE: 0.3,

  // ─── 真用过率 · 用于 MINIMALIST/HOARDER 中量分流 ─────
  /**
   * "真用过"定义（OR 关系）：
   *   ① usageChip === '实际用到了'（用户主动标记，无时间限制）
   *   ② visitCount > 0（chrome.history 默认 90 天窗口——自带时间过滤）
   *   ③ lastVisitedAt 在 RECENT_USE_WINDOW_DAYS 内（同步自 history）
   *
   * v3.1.27 用户指令：要加时间限制——"很久很久之前用的"不算极简
   *   ② 已经是 90 天窗口（chrome.history API 行为）
   *   ③ 用 RECENT_USE_WINDOW_DAYS 控制
   *   ① 不加时间限制——chip 是用户语义判断，反映明确意图
   */
  RECENT_USE_WINDOW_DAYS: 90,

  // ─── Mindset · 通用 ─────────────────────────────────
  /** mindset 算法需要的 item 总数下限（DORMANT/SETTLER/EXPLORER/DEEPENER 都用）*/
  MINDSET_MIN_TOTAL_ITEMS: 20,

  // ─── Mindset · DORMANT（沉睡者）──────────────────────
  /** 最近一条 item 距今 > N 天算"已停止活动" */
  DORMANT_MIN_IDLE_DAYS: 30,
  /** 历史月均保存 ≥ N（避免低活跃用户误判）*/
  DORMANT_MIN_MONTHLY_AVG: 5,
  /** 分支 B「持续屯但不开」· 老 item（>90 天前 saved）≥ N */
  DORMANT_B_MIN_OLD_ITEMS: 30,
  /** 分支 B · 老 item 处理率 < N（几乎不打开 = 蛰伏的另一种形态） */
  DORMANT_B_MAX_OLD_PROCESS_RATE: 0.05,

  // ─── Mindset · EXPLORER（探索者）─────────────────────
  /** 近 30 天新冒头 cluster 数（之前 60 天没出现）*/
  EXPLORER_MIN_BRAND_NEW_CLUSTERS: 2,
  /** 近 30 天月均 ≥ 历史月均 × N（"涌现"信号）*/
  EXPLORER_MIN_RECENT_RATIO: 1.3,
  /** Jaccard < N（新方向跟旧方向重合度低 = 真探索）*/
  EXPLORER_MAX_JACCARD: 0.5,

  // ─── Mindset · SEEKER（求索者）──────────────────────
  /** 近 30 天 top cluster 占比 ≥ N（被一个方向抓住）*/
  SEEKER_MIN_TOP_SHARE: 0.4,
  /** 近 30 天 item 总数 ≥ N（避免数据稀少时误判）*/
  SEEKER_MIN_RECENT_COUNT: 5,

  // ─── Mindset · RETURNER（回归者）────────────────────
  /** 近 30 天处理的"老 item"（>= 90 天前 saved）数 ≥ N */
  RETURNER_MIN_OLD_PROCESSED: 5,
  /** 老 item 的"近期处理率" > N */
  RETURNER_MIN_OLD_PROCESS_RATE: 0.12,
  /** 近 30 天 release 数 ≥ N（放手是 RETURNER 的核心动作）*/
  RETURNER_MIN_RECENT_RELEASES: 5,

  // ─── Mindset · DEEPENER（深化者）────────────────────
  /** 近 30 天保存量 ≥ 历史月均 × N（爆发式深耕）*/
  DEEPENER_MIN_RECENT_RATIO: 1.3,
  /** breadth: 近 30 天涉及 cluster 数 ≥ N */
  DEEPENER_MIN_BREADTH: 3,
  /** 近 30 天 brandNew cluster ≤ N（不开新方向，只加深旧的）
   *  v3.1.28-1 · 0 → 1：允许 1 个新主题冒头但主体仍是深化（避免边缘情况翻车）
   *  真实场景：用户 90 天有 10 个老主题持续保存，最近多冒 1 个 → 仍判 DEEPENER，不算 EXPLORER */
  DEEPENER_MAX_BRAND_NEW: 1,

  // ─── Mindset · SETTLER（沉淀者）─────────────────────
  /** 近 30 天保存量 < 历史月均 × N（进入安静）*/
  SETTLER_MAX_RECENT_RATIO: 0.6,

  // ─── Radius · 数据窗口 ──────────────────────────────
  /** radius 看的窗口（天）*/
  RADIUS_WINDOW_DAYS: 90,
  /** 窗口内 item 数 < N 时 radius 不输出 */
  RADIUS_MIN_RECENT_ITEMS: 5,

  // ─── Radius · SPECIALIST（专精派）───────────────────
  SPECIALIST_MIN_TOP1_SHARE: 0.4,
  SPECIALIST_MIN_TOP3_SHARE: 0.7,
  // v3.1.31 · 删 SPECIALIST_MAX_CLUSTER_COUNT 硬上限
  //   背景：用户 87 条 / 9 cluster · top1=51% + top3=70% 完全是专精形态
  //         但卡在 clusterCount<8 → 落到"还看不清"
  //   理由：top1>40% AND top3>70% 已经定义"高度集中"——70% 注意力在前 3 类，
  //         即使有 20 个长尾 cluster 也是边角好奇，不影响主线判断
  //   原值 SPECIALIST_MAX_CLUSTER_COUNT: 8 已移除

  // ─── Radius · GENERALIST（广博派）───────────────────
  GENERALIST_MAX_TOP1_SHARE: 0.25,
  GENERALIST_MIN_CLUSTER_COUNT: 10,
  GENERALIST_MIN_ENTROPY: 0.85,
  // v3.1.28 · 长尾广博：cluster 多但分布有双峰长尾（top1 26-40%）
  //   原算法 gap：top1=32% + entropy=0.83 + 11 cluster → 既不专精也不广博，落到"还看不清"
  //   实际形态是「双峰 + 长尾」（如 AI 32% + 投资 24% + 9 个辅助主题）
  //   v3.1.28-1 · 11 → 9：cluster 数会因 recluster 在 10-12 之间波动，11 太严
  //   现在 ≥9 触发，跟严格 GENERALIST 的 cluster > 10 一起覆盖整个 9+ 区间
  // v3.1.32 · GENERALIST_LONGTAIL_MIN_CLUSTERS: 9 → 8
  //   背景: 用户 CWS 装上后报"半径还看不清" · 实测数据 8 cluster + top1=37.1%
  //         + top3=74.3% + entropy=0.833 · 真正是广博派但 clusterCount 差 1
  //   判定: 跟 SPECIALIST 不冲突 (SPECIALIST 仍要 top1 > 40%, 互斥)
  // v0.1.4 · 8 → 7
  //   背景: 用户实测 7 cluster + top1=38.1% + top3=80% + entNorm=0.78 仍卡"看不清"
  //         典型双峰长尾 (AI 工程 38% + AI 应用 32% + 投资 9.5% + 4 个辅助), 应判 GENERALIST
  //   配合 HYSTERESIS: 临界值附近的小波动用滞后区稳定, 不会让用户每天看到身份跳变
  GENERALIST_LONGTAIL_MIN_CLUSTERS: 7,
  GENERALIST_LONGTAIL_MAX_TOP1_SHARE: 0.4,
  GENERALIST_LONGTAIL_MIN_ENTROPY: 0.7,

  // ─── 身份滞后区（v0.1.4 · 解决"同一天结果一直变"）────────
  // 思路: 算出的身份缓存到 storage; 下次重判时优先保留 cached, 除非新数据"明显远离" cached 身份阈值
  //      避免 top1=39% / 41% 这种 1-2% 波动导致 SPECIALIST ↔ GENERALIST 反复横跳
  //
  // 阈值死区: cached 身份的判定条件 ± HYSTERESIS_BAND 内仍视为成立
  //   - 数值型阈值 (top1Share / top3Share / entropy): ± 0.05 (5%)
  //   - 计数型阈值 (clusterCount): ± 1
  //
  // 死区外: 用新判定结果
  HYSTERESIS_SHARE_BAND: 0.05,
  HYSTERESIS_CLUSTER_BAND: 1,
  HYSTERESIS_ENTROPY_BAND: 0.05,

  // ─── Radius · SWITCHER（跳跃者）─────────────────────
  SWITCHER_MAX_JACCARD: 0.3,
  SWITCHER_MIN_CLUSTER_SIZE: 2,
  SWITCHER_MAX_CLUSTER_SIZE: 6,

  // ─── §3 · 地形系统 v2 (v3.1.29) ──────────────────────
  // 共享 TerrainClassifier 算法 · 兴趣地图角标 + §3 §3 地形 共用一套
  //
  // 5 类（按优先级判定）：
  //   1. ember (新冒火苗 / 萌芽中)：最近爆发涌现
  //   2. sleep (沉睡之地 / 休眠)：长期无动作
  //   3. forest (真实热情之林 / 活跃)：在用 + 常态
  //   4. swamp (焦虑沼泽 / 积压中)：不在用 + 还在保存
  //   5. middle (中间态 / 无角标)：不归任何类，§3 不展示

  /** ember 触发：recent 30 天爆发涌现 */
  TERRAIN_EMBER_MIN_RECENT30: 3,
  TERRAIN_EMBER_RATIO_OVER_PREV: 1.5,

  /** sleep 触发：最近一条 > N 天 + 主题有体量 */
  TERRAIN_SLEEP_MIN_DAYS_SINCE: 90,
  TERRAIN_SLEEP_MIN_ITEMS: 5,

  /** forest 触发：真用过率 ≥ N + 主题有体量 */
  TERRAIN_FOREST_MIN_USED_RATE: 0.5,
  TERRAIN_FOREST_MIN_ITEMS: 5,

  /** swamp 触发：真用过率 < N + 体量更大（v3.1.29 用户决策 B · 30% 宽松阈值） */
  TERRAIN_SWAMP_MAX_USED_RATE: 0.3,
  TERRAIN_SWAMP_MIN_ITEMS: 10,

  /** TerrainClassifier 用的"真用过"窗口 */
  TERRAIN_RECENT_USE_WINDOW_DAYS_V2: 90,

  // ─── @deprecated v3.1.29 后 §3 用 TerrainClassifier 算 · 下面这些是老的（保留以防其他地方引用）
  // v3.1.28 · 重新设计：从「processRate」改用「reallyUsedRate」主导
  //   背景：processRate = (kept + released) / total——release 是放手不该算"真在用"
  //   旧规则下「用户集中放手一批历史链接 → processRate 飙升 → 误判为真实热情」
  //   新规则：reallyUsedRate = chip='实际用到了' OR visitCount>0 OR lastVisitedAt 近 90d
  //   processRate 退为辅助信号
  /** illusion_anxiety: cluster 总数 ≥ N + reallyUsedRate < threshold（v3.1.28 主信号改）*/
  ANXIETY_MIN_CLUSTER_TOTAL: 10,
  /** v3.1.28 · 真用过率 < 20% 才算"真焦虑"（原 processRate < 25% 会把"放手多"误判）*/
  ANXIETY_MAX_REALLY_USED_RATE: 0.2,
  /** @deprecated v3.1.28 起未使用，保留向后兼容 */
  ANXIETY_MAX_PROCESS_RATE: 0.25,
  /** real_passion: cluster ≥ N + reallyUsedRate ≥ threshold（v3.1.28 主信号改）*/
  PASSION_MIN_CLUSTER_TOTAL: 5,
  /** v3.1.28 · 真用过率 ≥ 50% 才算"真实热情"（原 processRate ≥ 60% 会把"集中放手"误判）*/
  PASSION_MIN_REALLY_USED_RATE: 0.5,
  /** @deprecated v3.1.28 起未使用 */
  PASSION_MIN_PROCESS_RATE: 0.6,
  /** stale_topic: 最近一条 > N 天 → 归沉睡而非焦虑沼泽 */
  STALE_TOPIC_MIN_AGE_DAYS: 180,
  /** v3.1.28 · §3 真用过率窗口（跟 RECENT_USE_WINDOW_DAYS 保持一致）*/
  TERRAIN_RECENT_USE_WINDOW_DAYS: 90,

  // ─── §2 · 数字反差 ──────────────────────────────────
  DRAMATIC_MIN_TOTAL_ITEMS: 10,
  /** save_vs_process: cluster ≥ N + 处理率 < threshold */
  DRAMA_SAVE_VS_PROCESS_MIN_CLUSTER: 10,
  DRAMA_SAVE_VS_PROCESS_MAX_RATE: 0.15,
  /** topic_concentration: 总数 ≥ + cluster ≥ + top1 ≥ */
  DRAMA_TOPIC_MIN_TOTAL: 20,
  DRAMA_TOPIC_MIN_CLUSTER_COUNT: 3,
  DRAMA_TOPIC_MIN_TOP_SHARE: 0.3,
  /** oldest_waiting: pending ≥ + 最老 ≥ */
  DRAMA_OLDEST_MIN_PENDING: 5,
  DRAMA_OLDEST_MIN_AGE_MONTHS: 6,
  /** time_concentration: cluster ≥ + 时段集中度 ≥ */
  DRAMA_TIME_MIN_CLUSTER_SIZE: 8,
  DRAMA_TIME_MIN_SHARE: 0.5,
  /** reality_vs_aspiration: 幻觉 cluster 大小 + 访问 0 + chip 标记率 */
  DRAMA_ILLUSION_MIN_SAVED: 8,
  DRAMA_ILLUSION_MAX_USED_RATE: 0.2,
  /** release_reason_mix: 近 90 天 release ≥ + 单一 reason 占比 ≥ */
  DRAMA_RELEASE_WINDOW_DAYS: 90,
  DRAMA_RELEASE_MIN_COUNT: 5,
  DRAMA_RELEASE_MIN_SHARE: 0.4,
  /** source_concentration: 总数 ≥ + cluster ≥ + 单 source ≥ */
  DRAMA_SOURCE_MIN_TOTAL: 20,
  DRAMA_SOURCE_MIN_BUCKETS: 3,
  DRAMA_SOURCE_MIN_SHARE: 0.35,
  /** note_silence: kept ≥ + 低密度阈值 + 高密度阈值 */
  DRAMA_NOTE_MIN_KEPT: 20,
  DRAMA_NOTE_LOW_RATE: 0.05,
  DRAMA_NOTE_HIGH_RATE: 0.25,
  /** chip_distribution: 有 chip 总数 ≥ + 单一 chip 占比 ≥ */
  DRAMA_CHIP_MIN_CHIPPED: 15,
  DRAMA_CHIP_MIN_SHARE: 0.5,
  /** burst_period: 总数 ≥ + 跨度 ≥ + 30 天窗口占比 ≥ */
  DRAMA_BURST_MIN_TOTAL: 30,
  DRAMA_BURST_MIN_SPAN_DAYS: 90,
  DRAMA_BURST_MIN_SHARE: 0.3,
  DRAMA_BURST_MIN_MONTHS_AGO: 2,
  /** stale_topic: cluster 数 ≥ + 最近 ≥ */
  DRAMA_STALE_MIN_CLUSTER_SIZE: 10,
  DRAMA_STALE_MIN_MONTHS: 6,

  // ─── §4 · 行为变化（BehavioralChangeService）────────
  /** process rate change: prev60 可处理数 ≥ + recent30 可处理 ≥ + 显著变化阈值 */
  CHANGE_PROCESS_MIN_PREV60: 10,
  CHANGE_PROCESS_MIN_RECENT30: 5,
  CHANGE_PROCESS_MIN_ABS_DIFF: 0.10,
  CHANGE_PROCESS_MIN_REL_DIFF: 0.5,
  CHANGE_SAVE_GROWTH_HIGH: 1.3,
  CHANGE_SAVE_GROWTH_LOW: 0.85,
  /** stability: Jaccard ≥ + monthly ratio 范围 + magnitude ≥ */
  CHANGE_STABILITY_MIN_RECENT30: 5,
  CHANGE_STABILITY_MIN_PREV60: 5,
  CHANGE_STABILITY_MIN_JACCARD: 0.7,
  CHANGE_STABILITY_MIN_MONTHLY_RATIO: 0.6,
  CHANGE_STABILITY_MAX_MONTHLY_RATIO: 1.4,
  CHANGE_STABILITY_MIN_MAGNITUDE: 0.5,
}
