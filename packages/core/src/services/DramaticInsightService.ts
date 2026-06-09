/**
 * DramaticInsightService —— 数据反差句子生成器
 *
 * 解决问题：consumption_style Finding 只输出 "你是 XXX 型 · confidence Y%" 太干瘪；
 * Banner 数字 "真实热情率 24%" 没冲击力。
 *
 * 解决方法：把已有的 item / event / cluster 数据组合成 Spotify Wrapped 式的戏剧句子：
 *   - "你保存 487 条创业课，只看完 9 条"
 *   - "你保存的『学英语』里 73% 来自凌晨 1-3 点"
 *   - "你今年放手 156 条，其中 89 条是『不感兴趣了』"
 *
 * 详见 设计稿/Profile_变体E_融合版_隐性自我.html §2 + plan §三 工作流 2
 *
 * 文案纪律（plan §二·补）：
 *   - 活人感、温柔反讽、不评判、不学术装腔
 *   - 句法模板：[ 具体数据 ] —— [ 隐含的人性观察或轻反讽 ]
 *   - ✗ "您积压了 145 条内容" / ✓ "145 条还在等你"
 */

import type { Item, ReleaseReason } from '@chord/types'
// v3.1.25 Phase 4 · skipIllusion 从 IdentityConstraints 中心源推导
import { getConsumptionConstraint } from './IdentityConstraints.js'
import { IDENTITY_CONFIG as CFG } from './IdentityConfig.js'

const DAY = 86_400_000

/** 反差句子模板的种类 */
export type DramaticTemplate =
  | 'save_vs_process'      // 保存 N 条 X，只处理 M 条
  | 'time_concentration'   // X% 的 Y 类收藏来自 [时段]
  | 'topic_concentration'  // 你把 N% 注意力放在 X 上
  | 'release_reason_mix'   // 今年放手 N 条，M 条是『不感兴趣了』
  | 'oldest_waiting'       // 最老的保存来自 N 月前，还在等你
  | 'reality_vs_aspiration' // 你说想学 X，存了 N 条；实际打开 M 条
  // v3.1.20 新增维度
  | 'source_concentration' // 你 N% 都来自一个域名 / 平台
  | 'note_silence'         // 留下 N 条但写过私注的只 M 条
  | 'chip_distribution'    // chip 里 X% 是『启发思路』，比『用过』多 K 倍
  | 'burst_period'         // N% 的收藏都来自某个 30 天窗口
  | 'stale_topic'          // 某主题最后保存是 N 月前——可能不再是当下的你

/**
 * v3.1.20 · 跟身份的关系——决定这条意外是"加深"还是"反转"
 *   - consistent_extreme：身份预期就是这样，但程度比想象夸张（"果然是 HOARDER——但 14 个月没动一条，比想象的远"）
 *   - contrast：跟身份预期相反（"你说自己保存即用，但 27 条没动过"）
 *   - neutral：没强对比角度，单纯展示数字
 */
export type SurpriseAngle = 'consistent_extreme' | 'contrast' | 'neutral'

/** 单条反差洞察 */
export interface DramaticInsight {
  template: DramaticTemplate
  /** 用户看到的句子（已填好数据）*/
  text: string
  /** 触发力评分 0-1：用于排序展示——同样符合触发条件的句子里，挑反差最大的优先 */
  drama: number
  /** 可选：相关 cluster 名（如果这条洞察跟某主题相关）*/
  cluster?: string
  /** 可选：诗意尾巴——温柔反讽 + 留白，展示在 text 下方 */
  quiet?: string
  /** v3.1.20 · 跟当前 consumption 身份的关系（一致加深 / 反差反转 / 中性）*/
  surpriseAngle?: SurpriseAngle
  /** v3.1.20 · 一句话点出跟身份的呼应——展示在 text 下方代替 quiet（如果有）*/
  identityHook?: string
}

export interface DramaticInsightInput {
  items: Item[]
  /** itemId → 90 天访问次数（来自 chrome.history），可选 */
  visitCounts?: Map<string, number>
  /** 当前时间戳，默认 Date.now()；测试可注入 */
  now?: number
  /**
   * v3.1.14 · 身份 hint —— 按消费风格身份跳某些跟人设矛盾的 template
   * 例: SLOW_READER 人设是"等你准备好"，不该说"一次都没真的点开过"
   */
  consumptionId?: string
}

// ─── 主入口 ─────────────────────────────────────────────

/**
 * 从用户数据里挖出所有能触发的戏剧句子，按 drama 降序返回。
 * 调用方可以取 top N 嵌入 Profile UI（如 banner narrative / Finding evidence）。
 */
export function generateDramaticInsights(input: DramaticInsightInput): DramaticInsight[] {
  const { items, visitCounts, now = Date.now(), consumptionId } = input
  const contentItems = items.filter((i) => i.type === 'content')
  if (contentItems.length < CFG.DRAMATIC_MIN_TOTAL_ITEMS) return []

  // v3.1.25 Phase 4 · skipIllusion 从 IdentityConstraints 中心源推导
  //   规则：当 consumption 的 bannedAngles 含"完全没读" / "没真的看" / "基本没看过" 这类词时 skip
  //   覆盖：SLOW_READER / EXECUTOR / CURATOR / THINKER / MINIMALIST 都有这类词
  const constraint = consumptionId ? getConsumptionConstraint(consumptionId) : null
  const skipIllusion = constraint
    ? constraint.bannedAngles.some((a) =>
        a.includes('完全没读') || a.includes('没真的看') || a.includes('基本没看') || a.includes('收藏如山却未触及'),
      )
    : false

  const insights: DramaticInsight[] = []

  const saveVsProcess = templateSaveVsProcess(contentItems, consumptionId)
  if (saveVsProcess) insights.push(saveVsProcess)

  const topicConc = templateTopicConcentration(contentItems, consumptionId)
  if (topicConc) insights.push(topicConc)

  const oldest = templateOldestWaiting(contentItems, now, consumptionId)
  if (oldest) insights.push(oldest)

  const releaseMix = templateReleaseReasonMix(contentItems, now)
  if (releaseMix) insights.push(releaseMix)

  const timeConc = templateTimeConcentration(contentItems)
  if (timeConc) insights.push(timeConc)

  if (!skipIllusion) {
    const realityVsAsp = templateRealityVsAspiration(contentItems, visitCounts)
    if (realityVsAsp) insights.push(realityVsAsp)
  }

  // v3.1.20 新增 4 个模板（覆盖新维度）
  const sourceConc = templateSourceConcentration(contentItems, consumptionId)
  if (sourceConc) insights.push(sourceConc)

  const noteSilence = templateNoteSilence(contentItems, consumptionId)
  if (noteSilence) insights.push(noteSilence)

  const chipDist = templateChipDistribution(contentItems, consumptionId)
  if (chipDist) insights.push(chipDist)

  const burst = templateBurstPeriod(contentItems, now)
  if (burst) insights.push(burst)

  const stale = templateStaleTopic(contentItems, now, consumptionId)
  if (stale) insights.push(stale)

  // v3.1.20 · 多样性约束：避免 top 2 都来自同一"主题/积压"类
  //   - 积压类：save_vs_process / oldest_waiting / reality_vs_aspiration
  //   - 排序时给同类后续条目降权 0.2 分
  const sorted = insights.sort((a, b) => b.drama - a.drama)
  return diversifyInsights(sorted)
}

/**
 * v3.1.20 · 多样性 re-rank：避免 top 2 都是"积压型"或同维度
 * 算法：保留最强一条，后续同类降权 0.25，再排序
 */
function diversifyInsights(insights: DramaticInsight[]): DramaticInsight[] {
  if (insights.length <= 1) return insights
  const FAMILY: Record<string, string> = {
    save_vs_process: 'backlog',
    oldest_waiting: 'backlog',
    reality_vs_aspiration: 'backlog',
    stale_topic: 'backlog',
    topic_concentration: 'distribution',
    source_concentration: 'distribution',
    time_concentration: 'behavior',
    chip_distribution: 'behavior',
    release_reason_mix: 'behavior',
    note_silence: 'inner',
    burst_period: 'temporal',
  }
  const seenFamily = new Set<string>()
  const reranked = insights.map((ins, idx) => {
    if (idx === 0) {
      seenFamily.add(FAMILY[ins.template] ?? 'other')
      return ins
    }
    const fam = FAMILY[ins.template] ?? 'other'
    const penalty = seenFamily.has(fam) ? 0.25 : 0
    seenFamily.add(fam)
    return { ...ins, drama: Math.max(0, ins.drama - penalty) }
  })
  return reranked.sort((a, b) => b.drama - a.drama)
}

// ─── 模板 1：保存 vs 处理反差 ───────────────────────────

/**
 * 触发：某个 cluster 保存 ≥ 10 条且处理率 < 15%。
 * Drama 与"保存量大、处理率低"成正比。
 *
 * 例：「你存了 27 条『学英语』，最早从 14 个月前到上周——没一条让你真的开口说。」
 */
function templateSaveVsProcess(items: Item[], consumptionId?: string): DramaticInsight | null {
  const buckets = new Map<string, { saved: number; processed: number; oldest: number }>()
  for (const i of items) {
    if (!i.cluster) continue
    const b = buckets.get(i.cluster) ?? { saved: 0, processed: 0, oldest: Infinity }
    b.saved++
    if (i.status !== 'pending') b.processed++
    b.oldest = Math.min(b.oldest, i.savedAt)
    buckets.set(i.cluster, b)
  }

  let best: { cluster: string; saved: number; processed: number; oldest: number; rate: number } | null = null
  for (const [cluster, b] of buckets) {
    if (b.saved < CFG.DRAMA_SAVE_VS_PROCESS_MIN_CLUSTER) continue
    const rate = b.processed / b.saved
    if (rate >= CFG.DRAMA_SAVE_VS_PROCESS_MAX_RATE) continue
    if (!best || (1 - rate) * b.saved > (1 - best.rate) * best.saved) {
      best = { cluster, ...b, rate }
    }
  }
  if (!best) return null

  const oldestMonths = Math.floor((Date.now() - best.oldest) / DAY / 30)
  const monthsLine = oldestMonths >= 2 ? `，最早从 ${oldestMonths} 个月前到上周` : ''

  // v3.1.20 · 按身份 hook
  //   HOARDER → 一致加深（"果然是图书馆，但比想象的还远"）
  //   EXECUTOR / SLOW_READER / CURATOR → 反差（"说自己 X，却有 N 条没动"）
  //   THINKER → 反差（"想滋养想法，但思想原料堆着没翻"）
  //   MINIMALIST / BALANCED → neutral
  let surpriseAngle: SurpriseAngle = 'neutral'
  let identityHook: string | undefined
  if (consumptionId === 'hoarder') {
    surpriseAngle = 'consistent_extreme'
    identityHook = `图书馆是真的——但「${best.cluster}」这一整层落了灰。`
  } else if (consumptionId === 'executor') {
    surpriseAngle = 'contrast'
    identityHook = `你说你保存即用——这一类是例外，等了 ${oldestMonths || '几'} 个月还没动。`
  } else if (consumptionId === 'slow_reader' || consumptionId === 'curator' || consumptionId === 'thinker') {
    surpriseAngle = 'contrast'
    identityHook = '不是没时间品——是这一类被你跳过了。'
  }

  return {
    template: 'save_vs_process',
    text: `你存了 ${best.saved} 条「${best.cluster}」${monthsLine}——只动过 ${best.processed} 条。`,
    drama: Math.min(1, (1 - best.rate) * Math.log10(best.saved + 1)),
    cluster: best.cluster,
    quiet: identityHook ? undefined : '保存比阅读容易得多——这件事大概所有人都懂。',
    surpriseAngle,
    identityHook,
  }
}

// ─── 模板 2：主题集中度反差 ──────────────────────────────

/**
 * 触发：top 1 cluster 占总保存 ≥ 30%。
 * Drama 与"集中度高"成正比。
 *
 * 例：「你 38% 的注意力都给了『AI 工具』——比其他 22 个主题加起来还多。」
 */
function templateTopicConcentration(items: Item[], consumptionId?: string): DramaticInsight | null {
  const total = items.length
  if (total < CFG.DRAMA_TOPIC_MIN_TOTAL) return null

  const buckets = new Map<string, number>()
  for (const i of items) {
    if (!i.cluster) continue
    buckets.set(i.cluster, (buckets.get(i.cluster) ?? 0) + 1)
  }
  if (buckets.size < CFG.DRAMA_TOPIC_MIN_CLUSTER_COUNT) return null

  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1])
  const [topName, topCount] = sorted[0]!
  const topShare = topCount / total
  if (topShare < CFG.DRAMA_TOPIC_MIN_TOP_SHARE) return null

  const restCount = total - topCount
  const restClusterCount = sorted.length - 1

  // v3.1.20 · 集中度 + 身份
  //   EXECUTOR / SLOW_READER → consistent_extreme（"果然专注，但 X% 比想象的还集中"）
  //   HOARDER / THINKER 这种"博""杂"画像 → contrast（"看起来什么都存，但 X% 都在一个主题上"）
  let surpriseAngle: SurpriseAngle = 'neutral'
  let identityHook: string | undefined
  if (consumptionId === 'executor' || consumptionId === 'slow_reader') {
    surpriseAngle = 'consistent_extreme'
    identityHook = '专注是真的——但没想到这么集中在一处。'
  } else if (consumptionId === 'hoarder' || consumptionId === 'thinker') {
    surpriseAngle = 'contrast'
    identityHook = `看上去什么都存——可有 ${Math.round(topShare * 100)}% 都在「${topName}」一边。`
  }

  return {
    template: 'topic_concentration',
    text: `你 ${Math.round(topShare * 100)}% 的注意力都给了「${topName}」——比其他 ${restClusterCount} 个主题加起来（${restCount} 条）还重。`,
    drama: Math.min(1, (topShare - 0.3) * 2),
    cluster: topName,
    quiet: identityHook ? undefined : '看你在哪里花时间，比问你在乎什么诚实。',
    surpriseAngle,
    identityHook,
  }
}

// ─── 模板 3：最老的还在等 ───────────────────────────────

/**
 * 触发：pending status 的 item 中，savedAt 距今 > 6 个月。
 * Drama 与"年龄 + 数量"成正比。
 *
 * 例：「最老的一条收藏来自 14 个月前——它还在等你。」
 */
function templateOldestWaiting(items: Item[], now: number, consumptionId?: string): DramaticInsight | null {
  const pending = items.filter((i) => i.status === 'pending')
  if (pending.length < CFG.DRAMA_OLDEST_MIN_PENDING) return null

  const oldest = pending.reduce((min, i) => Math.min(min, i.savedAt), Infinity)
  const ageMonths = Math.floor((now - oldest) / DAY / 30)
  if (ageMonths < CFG.DRAMA_OLDEST_MIN_AGE_MONTHS) return null

  const veryOld = pending.filter((i) => i.savedAt < now - 365 * DAY).length
  const oldLine = veryOld >= 3 ? `——其中 ${veryOld} 条已经等了一年多。` : '——它还在等你。'

  // v3.1.20 · 身份 hook
  let surpriseAngle: SurpriseAngle = 'neutral'
  let identityHook: string | undefined
  if (consumptionId === 'hoarder') {
    surpriseAngle = 'consistent_extreme'
    identityHook = veryOld >= 3
      ? `这 ${veryOld} 条早就过了"以后看"——但你也舍不得放。`
      : undefined
  } else if (consumptionId === 'executor' || consumptionId === 'slow_reader') {
    surpriseAngle = 'contrast'
    identityHook = '你不是在拖——是它们悄悄掉进了"以后再说"那层。'
  }

  return {
    template: 'oldest_waiting',
    text: `${pending.length} 条还在等你${oldLine === '——它还在等你。' ? '，最老的来自 ' + ageMonths + ' 个月前' : ''}${oldLine}`,
    drama: Math.min(1, ageMonths / 24),
    quiet: identityHook ? undefined : '它们不催你，但每次想起都有一点重量。',
    surpriseAngle,
    identityHook,
  }
}

// ─── 模板 4：放手原因分布反差 ────────────────────────────

/**
 * 触发：最近 90 天 release ≥ 5 条且某 reason 占 ≥ 40%。
 * Drama 与"reason 集中度"成正比。
 *
 * 例：「今年放手了 156 条——89 条是『不感兴趣了』。」
 */
function templateReleaseReasonMix(items: Item[], now: number): DramaticInsight | null {
  const recentReleased = items.filter(
    (i) =>
      i.status === 'released' &&
      i.processedAt &&
      i.processedAt >= now - CFG.DRAMA_RELEASE_WINDOW_DAYS * DAY,
  )
  if (recentReleased.length < CFG.DRAMA_RELEASE_MIN_COUNT) return null

  const reasonCount: Record<string, number> = {}
  for (const i of recentReleased) {
    if (!i.releaseReason) continue
    reasonCount[i.releaseReason] = (reasonCount[i.releaseReason] ?? 0) + 1
  }
  const total = Object.values(reasonCount).reduce((s, n) => s + n, 0)
  if (total < CFG.DRAMA_RELEASE_MIN_COUNT) return null

  const sorted = Object.entries(reasonCount).sort((a, b) => b[1] - a[1])
  const [topReason, topCount] = sorted[0]!
  const topShare = topCount / total
  if (topShare < CFG.DRAMA_RELEASE_MIN_SHARE) return null

  const reasonLabel: Record<ReleaseReason, string> = {
    used: '已经用过了',
    not_interested: '不感兴趣了',
    misjudged: '当时存错了',
    replaced: '找到更好的了',
    no_time: '没时间看了',
    custom: '说不清原因',
  }
  const label = reasonLabel[topReason as ReleaseReason] ?? topReason

  return {
    template: 'release_reason_mix',
    text: `近 90 天放手了 ${recentReleased.length} 条——其中 ${topCount} 条是『${label}』。`,
    drama: Math.min(1, topShare),
    quiet: '放手不容易——能说出原因，已经是一种成长。',
  }
}

// ─── 模板 5：时间分布反差 ────────────────────────────────

/**
 * 触发：某 cluster 保存 ≥ 8 条，且 ≥ 50% 集中在某时段（深夜 / 工作时间 / 周末）。
 * Drama 与"时段集中 + cluster 数量"成正比。
 *
 * 例：「你保存的『AI 工具』里 73% 来自凌晨 1-3 点。」
 */
function templateTimeConcentration(items: Item[]): DramaticInsight | null {
  const buckets = new Map<string, { total: number; lateNight: number; workHours: number; weekend: number }>()
  for (const i of items) {
    if (!i.cluster) continue
    const d = new Date(i.savedAt)
    const hour = d.getHours()
    const dayOfWeek = d.getDay()  // 0=Sun, 6=Sat

    const b = buckets.get(i.cluster) ?? { total: 0, lateNight: 0, workHours: 0, weekend: 0 }
    b.total++
    if (hour >= 1 && hour < 5) b.lateNight++
    if (hour >= 9 && hour < 19 && dayOfWeek >= 1 && dayOfWeek <= 5) b.workHours++
    if (dayOfWeek === 0 || dayOfWeek === 6) b.weekend++
    buckets.set(i.cluster, b)
  }

  let best: { cluster: string; label: string; rate: number; count: number; total: number } | null = null
  for (const [cluster, b] of buckets) {
    if (b.total < CFG.DRAMA_TIME_MIN_CLUSTER_SIZE) continue
    const candidates = [
      { label: '凌晨 1-5 点', count: b.lateNight, rate: b.lateNight / b.total },
      { label: '工作时间', count: b.workHours, rate: b.workHours / b.total },
      { label: '周末', count: b.weekend, rate: b.weekend / b.total },
    ]
    for (const c of candidates) {
      if (c.rate < CFG.DRAMA_TIME_MIN_SHARE) continue
      if (!best || c.rate > best.rate) {
        best = { cluster, label: c.label, rate: c.rate, count: c.count, total: b.total }
      }
    }
  }
  if (!best) return null

  return {
    template: 'time_concentration',
    text: `你保存的「${best.cluster}」里 ${Math.round(best.rate * 100)}% 来自${best.label}。`,
    drama: Math.min(1, (best.rate - 0.5) * 2),
    cluster: best.cluster,
    quiet: best.label === '凌晨 1-5 点'
      ? '那个时间的你以为白天的你会感谢——白天的你点进收藏夹然后又关掉了。'
      : best.label === '周末'
        ? '工作日太忙、周末才有空收集——这是大多数人保存的节奏。'
        : '工作时间的保存往往是逃避当下任务的小动作。',
  }
}

// ─── 模板 6：真实 vs 渴望（基于 visitCount）────────────────

/**
 * 触发：某 cluster 保存 ≥ 8 条但 visitCount 全是 0；或保存少但 visitCount 高（隐藏热情）。
 * 没 visitCount → 返回 null。
 *
 * 例：「你存了 27 条『早起方法』，没一条你真的点开过——但你存的 5 条诗，每条平均访问 18 次。」
 */
function templateRealityVsAspiration(
  items: Item[],
  visitCounts: Map<string, number> | undefined,
): DramaticInsight | null {
  if (!visitCounts || visitCounts.size === 0) return null

  // 找：保存多 + 0 访问 + 没标"实际用到了"的"幻觉热情" cluster
  // v3.1.9 修：之前只看 visits=0 → 跟 EXECUTOR 身份冲突（用户标了"实际用到了"但 Chrome 没记 visit）
  // 现在加 chip 信号：cluster 内"实际用到了" rate ≥ 20% 就不算"幻觉"——用户自己说用过就该信
  const buckets = new Map<string, { saved: number; visits: number; itemsCount: number; usedChips: number }>()
  for (const i of items) {
    if (!i.cluster) continue
    const visits = visitCounts.get(i.id) ?? 0
    const b = buckets.get(i.cluster) ?? { saved: 0, visits: 0, itemsCount: 0, usedChips: 0 }
    b.saved++
    b.visits += visits
    b.itemsCount++
    if (i.usageChip === '实际用到了') b.usedChips++
    buckets.set(i.cluster, b)
  }

  // 幻觉热情：saved >= 8 + visits = 0 + 没主动标"实际用到了"（chip rate < 20%）
  let illusion: { cluster: string; saved: number } | null = null
  for (const [cluster, b] of buckets) {
    const usedRate = b.saved > 0 ? b.usedChips / b.saved : 0
    if (b.saved >= CFG.DRAMA_ILLUSION_MIN_SAVED && b.visits === 0 && usedRate < CFG.DRAMA_ILLUSION_MAX_USED_RATE) {
      if (!illusion || b.saved > illusion.saved) illusion = { cluster, saved: b.saved }
    }
  }
  // 真实热情：saved 较少（<= 8）但 visits / saved >= 5
  let real: { cluster: string; saved: number; avgVisits: number } | null = null
  for (const [cluster, b] of buckets) {
    if (b.saved <= 8 && b.saved >= 2 && b.visits / b.saved >= 5) {
      const avgVisits = b.visits / b.saved
      if (!real || avgVisits > real.avgVisits) real = { cluster, saved: b.saved, avgVisits }
    }
  }

  if (illusion && real) {
    return {
      template: 'reality_vs_aspiration',
      text: `你存了 ${illusion.saved} 条「${illusion.cluster}」，一次都没真的点开过——但你存的 ${real.saved} 条「${real.cluster}」，每条平均被翻 ${Math.round(real.avgVisits)} 次。`,
      drama: 0.95,
      cluster: real.cluster,
      quiet: '你真正在意的东西，从不需要被收藏提醒。',
    }
  }
  if (illusion) {
    return {
      template: 'reality_vs_aspiration',
      text: `你存了 ${illusion.saved} 条「${illusion.cluster}」——一次都没真的点开过。`,
      drama: 0.7,
      cluster: illusion.cluster,
      quiet: '收藏的瞬间，已经替你完成了一部分"我会去做"。',
    }
  }
  return null
}

// ─── v3.1.20 新增模板 ───────────────────────────────────────

// ─── 模板 7：保存来源集中度 ──────────────────────────────────

/**
 * 触发：top 1 sourceDomain 占总保存 ≥ 35%。
 *
 * 例：「你 47% 的收藏都来自 twitter.com——但 Twitter 不是阅读，是滑动。」
 */
function templateSourceConcentration(items: Item[], consumptionId?: string): DramaticInsight | null {
  if (items.length < CFG.DRAMA_SOURCE_MIN_TOTAL) return null

  const buckets = new Map<string, number>()
  for (const i of items) {
    if (!i.sourceDomain) continue
    buckets.set(i.sourceDomain, (buckets.get(i.sourceDomain) ?? 0) + 1)
  }
  if (buckets.size < CFG.DRAMA_SOURCE_MIN_BUCKETS) return null

  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1])
  const [topDomain, topCount] = sorted[0]!
  const share = topCount / items.length
  if (share < CFG.DRAMA_SOURCE_MIN_SHARE) return null

  // 媒介属性 → 影响 hook 措辞
  const SHORT_FORM_DOMAINS = ['twitter.com', 'x.com', 'weibo.com', 'jike.com', 'douyin.com', 'xhs.com']
  const LONG_FORM_DOMAINS = ['medium.com', 'substack.com', 'mp.weixin.qq.com', 'zhihu.com', 'bilibili.com']
  const isShortForm = SHORT_FORM_DOMAINS.some((d) => topDomain.includes(d.split('.')[0]!))
  const isLongForm = LONG_FORM_DOMAINS.some((d) => topDomain.includes(d.split('.')[0]!))

  // tail：媒介风味
  const mediaTail = isShortForm
    ? '——而那里不是阅读，是滑动。'
    : isLongForm
      ? '。'
      : '。'

  // identity hook
  let surpriseAngle: SurpriseAngle = 'neutral'
  let identityHook: string | undefined
  if (consumptionId === 'thinker' && isShortForm) {
    surpriseAngle = 'contrast'
    identityHook = '想滋养想法——但素材大多是短碎的瞬间。'
  } else if (consumptionId === 'curator' && isShortForm) {
    surpriseAngle = 'contrast'
    identityHook = '门槛是真的——但流入口很短很快。'
  } else if (consumptionId === 'executor' && isLongForm) {
    surpriseAngle = 'consistent_extreme'
    identityHook = '保存即用——你只从能展开读的地方拿东西。'
  }

  return {
    template: 'source_concentration',
    text: `你 ${Math.round(share * 100)}% 的收藏都来自「${topDomain}」${mediaTail}`,
    drama: Math.min(1, (share - 0.35) * 2.5),
    quiet: identityHook ? undefined : '保存的来源比保存什么更说明你这阵子在哪。',
    surpriseAngle,
    identityHook,
  }
}

// ─── 模板 8：私注密度反差 ───────────────────────────────────

/**
 * 触发：kept ≥ 20 且 privateNote 占比 < 5% 或 > 25%。
 *
 * 例 1 反差：「你留下了 145 条，写过一句话的只有 3 条——你跟自己的内心是有距离的。」
 * 例 2 加深：「你留下了 38 条，给 24 条都写了私注——你在跟自己对话。」
 */
function templateNoteSilence(items: Item[], consumptionId?: string): DramaticInsight | null {
  const kept = items.filter((i) => i.status === 'kept' || i.status === 'used')
  if (kept.length < CFG.DRAMA_NOTE_MIN_KEPT) return null

  const noted = kept.filter((i) => !!i.privateNote && i.privateNote.trim().length > 0)
  const rate = noted.length / kept.length

  // 静默型
  if (rate < CFG.DRAMA_NOTE_LOW_RATE) {
    let surpriseAngle: SurpriseAngle = 'neutral'
    let identityHook: string | undefined
    if (consumptionId === 'thinker') {
      surpriseAngle = 'contrast'
      identityHook = '想滋养想法——可是没写下来过。'
    } else if (consumptionId === 'curator') {
      surpriseAngle = 'contrast'
      identityHook = '挑得很严——挑完就放在那里了。'
    } else if (consumptionId === 'executor' || consumptionId === 'hoarder') {
      surpriseAngle = 'consistent_extreme'
      identityHook = '你跟这些内容的关系是行动，不是对话。'
    }
    return {
      template: 'note_silence',
      text: `你留下了 ${kept.length} 条——写过一句话的只有 ${noted.length} 条。`,
      drama: Math.min(1, 0.5 + (kept.length / 200)),
      // v3.1.24 "看见但不命名——没有变成你的话" 比喻链太长。改具体动作。
      quiet: identityHook ? undefined : '点收藏的瞬间只是"我以后要看"——给它写一句话，才是真的让它进来。',
      surpriseAngle,
      identityHook,
    }
  }

  // 对话型（高密度）
  if (rate >= CFG.DRAMA_NOTE_HIGH_RATE) {
    let surpriseAngle: SurpriseAngle = 'neutral'
    let identityHook: string | undefined
    if (consumptionId === 'thinker') {
      surpriseAngle = 'consistent_extreme'
      identityHook = '不是收藏家——你在跟每一条对话。'
    } else if (consumptionId === 'executor') {
      surpriseAngle = 'contrast'
      identityHook = '不只是用——你还要让自己记得为什么用。'
    }
    return {
      template: 'note_silence',
      text: `你留下了 ${kept.length} 条——其中 ${noted.length} 条你写过自己的话。`,
      drama: Math.min(1, 0.5 + rate),
      // v3.1.24 同款简化
      quiet: identityHook ? undefined : '一条收藏 + 一句你写的话——这条内容才真的属于你。',
      surpriseAngle,
      identityHook,
    }
  }

  return null
}

// ─── 模板 9：Chip 分布反差 ──────────────────────────────────

/**
 * 触发：有 chip 的 item ≥ 15 条且某 chip 占比 ≥ 50%。
 *
 * 例：「你打的 chip 里 73% 都是『启发思路』——比『实际用到了』多 3 倍。」
 */
function templateChipDistribution(items: Item[], consumptionId?: string): DramaticInsight | null {
  const chipped = items.filter((i) => !!i.usageChip)
  if (chipped.length < CFG.DRAMA_CHIP_MIN_CHIPPED) return null

  const chipCount: Record<string, number> = {}
  for (const i of chipped) {
    const c = i.usageChip!
    chipCount[c] = (chipCount[c] ?? 0) + 1
  }
  const sorted = Object.entries(chipCount).sort((a, b) => b[1] - a[1])
  const [topChip, topN] = sorted[0]!
  const share = topN / chipped.length
  if (share < CFG.DRAMA_CHIP_MIN_SHARE) return null

  // 第二位用来对比"多 K 倍"
  const second = sorted[1]
  const multiplierLine = second && second[1] > 0
    ? `——比『${second[0]}』多 ${(topN / second[1]).toFixed(1)} 倍。`
    : '。'

  let surpriseAngle: SurpriseAngle = 'neutral'
  let identityHook: string | undefined
  if (topChip === '启发思路') {
    if (consumptionId === 'thinker') {
      surpriseAngle = 'consistent_extreme'
      identityHook = '你存的不是答案，是触发——这件事看得很清楚。'
    } else if (consumptionId === 'executor') {
      surpriseAngle = 'contrast'
      identityHook = '说自己保存即用——可你真正留下来的是想法，不是工具。'
    }
  } else if (topChip === '实际用到了') {
    if (consumptionId === 'executor') {
      surpriseAngle = 'consistent_extreme'
      identityHook = '行动型是真的——但比想象的还纯粹。'
    } else if (consumptionId === 'thinker' || consumptionId === 'curator') {
      surpriseAngle = 'contrast'
      identityHook = '你以为自己在收集——其实你在动手。'
    }
  } else if (topChip === '仅此一读，够了') {
    if (consumptionId === 'curator') {
      surpriseAngle = 'consistent_extreme'
      identityHook = '门槛是真的——读一遍就放下，不囤。'
    }
  }

  return {
    template: 'chip_distribution',
    text: `你打过的 chip 里 ${Math.round(share * 100)}% 都是『${topChip}』${multiplierLine}`,
    drama: Math.min(1, (share - 0.5) * 2),
    // v3.1.24 "你怎么标，比你存什么..." 句子缺主语难解析。改成具体陈述。
    quiet: identityHook ? undefined : 'chip 是你主动盖的章——它比"你存了什么"更直接告诉你跟内容是什么关系。',
    surpriseAngle,
    identityHook,
  }
}

// ─── 模板 10：爆发期反差 ────────────────────────────────────

/**
 * 触发：某连续 30 天窗口的保存量 ≥ 总量的 30%。
 * 用滚动窗口找最密集的 30 天。
 *
 * 例：「你 42% 的收藏都来自 2025 年 3 月——那一个月发生了什么？」
 */
function templateBurstPeriod(items: Item[], now: number): DramaticInsight | null {
  if (items.length < CFG.DRAMA_BURST_MIN_TOTAL) return null
  const sortedByTime = [...items].sort((a, b) => a.savedAt - b.savedAt)
  const earliest = sortedByTime[0]!.savedAt
  const span = now - earliest
  if (span < CFG.DRAMA_BURST_MIN_SPAN_DAYS * DAY) return null

  // 滚动 30 天窗口
  let bestStart = 0
  let bestCount = 0
  for (let i = 0; i < sortedByTime.length; i++) {
    const winStart = sortedByTime[i]!.savedAt
    const winEnd = winStart + 30 * DAY
    let count = 0
    for (let j = i; j < sortedByTime.length; j++) {
      if (sortedByTime[j]!.savedAt > winEnd) break
      count++
    }
    if (count > bestCount) {
      bestCount = count
      bestStart = winStart
    }
  }

  const share = bestCount / items.length
  if (share < CFG.DRAMA_BURST_MIN_SHARE) return null

  const startDate = new Date(bestStart)
  const monthLabel = `${startDate.getFullYear()} 年 ${startDate.getMonth() + 1} 月`
  const monthsAgo = Math.floor((now - bestStart) / DAY / 30)
  if (monthsAgo < CFG.DRAMA_BURST_MIN_MONTHS_AGO) return null

  return {
    template: 'burst_period',
    text: `你 ${Math.round(share * 100)}% 的收藏都来自 ${monthLabel} 那 30 天——那一个月你在追什么？`,
    drama: Math.min(1, (share - 0.3) * 2),
    quiet: '一段时间的密集保存，常常对应一段时间里你最焦虑或最热情的状态。',
  }
}

// ─── 模板 11：沉默主题 ──────────────────────────────────────

/**
 * 触发：某主题历史保存 ≥ 10 条，但最近一条距今 ≥ 6 个月。
 *
 * 例：「『学日语』最后一条保存是 17 个月前——可能不再是当下的你。」
 */
function templateStaleTopic(items: Item[], now: number, consumptionId?: string): DramaticInsight | null {
  const buckets = new Map<string, { count: number; latest: number }>()
  for (const i of items) {
    if (!i.cluster) continue
    const b = buckets.get(i.cluster) ?? { count: 0, latest: 0 }
    b.count++
    b.latest = Math.max(b.latest, i.savedAt)
    buckets.set(i.cluster, b)
  }

  let best: { cluster: string; count: number; monthsAgo: number } | null = null
  for (const [cluster, b] of buckets) {
    if (b.count < CFG.DRAMA_STALE_MIN_CLUSTER_SIZE) continue
    const monthsAgo = Math.floor((now - b.latest) / DAY / 30)
    if (monthsAgo < CFG.DRAMA_STALE_MIN_MONTHS) continue
    if (!best || monthsAgo * Math.log10(b.count + 1) > best.monthsAgo * Math.log10(best.count + 1)) {
      best = { cluster, count: b.count, monthsAgo }
    }
  }
  if (!best) return null

  let surpriseAngle: SurpriseAngle = 'neutral'
  let identityHook: string | undefined
  if (consumptionId === 'hoarder') {
    surpriseAngle = 'consistent_extreme'
    identityHook = '你不删——但这一类，你已经悄悄地放下了。'
  } else if (consumptionId === 'returner' || consumptionId === 'thinker') {
    surpriseAngle = 'contrast'
    identityHook = '回看时也许愿意承认——这件事跟当下的你已经不太相关。'
  }

  return {
    template: 'stale_topic',
    text: `「${best.cluster}」你存过 ${best.count} 条——但最后一条是 ${best.monthsAgo} 个月前。`,
    drama: Math.min(1, best.monthsAgo / 18),
    cluster: best.cluster,
    quiet: identityHook ? undefined : '不是放手——是悄悄离开。可能不再是当下的你。',
    surpriseAngle,
    identityHook,
  }
}
