/**
 * IdentityService —— 3 维度身份系统
 *
 * 详见 产品文档/Chord_身份系统设计.md 和 设计稿/Profile_变体E_融合版_隐性自我.html
 *
 * 设计哲学：
 *   每个用户同时被 3 个维度的身份描述（消费风格 5 / 心境 4 / 注意力半径 3）
 *   = 5 × 4 × 3 = 60 种独特画像（实际约 20-30 个有意义组合）
 *
 * 模块边界：
 *   - IdentityService 是核心层，不依赖 AnalyticsService
 *   - AnalyticsService.computeFindings 可以选用 IdentityService 输出来生成 consumption_style Finding
 *   - consumption 维度的具体逻辑此处独立实现（跟 AnalyticsService.inferConsumptionStyle 复制一份，
 *     避免反向依赖；Week 2 UI 改造时再考虑统一）
 *
 * 文案纪律：claim / evidence 必须有"活人感"——具体数字、温柔反讽、不评判、不学术装腔
 * 详见 设计稿/Profile_变体E_融合版_隐性自我.html 头部讨论稿和 plan §二·补
 */

import { IDENTITY_CONFIG as CFG } from './IdentityConfig.js'
import type {
  Item,
  IdentityCard,
  IdentityConfidenceLevel,
  ConsumptionStyle,
  MindsetIdentity,
  RadiusIdentity,
} from '@chord/types'

const DAY = 86_400_000

// ─── 主入口 ─────────────────────────────────────────────────

/**
 * @deprecated v3.1.5 起 NEWCOMER 实际不再触发——MINIMALIST 兜底（inferConsumptionIdentity 内）
 * 接住所有 items <= 50（含 items=0）。本函数保留是为 backward compat / 单测，
 * Profile.tsx 已不再调用。新代码不要使用。
 *
 * v3.1 · NEWCOMER 兜底判定（历史设计）
 *   触发条件: items < 15 OR 数据跨度 < 4 周
 *   注: "数据跨度"指 ageDays(oldest savedAt)，不是 Chord 安装时长
 *
 * @returns true 时 UI 应整体替换 §1 为 NEWCOMER 引导，不渲染 cards
 */
export function isNewcomer(items: Item[], now: number = Date.now()): boolean {
  const contentItems = items.filter((i) => i.type === 'content')
  if (contentItems.length < 15) return true
  const oldestSavedAt = Math.min(...contentItems.map((i) => i.savedAt))
  const dataSpanDays = (now - oldestSavedAt) / DAY
  if (dataSpanDays < 28) return true
  return false
}

/**
 * 计算用户的 3 维度身份卡。
 * 数据不足或信号不明确时该维度返回 null（UI 不显示这张卡）。
 *
 * v3.1 · 调用方应该先用 isNewcomer() 判定。NEWCOMER = true 时不该调本函数。
 *        本函数不内置 NEWCOMER 兜底——是为了让 UI 层能区分"不显示卡（数据不够）"
 *        和"显示但缺数据态（单维度不触发）"两种状态。
 *
 * @param items - 用户所有 content 类 item（调用方负责过滤 type）
 * @param visitCounts - itemId → 90 天访问次数（来自 chrome.history，可选）
 * @param now - 当前时间戳，默认 Date.now()；测试可注入
 */
export function computeAllIdentities(
  items: Item[],
  visitCounts?: Map<string, number>,
  now: number = Date.now(),
  /** v0.1.4 · 上次判出的身份 cards, 用于滞后区: 临界值小波动时保留 prev 身份, 避免反复横跳 */
  previousCards?: IdentityCard[],
): IdentityCard[] {
  // v3.1.26 · "items" 精细化定义——按维度选 active vs full
  //   - consumption（你跟内容的关系）→ active：放手了就不再是你的收藏，UX 视角对齐
  //   - mindset（当下行为）→ full：RETURNER 翻老收藏做决定 含放手动作，必须看 released
  //   - radius（注意力范围）→ full：release 也包含了"已经处理的"，曾经覆盖的注意力范围
  //     不该被排除；radius 算法已经用 recent 90 天窗口，时间维度上自然过滤旧数据
  //   §2/§3/§4 保留全部 items（要用 released 算放手反差等），只 IdentityService 入口精细化
  const contentItems = items.filter((i) => i.type === 'content')
  const activeItems = contentItems.filter((i) => i.status !== 'released')
  const cards: IdentityCard[] = []

  const consumption = inferConsumptionIdentity(activeItems, now, visitCounts)
  if (consumption) cards.push(consumption)

  // mindset 用 full（含 released）—— RETURNER 等信号依赖放手动作
  const mindset = inferMindsetIdentity(contentItems, visitCounts, now)
  if (mindset) cards.push(mindset)

  // radius 用 full —— release 的内容曾覆盖用户注意力，应该计入注意力范围画像
  // v0.1.4 · 传 previousRadiusId 给推断函数, 让滞后区 fallback 能用
  const prevRadiusId = previousCards?.find((c) => c.dimension === 'radius')?.id as RadiusIdentity | undefined
  const radius = inferRadiusIdentity(contentItems, now, prevRadiusId)
  if (radius) cards.push(radius)

  // v3.1 · 按 extremity 排序（主卡 = 最突出的维度）
  cards.sort((a, b) => b.extremity - a.extremity)

  return cards
}

/**
 * v3.1 · 三维平衡检测
 * 当三维 extremity 接近时（max - min < 0.15），UI 应在 §1 底部追加"三维平衡"叙述
 *
 * @returns 平衡档位 'deep' | 'vivid' | 'subtle'，或 null 表示不平衡
 */
export function detectBalancedTriple(cards: IdentityCard[]): 'deep' | 'vivid' | 'subtle' | null {
  if (cards.length !== 3) return null
  const sorted = [...cards].sort((a, b) => b.extremity - a.extremity)
  const spread = sorted[0]!.extremity - sorted[2]!.extremity
  if (spread >= 0.15) return null
  const maxE = sorted[0]!.extremity
  if (maxE > 0.7) return 'deep'
  if (maxE > 0.4) return 'vivid'
  return 'subtle'
}

/** v3.1 · 三维平衡叙述文案 */
export const BALANCED_NARRATIVES = {
  deep: '你三个维度都走得很深——画像浓墨重彩，每一笔都不含糊。',
  vivid: '你的画像饱和而平衡——三维并列鲜明，没有压倒性的那一面。',
  subtle: '你的画像是克制的——三维都浅浅露头，像一幅淡墨。',
} as const

/**
 * v3.1.6 · MBTI 风格的 3 字母身份代码
 * 设计：3 个位置固定（消费风格 / 心境 / 半径），每个位置内字母唯一
 *   - 例: HXG = HOARDER + EXPLORER + GENERALIST（信息焦虑囤积家）
 *   - 缺位 → 下划线占位（H _ G 表示 mindset 还看不清）
 * 跟产品名「Chord」呼应——3 个音符 = 一个和弦
 */
export const IDENTITY_CODES: Record<string, string> = {
  // 消费风格 7（每个唯一首字母或近邻字母）
  hoarder: 'H',
  executor: 'E',
  thinker: 'T',
  slow_reader: 'S',
  curator: 'C',
  minimalist: 'M',
  balanced: 'B',
  // 心境 6
  explorer: 'X',     // eXplorer
  deepener: 'D',
  seeker: 'K',       // seeK
  returner: 'R',
  settler: 'L',      // setLer
  dormant: 'Z',      // Zzz
  // 半径 3
  specialist: 'P',   // sPecialist
  generalist: 'G',
  switcher: 'W',     // sWitch
}

/**
 * 生成 3 字母组合代码（缺位用 "U" 表示 Unseen / "还看不清"）
 * @example
 *   getComboCode([HOARDER, EXPLORER, GENERALIST]) → "HXG"
 *   getComboCode([HOARDER, GENERALIST])           → "HUG"
 *   getComboCode([HOARDER])                       → "HUU"
 *
 * v3.1.15 · "?" → "U"：U 是真字母（Unseen）让代码视觉一致；不跟任何 15 身份字母冲突
 */
export function getComboCode(cards: IdentityCard[]): string {
  const slots: [string, string, string] = ['U', 'U', 'U']
  for (const c of cards) {
    const code = IDENTITY_CODES[c.id]
    if (!code) continue
    if (c.dimension === 'consumption') slots[0] = code
    else if (c.dimension === 'mindset') slots[1] = code
    else if (c.dimension === 'radius') slots[2] = code
  }
  return slots.join('')
}

// ─── 公共工具 ───────────────────────────────────────────────

/**
 * 在某天数窗口内的 item（基于 savedAt）
 * 约定：daysAgoStart > daysAgoEnd（如 inWindow(items, 90, 30, now) = 30-90 天前的范围）
 * 返回 item 满足：savedAt ∈ [now - daysAgoStart*DAY, now - daysAgoEnd*DAY)
 */
function inWindow(items: Item[], daysAgoStart: number, daysAgoEnd: number, now: number): Item[] {
  // 老 boundary（含）= now - daysAgoStart*DAY，新 boundary（不含）= now - daysAgoEnd*DAY
  const olderBound = now - daysAgoStart * DAY
  const newerBound = now - daysAgoEnd * DAY
  return items.filter((i) => i.savedAt >= olderBound && i.savedAt < newerBound)
}

/** Cluster 分布：cluster name → item 数 */
function clusterShares(items: Item[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const i of items) {
    if (!i.cluster) continue
    m.set(i.cluster, (m.get(i.cluster) ?? 0) + 1)
  }
  return m
}

/** 排序后取 top-k cluster name */
function topKClusters(m: Map<string, number>, k: number): string[] {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([n]) => n)
}

/** Jaccard 相似度 |A∩B| / |A∪B| */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

/** Shannon 归一化熵 0-1（1 = 完全均匀）*/
function normalizedEntropy(m: Map<string, number>): number {
  const total = [...m.values()].reduce((s, n) => s + n, 0)
  if (total <= 1 || m.size <= 1) return 0
  let entropy = 0
  for (const n of m.values()) {
    const p = n / total
    if (p > 0) entropy -= p * Math.log(p)
  }
  return entropy / Math.log(m.size)
}

/** 把 0-1 confidence 映射到档位 */
function confLevel(c: number): IdentityConfidenceLevel {
  if (c >= 0.7) return 'high'
  if (c >= 0.4) return 'medium'
  return 'low'
}

/** 数据不足判定 */
function notEnoughData(items: Item[]): boolean {
  return items.length < 10
}

// ─── 消费风格（5）─────────────────────────────────────────
// 复制自 AnalyticsService.inferConsumptionStyle 但返回 IdentityCard 格式
// 后续 Week 2 UI 改造时可考虑把 AnalyticsService 那份 migrate 过来；本期双轨

function inferConsumptionIdentity(items: Item[], now: number, visitCounts?: Map<string, number>): IdentityCard | null {
  // v3.1.5 · consumption 维度永远会输出 cards——MINIMALIST 兜底接住所有 items <= 50（含 items=0）
  // 这样 NEWCOMER 全局兜底实际上不会触发，UX 上"新手"永远只是 MINIMALIST 的最早形态
  const processed = items.filter((i) => i.status !== 'pending')
  const processRate = items.length > 0 ? processed.length / items.length : 0

  // chip 分布
  const chipCount: Record<string, number> = {}
  for (const i of items) {
    if (i.usageChip) chipCount[i.usageChip] = (chipCount[i.usageChip] ?? 0) + 1
  }
  const totalChips = Object.values(chipCount).reduce((s, n) => s + n, 0)

  // noteRate
  const noteCount = items.filter((i) => i.privateNote && i.privateNote.length > 0).length
  const noteRate = noteCount / items.length

  // 平均决策延迟
  const lagDays: number[] = []
  for (const i of processed) {
    if (!i.processedAt) continue
    const seen = i.firstSeenAt ?? i.savedAt
    lagDays.push((i.processedAt - seen) / DAY)
  }
  const avgLag = lagDays.length > 0 ? lagDays.reduce((s, n) => s + n, 0) / lagDays.length : 0

  // 数据跨度（v3.1 触发时间维度统一用数据跨度，不是工具使用时长）
  // v3.1.5 · items=0 时 Math.min(...) 会返 Infinity，特殊处理
  const oldestSavedAt = items.length > 0 ? Math.min(...items.map((i) => i.savedAt)) : now
  const dataSpanDays = (now - oldestSavedAt) / DAY

  // v3.1.27 · 真用过率计算（用于 MINIMALIST/HOARDER 中量分流）
  //   真用过 = chip='实际用到了' OR visitCount > 0 (chrome.history 90 天窗口) OR lastVisitedAt 近期
  //   定义见 IDENTITY_CONFIG.RECENT_USE_WINDOW_DAYS
  const recentUseCutoff = now - CFG.RECENT_USE_WINDOW_DAYS * DAY
  const reallyUsedCount = items.filter((i) => {
    if (i.usageChip === '实际用到了') return true
    if ((visitCounts?.get(i.id) ?? 0) > 0) return true
    if (i.lastVisitedAt && i.lastVisitedAt > recentUseCutoff) return true
    return false
  }).length
  const reallyUsedRate = items.length > 0 ? reallyUsedCount / items.length : 0

  // v3.1.3 · 优先级调整：chip-based 身份（EXECUTOR/THINKER/CURATOR）信号最具体 → 最先检查
  // 之前 SLOW_READER 在 chip 前判定会抢，导致明明 chip 信号清晰的用户被归慢读者（case-04 thinker bug）
  if (totalChips >= CFG.CHIP_BASED_MIN_TOTAL) {
    const ratio = (k: string) => (chipCount[k] ?? 0) / totalChips
    if (ratio('实际用到了') > CFG.EXECUTOR_USED_RATIO) {
      const r = ratio('实际用到了')
      const extremity = calcExtremity(r, CFG.EXECUTOR_USED_RATIO, 0.80)
      const confidence = Math.max(0.4, Math.min(0.95,
        0.5 + 0.3 * Math.min(1, totalChips / 20) + 0.2 * r,
      ))
      return makeCard('consumption', 'executor', 'EXECUTOR', '行动者',
        '你不是在攒，是在用——存下的迟早会派上用场。',
        `${Math.round(r * 100)}% 的收藏你说"实际用到了"。`,
        confidence, extremity)
    }
    if (ratio('启发思路') > CFG.THINKER_INSPIRE_RATIO && noteRate > CFG.THINKER_NOTE_RATE) {
      const inspire = ratio('启发思路')
      const e1 = calcExtremity(inspire, CFG.THINKER_INSPIRE_RATIO, 0.70)
      const e2 = calcExtremity(noteRate, CFG.THINKER_NOTE_RATE, 0.50)
      const extremity = Math.min(e1, e2)
      const confidence = Math.max(0.4, Math.min(0.95,
        0.5 + 0.3 * Math.min(1, totalChips / 20) + 0.2 * Math.min(inspire, noteRate * 2),
      ))
      return makeCard('consumption', 'thinker', 'THINKER', '思想家',
        '你用内容滋养想法——读完留下的痕迹比读本身重要。',
        `${Math.round(inspire * 100)}% 标"启发思路"，${Math.round(noteRate * 100)}% 留了笔记。`,
        confidence, extremity)
    }
    if (processRate > CFG.CURATOR_MIN_PROCESS_RATE && ratio('仅此一读，够了') > CFG.CURATOR_ONEREAD_RATIO) {
      const oneRead = ratio('仅此一读，够了')
      const extremity = calcExtremity(oneRead, CFG.CURATOR_ONEREAD_RATIO, 0.80)
      const confidence = Math.max(0.4, Math.min(0.95,
        0.4 + 0.3 * processRate + 0.3 * oneRead,
      ))
      return makeCard('consumption', 'curator', 'CURATOR', '策展人',
        '你精选了——读过、感受过、放下了。这是一种克制的从容。',
        `处理率 ${Math.round(processRate * 100)}%，常说"仅此一读，够了"。`,
        confidence, extremity)
    }
  }

  // ─── v3.1.27 · HOARDER 双路径 ──────────────────────
  //   路径 A · 大量囤积: active ≥ 50 + processRate < 20%（原 v3.1 规则）
  //   路径 B · 中量囤积: active 20-49 + 真用过率 < 60%（v3.1.27 新规则）
  const activeCount = items.length

  // 路径 A · 大量
  if (activeCount >= CFG.HOARDER_HIGH_VOLUME_MIN_ACTIVE && processRate < CFG.HOARDER_HIGH_VOLUME_MAX_PROCESS_RATE) {
    const extremity = calcExtremity(activeCount, CFG.HOARDER_HIGH_VOLUME_MIN_ACTIVE, 200)
    const confidence = Math.max(0.4, Math.min(0.95,
      0.4 + 0.4 * Math.min(1, activeCount / 100) + 0.2 * ((CFG.HOARDER_HIGH_VOLUME_MAX_PROCESS_RATE - processRate) / CFG.HOARDER_HIGH_VOLUME_MAX_PROCESS_RATE),
    ))
    return makeCard('consumption', 'hoarder', 'HOARDER', '收藏家',
      '你像个不会过期的图书馆——总有新书进来，但很少打开。',
      `${activeCount} 条收藏里 ${Math.round((1 - processRate) * 100)}% 还没被打开。`,
      confidence, extremity)
  }

  // 路径 B · 中量 + 真用过率低 + processRate < 50%（防 kept 多但未必真打开的用户被错判）
  if (
    activeCount >= CFG.HOARDER_MID_VOLUME_MIN_ACTIVE
    && activeCount <= CFG.HOARDER_MID_VOLUME_MAX_ACTIVE
    && reallyUsedRate < CFG.HOARDER_MID_VOLUME_MAX_REALLY_USED_RATE
    && processRate < CFG.HOARDER_MID_VOLUME_MAX_PROCESS_RATE
  ) {
    const extremity = calcExtremity(1 - reallyUsedRate, 0.4, 1)
    const confidence = Math.max(0.4, Math.min(0.95,
      0.4 + 0.3 * (1 - reallyUsedRate) + 0.2 * Math.min(1, activeCount / 40),
    ))
    return makeCard('consumption', 'hoarder', 'HOARDER', '收藏家',
      '你像个不会过期的图书馆——总有新书进来，但很少打开。',
      `${activeCount} 条收藏里只 ${reallyUsedCount} 条最近真打开过。`,
      confidence, extremity)
  }

  // slow_reader：平均决策延迟 > 60 天且处理率 > 30%
  if (avgLag > CFG.SLOW_READER_MIN_LAG_DAYS && processRate > CFG.SLOW_READER_MIN_PROCESS_RATE) {
    const extremity = calcExtremity(avgLag, CFG.SLOW_READER_MIN_LAG_DAYS, 180)
    const confidence = Math.max(0.4, Math.min(0.95,
      0.5 + 0.3 * Math.min(1, processed.length / 30),
    ))
    return makeCard('consumption', 'slow_reader', 'SLOW READER', '慢读者',
      '你不着急——内容在等你准备好。',
      `平均 ${Math.round(avgLag)} 天才决定一条——不是拖延，是慎重。`,
      confidence, extremity)
  }

  // ─── v3.1.27 · MINIMALIST 双路径 ──────────────────
  //   路径 A · 严格极简: active ≤ 15（"你存得少"）
  //   路径 B · 精挑实用: active 16-49 + 真用过率 ≥ 60%（"存的不多但都在用"）

  // 路径 A · 严格
  if (activeCount <= CFG.MINIMALIST_STRICT_MAX_ACTIVE) {
    const extremity = calcExtremity(CFG.MINIMALIST_STRICT_MAX_ACTIVE - activeCount, 0, CFG.MINIMALIST_STRICT_MAX_ACTIVE - 1)
    const confidence = Math.max(0.4, Math.min(0.95,
      0.4 + 0.4 * Math.min(1, activeCount / 8) + 0.2 * Math.min(1, dataSpanDays / 56),
    ))
    const evi =
      activeCount === 0 ? '目前还没保存——书房等你存第一条。'
      : activeCount === 1 ? '目前 1 条收藏——你跟内容的关系不喧哗。'
      : `${activeCount} 条收藏，处理过 ${processed.length} 条。`
    return makeCard('consumption', 'minimalist', 'MINIMALIST', '极简者',
      '你不常保存——这是你跟世界相处的节奏。',
      evi,
      confidence, extremity)
  }

  // 路径 B · 精挑实用（中量但真用过率高）
  if (
    activeCount >= CFG.MINIMALIST_PRAGMATIC_MIN_ACTIVE
    && activeCount <= CFG.MINIMALIST_PRAGMATIC_MAX_ACTIVE
    && reallyUsedRate >= CFG.MINIMALIST_PRAGMATIC_MIN_REALLY_USED_RATE
  ) {
    const extremity = calcExtremity(reallyUsedRate, CFG.MINIMALIST_PRAGMATIC_MIN_REALLY_USED_RATE, 1)
    const confidence = Math.max(0.4, Math.min(0.95,
      0.4 + 0.3 * reallyUsedRate + 0.2 * Math.min(1, activeCount / 30),
    ))
    return makeCard('consumption', 'minimalist', 'MINIMALIST', '极简者',
      '你不囤——存下的不多，但每条都真的在用。',
      `${activeCount} 条收藏里 ${reallyUsedCount} 条最近真打开过——${Math.round(reallyUsedRate * 100)}% 在用。`,
      confidence, extremity)
  }

  // v3.1.5 → v3.1.26 · BALANCED 平衡者（最终兜底）
  //   - 旧: items > 50 + 处理率中等
  //   - 新: items > 10 + 所有其他算法都不触发——稳态画像兜底
  //   - 11-50 用户（中等保存量 + 无强 chip / 不囤 / 不慢）也归 BALANCED
  //   - 心理画像：稳定信息习惯 / 不挣扎也不强求
  {
    // extremity: 越平衡越极端（反向）。综合 processRate 跟"中性 40%"的距离取 inverse
    const balanceFactor = 1 - Math.min(1,
      Math.abs(processRate - 0.4) / 0.4,
    )
    const extremity = Math.max(0, Math.min(1, balanceFactor))
    const confidence = Math.max(0.4, Math.min(0.95,
      0.4 + 0.4 * Math.min(1, items.length / 100) + 0.2 * Math.min(1, dataSpanDays / 180),
    ))
    return makeCard('consumption', 'balanced', 'BALANCED', '平衡者',
      '你跟内容的关系很均衡——不囤积，不丢弃，节奏在你自己手里。',
      `${items.length} 条收藏，处理过 ${processed.length} 条（${Math.round(processRate * 100)}%）。`,
      confidence, extremity)
  }
}

// ─── Mindset（4）EXPLORER / SEEKER / RETURNER / SETTLER ─────────

/**
 * 心境身份基于 4-8 周尺度的"当下势能"判定。
 * 关键信号：30 天新增 vs 历史月均、新 cluster 数、老 item 处理率、release 增长。
 */
function inferMindsetIdentity(
  items: Item[],
  visitCounts: Map<string, number> | undefined,
  now: number,
): IdentityCard | null {
  if (notEnoughData(items)) return null

  // 数据窗口
  const recent30 = inWindow(items, 30, 0, now)
  const prev60 = inWindow(items, 90, 30, now)

  // 历史月均（按数据跨度估算）
  const oldestSavedAt = Math.min(...items.map((i) => i.savedAt))
  const totalDays = Math.max(1, (now - oldestSavedAt) / DAY)
  const monthlyAvg = items.length / (totalDays / 30)
  const recentMonthly = recent30.length

  // 30 天新冒头的 cluster（之前 60 天没出现的）
  const recentClusters = new Set([...clusterShares(recent30).keys()])
  const prevClusters = new Set([...clusterShares(prev60).keys()])
  const brandNewClusters = [...recentClusters].filter((c) => !prevClusters.has(c))

  // Jaccard 相似度：30 天 vs 60-90 天的 cluster 集合
  const clusterJaccard = jaccard(recentClusters, prevClusters)

  // 处理动作（最近 30 天）
  const recent30Processed = items.filter((i) =>
    i.processedAt && i.processedAt >= now - 30 * DAY,
  )
  const recent30Released = recent30Processed.filter((i) => i.status === 'released')

  // 老 item 处理（处理对象 savedAt > 90 天前的）
  const oldProcessed = items.filter(
    (i) => i.processedAt && i.processedAt >= now - 30 * DAY && i.savedAt < now - 90 * DAY,
  )
  const oldItems = items.filter((i) => i.savedAt < now - 90 * DAY)
  const oldProcessRate = oldItems.length > 0 ? oldProcessed.length / oldItems.length : 0

  // v3.1 · DORMANT 蛰伏者 —— 曾活跃但近 30 天几乎不保存（必须先于 SETTLER 判定）
  const longWaitItems = items.filter(
    (i) => i.status === 'pending' && (now - i.savedAt) > 90 * DAY,
  )
  if (
    items.length >= 30 &&
    monthlyAvg >= CFG.DORMANT_MIN_MONTHLY_AVG &&
    recent30.length <= 1 &&
    longWaitItems.length >= 5
  ) {
    const idleDays = (now - Math.max(...items.map((i) => i.savedAt))) / DAY
    const extremity = Math.max(0, Math.min(1,
      (idleDays - 30) / 60 * 0.6 + Math.min(1, monthlyAvg / 20) * 0.4,
    ))
    const confidence = Math.max(0.4, Math.min(0.90,
      0.5 + 0.3 * Math.min(1, idleDays / 60) + 0.2 * Math.min(1, longWaitItems.length / 30),
    ))
    return makeCard('mindset', 'dormant', 'DORMANT', '蛰伏者',
      '你这阵子离开了——这里的内容还在等你回来。',
      `上次保存在 ${Math.round(idleDays)} 天前；累计 ${longWaitItems.length} 条等了你 3 个月以上。`,
      confidence, extremity)
  }

  // 1. RETURNER 回归者 —— 主动处理老收藏 + release 增长
  if (oldProcessRate > CFG.RETURNER_MIN_OLD_PROCESS_RATE && recent30Released.length >= CFG.RETURNER_MIN_RECENT_RELEASES && oldItems.length >= 10) {
    const e1 = calcExtremity(oldProcessRate, CFG.RETURNER_MIN_OLD_PROCESS_RATE, 0.32)
    const e2 = Math.min(1, recent30Released.length / 20)
    const extremity = 0.7 * e1 + 0.3 * e2
    const confidence = Math.max(0.4, Math.min(0.95,
      0.5 + 0.4 * Math.min(1, oldItems.length / 30) + 0.1 * Math.min(1, recent30Released.length / 10),
    ))
    return makeCard('mindset', 'returner', 'RETURNER', '回归者',
      '你在跟过去的自己谈判——清理、放手、问"它还重要吗"。',
      `30 天处理了 ${recent30Processed.length} 条老收藏，放手 ${recent30Released.length} 条。`,
      confidence, extremity)
  }

  // 2. EXPLORER 探索者 —— 多方向涌现 + 求知爆发（开新主题）
  if (
    brandNewClusters.length >= CFG.EXPLORER_MIN_BRAND_NEW_CLUSTERS &&
    clusterJaccard < CFG.EXPLORER_MAX_JACCARD &&
    recentMonthly >= monthlyAvg * CFG.EXPLORER_MIN_RECENT_RATIO &&
    recent30.length >= 5
  ) {
    const ratio = recentMonthly / Math.max(1, monthlyAvg)
    const e1 = calcExtremity(brandNewClusters.length, CFG.EXPLORER_MIN_BRAND_NEW_CLUSTERS, 6)
    const e2 = calcExtremity(ratio, CFG.EXPLORER_MIN_RECENT_RATIO, 3.0)
    const extremity = 0.5 * e1 + 0.5 * e2
    const newScore = Math.min(1, brandNewClusters.length / 5)
    const burstScore = Math.min(1, (ratio - 1) / 1.5)
    const confidence = Math.max(0.4, Math.min(0.95,
      0.4 + 0.3 * newScore + 0.2 * burstScore + 0.1 * Math.min(1, items.length / 100),
    ))
    return makeCard('mindset', 'explorer', 'EXPLORER', '探索者',
      '你最近在四处试——好奇心比往常更敢飞。',
      `30 天进了 ${brandNewClusters.length} 个新主题，保存量是月均 ${ratio.toFixed(1)} 倍。`,
      confidence, extremity)
  }

  // 2.5 DEEPENER 深化者 —— 保存爆发但在已有主题上加深（不开新方向）
  //    判定：保存量 ≥ 1.3× 月均 + brand new 少 + Jaccard 高（主题集合稳定）+ recent 多主题平行
  //    这是 EXPLORER 互补：同样的"保存爆发"，但走的是深化路线
  if (
    recentMonthly >= monthlyAvg * CFG.DEEPENER_MIN_RECENT_RATIO &&
    brandNewClusters.length <= CFG.DEEPENER_MAX_BRAND_NEW &&
    clusterJaccard >= CFG.EXPLORER_MAX_JACCARD &&
    recentClusters.size >= CFG.DEEPENER_MIN_BREADTH &&
    recent30.length >= 5
  ) {
    const ratio = recentMonthly / Math.max(1, monthlyAvg)
    const e1 = calcExtremity(clusterJaccard, CFG.EXPLORER_MAX_JACCARD, 1.0)
    const e2 = calcExtremity(ratio, CFG.DEEPENER_MIN_RECENT_RATIO, 3.0)
    const e3 = calcExtremity(recentClusters.size, CFG.DEEPENER_MIN_BREADTH, 6)
    const extremity = 0.4 * e1 + 0.3 * e2 + 0.3 * e3
    const stabilityScore = clusterJaccard
    const burstScore = Math.min(1, (ratio - 1) / 1.5)
    const breadthScore = Math.min(1, recentClusters.size / 6)
    const confidence = Math.max(0.4, Math.min(0.95,
      0.35 + 0.25 * stabilityScore + 0.15 * burstScore + 0.1 * breadthScore + 0.15 * Math.min(1, items.length / 100),
    ))
    return makeCard('mindset', 'deepener', 'DEEPENER', '深化者',
      '你不是在开新地——你在已有的几条路上同时往深里走。',
      `30 天保存 ${recent30.length} 条（月均 ${ratio.toFixed(1)} 倍），分布在 ${recentClusters.size} 个老主题上，没开新方向。`,
      confidence, extremity)
  }

  // 3. SEEKER 求索者 —— 单一主题强烈聚焦
  //    判定：top cluster 占 recent 30 saves ≥ 40%；或 visitCount 集中度 > 40%
  const recent30ClusterCount = clusterShares(recent30)
  const recent30Total = recent30.length
  let topCluster: string | undefined
  let topShareSaved = 0
  for (const [c, n] of recent30ClusterCount) {
    const share = n / Math.max(1, recent30Total)
    if (share > topShareSaved) {
      topShareSaved = share
      topCluster = c
    }
  }

  // visitCount 集中度 fallback：如果有 visitCounts，看 top cluster 的访问占比
  let topShareVisits = 0
  if (visitCounts && topCluster) {
    let visitsOnTop = 0
    let visitsTotal = 0
    for (const i of items) {
      const v = visitCounts.get(i.id) ?? 0
      visitsTotal += v
      if (i.cluster === topCluster) visitsOnTop += v
    }
    topShareVisits = visitsTotal > 0 ? visitsOnTop / visitsTotal : 0
  }
  const topShare = Math.max(topShareSaved, topShareVisits)

  if (topShare >= CFG.SEEKER_MIN_TOP_SHARE && recent30Total >= CFG.SEEKER_MIN_RECENT_COUNT && topCluster) {
    const extremity = calcExtremity(topShare, CFG.SEEKER_MIN_TOP_SHARE, 0.80)
    const confidence = Math.max(0.4, Math.min(0.95, 0.4 + 0.6 * topShare))
    const topClusterTotal = recent30ClusterCount.get(topCluster) ?? 0
    return makeCard('mindset', 'seeker', 'SEEKER', '求索者',
      `你最近被「${topCluster}」紧紧抓住——往一个方向深挖。`,
      `30 天里 ${Math.round(topShare * 100)}% 的注意力都在「${topCluster}」（${topClusterTotal} 条）。`,
      confidence, extremity)
  }

  // 4. SETTLER 沉淀者 —— 进入平静，无新主题、保存下降
  if (
    recentMonthly < monthlyAvg * CFG.SETTLER_MAX_RECENT_RATIO &&
    brandNewClusters.length === 0 &&
    recent30.length >= 0 &&
    items.length >= CFG.MINDSET_MIN_TOTAL_ITEMS
  ) {
    const decline = 1 - recentMonthly / Math.max(1, monthlyAvg)
    const extremity = calcExtremity(decline, 1 - CFG.SETTLER_MAX_RECENT_RATIO, 0.80)
    const confidence = Math.max(0.4, Math.min(0.75, 0.4 + decline * 0.4))  // SETTLER 封顶 0.75
    return makeCard('mindset', 'settler', 'SETTLER', '沉淀者',
      '你慢下来了——这一阵没在追新东西。',
      `近 30 天保存 ${recent30.length} 条，是月均（${monthlyAvg.toFixed(0)} 条）的 ${Math.round(recentMonthly / Math.max(1, monthlyAvg) * 100)}%。`,
      confidence, extremity)
  }

  return null
}

// ─── Radius（3）SPECIALIST / GENERALIST / SWITCHER ────────────

/**
 * 注意力半径基于 90 天 cluster 分布 + 切换模式判定。
 */
function inferRadiusIdentity(items: Item[], now: number, previousId?: RadiusIdentity | null): IdentityCard | null {
  if (notEnoughData(items)) return null

  // 90 天窗：当前注意力半径基础
  const recent90 = inWindow(items, CFG.RADIUS_WINDOW_DAYS, 0, now)
  if (recent90.length < CFG.RADIUS_MIN_RECENT_ITEMS) return null

  const shares = clusterShares(recent90)
  const total = recent90.length
  const clusterCount = shares.size

  // top cluster shares
  const sorted = [...shares.entries()].sort((a, b) => b[1] - a[1])
  const top1Share = sorted[0] ? sorted[0][1] / total : 0
  const top3Share = sorted.slice(0, 3).reduce((s, [, n]) => s + n, 0) / total
  const top5Share = sorted.slice(0, 5).reduce((s, [, n]) => s + n, 0) / total
  const ent = normalizedEntropy(shares)

  // 顺序：先稳定形态（SPECIALIST / GENERALIST），再 SWITCHER（跳跃需要"小群"特征）
  // 避免把"广撒 + 时间维度上有迁移"的用户错判成 SWITCHER

  // 1. SPECIALIST 专精派 · v3.1.31 删 clusterCount 上限（详见 IdentityConfig.ts SPECIALIST 注释）
  if (top1Share > CFG.SPECIALIST_MIN_TOP1_SHARE && top3Share > CFG.SPECIALIST_MIN_TOP3_SHARE && clusterCount > 0) {
    const extremity = calcExtremity(top1Share, CFG.SPECIALIST_MIN_TOP1_SHARE, 0.80)
    const confidence = Math.max(0.4, Math.min(0.95, 0.5 + top1Share * 0.4))
    const topName = sorted[0]?.[0] ?? ''
    return makeCard('radius', 'specialist', 'SPECIALIST', '专精派',
      `你深耕在「${topName}」附近——别的方向对你来说有点远。`,
      `近 90 天 ${Math.round(top1Share * 100)}% 的注意力在 1 个主题，前 3 个占 ${Math.round(top3Share * 100)}%。`,
      confidence, extremity)
  }

  // 2. GENERALIST 广博派 · 两条路径（v3.1.28）
  //   A · 严格广博: top1 < 25% + cluster > 10 + entropy > 0.85（原规则）
  //   B · 长尾广博: cluster ≥ 11 + top1 < 40% + entropy ≥ 0.70（双峰长尾形态新增）
  //   背景：原算法 gap——top1=32% + entropy=0.83 + 11 cluster 落到"还看不清"
  //         实际形态是"双峰长尾"（如 AI 32% + 投资 24% + 9 个辅助主题各占 2-10%）
  const isStrictGeneralist = top1Share < CFG.GENERALIST_MAX_TOP1_SHARE
    && clusterCount > CFG.GENERALIST_MIN_CLUSTER_COUNT
    && ent > CFG.GENERALIST_MIN_ENTROPY
  const isLongtailGeneralist = clusterCount >= CFG.GENERALIST_LONGTAIL_MIN_CLUSTERS
    && top1Share < CFG.GENERALIST_LONGTAIL_MAX_TOP1_SHARE
    && ent >= CFG.GENERALIST_LONGTAIL_MIN_ENTROPY
  if (isStrictGeneralist || isLongtailGeneralist) {
    const e1 = calcExtremity(clusterCount, CFG.GENERALIST_MIN_CLUSTER_COUNT + 1, 25)
    const e2 = calcExtremity(ent, CFG.GENERALIST_LONGTAIL_MIN_ENTROPY, 0.95)
    // 长尾形态 extremity 略降，表达"不是完全均衡的广博"
    const extremity = isStrictGeneralist ? Math.max(e1, e2) : Math.max(e1, e2) * 0.7
    const confidence = isStrictGeneralist
      ? Math.max(0.4, Math.min(0.95, 0.5 + (ent - 0.85) * 2 + (clusterCount - 10) * 0.02))
      : Math.max(0.4, Math.min(0.75, 0.4 + (ent - 0.7) * 0.8 + (clusterCount - 10) * 0.02))
    const top2Name = sorted[1]?.[0] ?? ''
    const top2Share = sorted[1] ? sorted[1][1] / total : 0
    const claim = isStrictGeneralist
      ? '你对什么都感兴趣——没有一个能让你停下，但也没有一个能让你飞。'
      : `你有两条主线，但又不肯只走两条——「${sorted[0]?.[0]}」跟「${top2Name}」之外还撒了很多种子。`
    const evidence = isStrictGeneralist
      ? `近 90 天涉及 ${clusterCount} 个主题，最大占比只 ${Math.round(top1Share * 100)}%。`
      : `近 90 天 ${clusterCount} 个主题：「${sorted[0]?.[0]}」${Math.round(top1Share * 100)}% + 「${top2Name}」${Math.round(top2Share * 100)}%，其余 ${clusterCount - 2} 个主题平摊剩下的注意力。`
    return makeCard('radius', 'generalist', 'GENERALIST', '广博派',
      claim, evidence, confidence, extremity)
  }

  // 3. SWITCHER 跳跃者 —— Jaccard(30 vs 60-90) < 0.3 + 30 天主题数较少（≤ 6）
  //    最后才判：要求"小群 + 切换"特征，避免误归"广撒 + 新增"的用户
  const recent30Clusters = new Set([...clusterShares(inWindow(items, 30, 0, now)).keys()])
  const prev60Clusters = new Set([...clusterShares(inWindow(items, 90, 30, now)).keys()])
  const switchJaccard = jaccard(recent30Clusters, prev60Clusters)

  if (
    switchJaccard < CFG.SWITCHER_MAX_JACCARD &&
    recent30Clusters.size >= CFG.SWITCHER_MIN_CLUSTER_SIZE && recent30Clusters.size <= CFG.SWITCHER_MAX_CLUSTER_SIZE &&
    prev60Clusters.size >= CFG.SWITCHER_MIN_CLUSTER_SIZE && prev60Clusters.size <= CFG.SWITCHER_MAX_CLUSTER_SIZE
  ) {
    const extremity = calcExtremity(CFG.SWITCHER_MAX_JACCARD - switchJaccard, 0, CFG.SWITCHER_MAX_JACCARD)
    const confidence = Math.max(0.4, Math.min(0.85, 0.45 + (CFG.SWITCHER_MAX_JACCARD - switchJaccard) * 1.5))
    return makeCard('radius', 'switcher', 'SWITCHER', '跳跃者',
      '你的注意力像潮汐——这阵一群主题，下阵换一群。',
      `近 30 天的主题跟前 60 天重合度仅 ${Math.round(switchJaccard * 100)}%。`,
      confidence, extremity)
  }

  // v0.1.4 · 滞后区 fallback · 解决"同一天身份反复跳变"
  //   逻辑: 落到中间态前先看上次身份, 用"宽松版条件"重判——能成立就保留 prev
  //   宽松版 = 原阈值 ± HYSTERESIS_*_BAND, 即"还在死区内"
  //   死区外才让用户看到身份变化, 不会因 top1=39%/41% 的 1-2% 波动而 SPECIALIST↔GENERALIST 横跳
  if (previousId) {
    const fits = stillFitsRadius(previousId, { top1Share, top3Share, clusterCount, ent, items, now })
    if (fits) {
      // 用宽松版重建一张 card; confidence 略降表示"靠滞后区维持"
      return makeCardForRadius(previousId, { top1Share, top3Share, clusterCount, ent, sorted, total, confidenceMul: 0.85 })
    }
  }

  // 介于专精和广博之间的中间态——不给身份，留 null（避免误判）
  return null
}

/**
 * v0.1.4 · 滞后区: 上次判出的 radius 身份, 用宽松版条件看是否仍成立
 *   每个身份原阈值 ± HYSTERESIS_*_BAND, 在死区内视为"仍是 prev 身份"
 */
function stillFitsRadius(
  previousId: RadiusIdentity,
  ctx: { top1Share: number; top3Share: number; clusterCount: number; ent: number; items: Item[]; now: number },
): boolean {
  const { top1Share, top3Share, clusterCount, ent, items, now } = ctx
  const SB = CFG.HYSTERESIS_SHARE_BAND
  const CB = CFG.HYSTERESIS_CLUSTER_BAND
  const EB = CFG.HYSTERESIS_ENTROPY_BAND

  if (previousId === 'specialist') {
    return top1Share > CFG.SPECIALIST_MIN_TOP1_SHARE - SB
        && top3Share > CFG.SPECIALIST_MIN_TOP3_SHARE - SB
        && clusterCount > 0
  }
  if (previousId === 'generalist') {
    // 严格 OR 长尾 (两条原路径都放宽)
    const looseStrict = top1Share < CFG.GENERALIST_MAX_TOP1_SHARE + SB
                     && clusterCount > CFG.GENERALIST_MIN_CLUSTER_COUNT - CB
                     && ent > CFG.GENERALIST_MIN_ENTROPY - EB
    const looseLongtail = clusterCount >= CFG.GENERALIST_LONGTAIL_MIN_CLUSTERS - CB
                       && top1Share < CFG.GENERALIST_LONGTAIL_MAX_TOP1_SHARE + SB
                       && ent >= CFG.GENERALIST_LONGTAIL_MIN_ENTROPY - EB
    return looseStrict || looseLongtail
  }
  if (previousId === 'switcher') {
    const recent30Clusters = new Set([...clusterShares(inWindow(items, 30, 0, now)).keys()])
    const prev60Clusters = new Set([...clusterShares(inWindow(items, 90, 30, now)).keys()])
    const jac = jaccard(recent30Clusters, prev60Clusters)
    return jac < CFG.SWITCHER_MAX_JACCARD + SB
        && recent30Clusters.size >= CFG.SWITCHER_MIN_CLUSTER_SIZE - CB
        && recent30Clusters.size <= CFG.SWITCHER_MAX_CLUSTER_SIZE + CB
        && prev60Clusters.size >= CFG.SWITCHER_MIN_CLUSTER_SIZE - CB
        && prev60Clusters.size <= CFG.SWITCHER_MAX_CLUSTER_SIZE + CB
  }
  return false
}

function makeCardForRadius(
  id: RadiusIdentity,
  ctx: { top1Share: number; top3Share: number; clusterCount: number; ent: number; sorted: Array<[string, number]>; total: number; confidenceMul: number },
): IdentityCard {
  const { top1Share, top3Share, clusterCount, ent, sorted, total, confidenceMul } = ctx
  if (id === 'specialist') {
    const topName = sorted[0]?.[0] ?? ''
    return makeCard('radius', 'specialist', 'SPECIALIST', '专精派',
      `你深耕在「${topName}」附近——别的方向对你来说有点远。`,
      `近 90 天 ${Math.round(top1Share * 100)}% 的注意力在 1 个主题，前 3 个占 ${Math.round(top3Share * 100)}%。`,
      0.55 * confidenceMul, 0.5 * confidenceMul)
  }
  if (id === 'generalist') {
    const top1Name = sorted[0]?.[0] ?? ''
    const top2Name = sorted[1]?.[0] ?? ''
    const top2Share = sorted[1] ? sorted[1][1] / total : 0
    return makeCard('radius', 'generalist', 'GENERALIST', '广博派',
      `你有两条主线，但又不肯只走两条——「${top1Name}」跟「${top2Name}」之外还撒了很多种子。`,
      `近 90 天 ${clusterCount} 个主题：「${top1Name}」${Math.round(top1Share * 100)}% + 「${top2Name}」${Math.round(top2Share * 100)}%，其余 ${Math.max(0, clusterCount - 2)} 个主题平摊剩下的注意力。`,
      0.5 * confidenceMul, 0.5 * confidenceMul)
  }
  // switcher
  return makeCard('radius', 'switcher', 'SWITCHER', '跳跃者',
    '你的注意力像潮汐——这阵一群主题，下阵换一群。',
    `近 30 天的主题分布跟前 60 天接近"换了一群"。`,
    0.5 * confidenceMul, 0.5 * confidenceMul)
}

// ─── 工厂函数 ───────────────────────────────────────────────

function makeCard(
  dimension: 'consumption' | 'mindset' | 'radius',
  id: ConsumptionStyle | MindsetIdentity | RadiusIdentity,
  enName: string,
  name: string,
  claim: string,
  evidence: string,
  confidence: number,
  extremity: number,  // v3.1 新增 · 极端度 0-1（用户在该维度有多突出）
): IdentityCard {
  return {
    dimension,
    id,
    name,
    enName,
    claim,
    evidence,
    confidence,
    confidenceLevel: confLevel(confidence),
    extremity: Math.max(0, Math.min(1, extremity)),  // clip to [0,1]
  }
}

/** v3.1 helper · 计算 extremity（线性插值 + clip）*/
function calcExtremity(value: number, thresholdMin: number, thresholdMax: number): number {
  if (thresholdMax === thresholdMin) return 0
  const range = thresholdMax - thresholdMin
  const normalized = (value - thresholdMin) / range
  return Math.max(0, Math.min(1, normalized))
}
