/**
 * BehavioralChangeService —— §4「你正在变成另一个人」的多维度变化检测
 *
 * v3.1.2 设计：把 §4 从"主题搬家"单一信号扩展到多维度行为变化
 *
 * 检测维度（v1 共 4 类，未来可扩到时段/release reason 等）：
 *   1. topic_migration   — 主题保存量在过去 90 天的迁移（rising / falling）
 *   2. process_rate_change — 处理率近期 vs 历史的变化（变积极 / 变拖延）
 *   3. chip_shift        — chip 偏好的分布变化（如从"实际用到了"转向"启发思路"）
 *   4. stability         — 主题集合长期稳定，几乎没在变（一种特殊的"信号"）
 *
 * 每个检测器输出 ChangeSignal：
 *   - kind: 信号类型
 *   - title: 该信号对应的段标题（如"你正在变成另一个人"/"你在长出新的一面"）
 *   - narrative: 一句话叙述，含具体数据
 *   - magnitude: 0-1，用于跨信号排序（越大表示变化越显著）
 *   - data: 可选附加数据（如曲线、分布），UI 决定如何渲染
 *
 * 调用方（Profile.tsx §4）：
 *   - 取 top 1 信号决定段标题
 *   - 列出 top 2-3 信号叙述
 *   - 全部 magnitude < 0.2 → 说明"你这一阵没在变"
 */

import type { Item } from '@chord/types'
import { IDENTITY_CONFIG as CFG } from './IdentityConfig.js'

const DAY = 86_400_000

// ─── 公共数据类型 ───────────────────────────────────

export type ChangeKind =
  | 'topic_migration'
  | 'process_rate_change'
  | 'chip_shift'
  | 'stability'

export interface ChangeSignal {
  kind: ChangeKind
  /** 该信号对应的段标题（如"你正在变成另一个人"）*/
  title: string
  /** 一句话叙述，含具体数据 */
  narrative: string
  /** 0-1，跨信号排序用 */
  magnitude: number
  /** 可选附加数据，按 kind 类型决定结构（UI 自行解释）*/
  data?: Record<string, unknown>
}

export interface ChangeDetectionInput {
  items: Item[]
  now?: number
}

// ─── 主入口 ─────────────────────────────────────────

/**
 * 检测用户行为的多维度变化信号。
 *
 * @returns 按 magnitude 倒序排列的信号数组。空数组表示数据不足。
 */
export function detectChanges(input: ChangeDetectionInput): ChangeSignal[] {
  const { items, now = Date.now() } = input

  const signals: ChangeSignal[] = []

  // 各检测器独立调用，失败/数据不足返回 null
  const topicSig = detectTopicMigration(items, now)
  if (topicSig) signals.push(topicSig)

  const processSig = detectProcessRateChange(items, now)
  if (processSig) signals.push(processSig)

  const chipSig = detectChipShift(items, now)
  if (chipSig) signals.push(chipSig)

  const stabilitySig = detectStability(items, now)
  if (stabilitySig) signals.push(stabilitySig)

  // 按 magnitude 倒序
  return signals.sort((a, b) => b.magnitude - a.magnitude)
}

// ─── 检测器 1: topic_migration ────────────────────

/** 主题保存量在过去 90 天的迁移：rising / falling / 搬家 */
export function detectTopicMigration(items: Item[], now: number): ChangeSignal | null {
  const startTs = now - 90 * DAY
  const recent = items.filter((i) => i.savedAt >= startTs && i.cluster)
  if (recent.length < 5) return null

  // top 4 cluster
  const counts = new Map<string, number>()
  for (const i of recent) counts.set(i.cluster!, (counts.get(i.cluster!) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  if (top.length < 2) return null

  // 9 buckets × 10 天，算每个 cluster 的 trend
  const buckets = 9
  type Curve = { cluster: string; series: number[]; total: number; trend: 'rising' | 'falling' | 'flat' }
  const curves: Curve[] = []
  for (const [cluster, total] of top) {
    const series = new Array(buckets).fill(0)
    for (const i of recent) {
      if (i.cluster !== cluster) continue
      const daysAgo = (now - i.savedAt) / DAY
      const bucketIdx = Math.min(buckets - 1, Math.floor((90 - daysAgo) / 10))
      if (bucketIdx >= 0) series[bucketIdx]++
    }
    const recent3 = series.slice(6).reduce((s, n) => s + n, 0)
    const prev6 = series.slice(0, 3).reduce((s, n) => s + n, 0)
    const trend: 'rising' | 'falling' | 'flat' =
      recent3 > prev6 * 1.5 ? 'rising'
      : recent3 < prev6 * 0.4 ? 'falling'
      : 'flat'
    curves.push({ cluster, series, total, trend })
  }

  const risingCurves = curves.filter((c) => c.trend === 'rising')
  const fallingCurves = curves.filter((c) => c.trend === 'falling')
  const flatCurves = curves.filter((c) => c.trend === 'flat')

  // 计算 magnitude: rising/falling cluster 占比 × 单条最大变化幅度
  const changingShare = (risingCurves.length + fallingCurves.length) / curves.length
  const maxAmplitude = curves.reduce((max, c) => {
    const r3 = c.series.slice(6).reduce((s, n) => s + n, 0)
    const p6 = c.series.slice(0, 3).reduce((s, n) => s + n, 0)
    const denom = Math.max(p6, r3, 1)
    const amplitude = Math.abs(r3 - p6) / denom
    return Math.max(max, amplitude)
  }, 0)
  const magnitude = Math.min(1, changingShare * 0.5 + maxAmplitude * 0.5)

  // 选标题 + 叙述（按 rising/falling 组合）
  const top1Rising = risingCurves[0]
  const top1Falling = fallingCurves[0]
  let title: string, narrative: string
  if (top1Rising && top1Falling) {
    title = '你正在变成另一个人'
    narrative = `你正在从「${top1Falling.cluster}」搬家到「${top1Rising.cluster}」。`
  } else if (risingCurves.length >= 2) {
    title = '你在长出几条新的线'
    narrative = `「${top1Rising!.cluster}」等几个方向最近都在加重。`
  } else if (top1Rising) {
    title = '你在长出新的一面'
    narrative = `「${top1Rising.cluster}」是你最近涨得最快的方向。`
  } else if (fallingCurves.length >= 2) {
    title = '你在放下几样东西'
    narrative = `「${top1Falling!.cluster}」等几个方向最近都在退潮。`
  } else if (top1Falling) {
    title = '你在放下某些东西'
    narrative = `「${top1Falling.cluster}」最近在退潮。`
  } else if (flatCurves.length === curves.length) {
    // 所有 cluster 都 flat → 退给 stability 检测器，这里返 null
    return null
  } else {
    title = '你的注意力正在重新分布'
    narrative = '你的几个主题最近在平稳推进。'
  }

  return {
    kind: 'topic_migration',
    title,
    narrative,
    magnitude,
    data: { curves },
  }
}

// ─── 检测器 2: process_rate_change ────────────────

/** 处理率近期（最近 30 天处理的 items）vs 历史（30-90 天前处理的 items）变化 */
export function detectProcessRateChange(items: Item[], now: number): ChangeSignal | null {
  // 看 "近 30 天处理的 / 近 30 天加入处理可见窗口的" 比率
  // 用 processedAt 划分 recent vs prev 窗口
  const processed = items.filter((i) => i.processedAt && i.status !== 'pending')
  if (processed.length < 10) return null  // 数据不够

  const recent30Processed = processed.filter((i) => i.processedAt! >= now - 30 * DAY).length
  const prev60Processed = processed.filter(
    (i) => i.processedAt! >= now - 90 * DAY && i.processedAt! < now - 30 * DAY,
  ).length
  // 同期分母：在窗口内 "可处理的"（已存在的 items）
  const recent30Available = items.filter((i) => i.savedAt <= now && i.savedAt >= now - 90 * DAY).length
  const prev60Available = items.filter(
    (i) => i.savedAt <= now - 30 * DAY && i.savedAt >= now - 90 * DAY,
  ).length

  if (recent30Available < CFG.CHANGE_PROCESS_MIN_RECENT30 || prev60Available < CFG.CHANGE_PROCESS_MIN_PREV60) return null

  const recentRate = recent30Processed / Math.max(1, recent30Available)
  const prevRate = prev60Processed / Math.max(1, prev60Available)

  const diff = recentRate - prevRate
  const absRatio = Math.abs(diff) / Math.max(prevRate, 0.05)

  if (Math.abs(diff) < CFG.CHANGE_PROCESS_MIN_ABS_DIFF && absRatio < CFG.CHANGE_PROCESS_MIN_REL_DIFF) return null

  const magnitude = Math.min(1, Math.abs(diff) * 2 + absRatio * 0.3)

  // v3.1.10 · 改：去掉"可能 X 可能 Y" hedge，直接陈述行为变化事实，不下评价
  // v3.1.24 · 旧 "你存得比处理得快" 是因果错位——处理率降低可能是
  //   a) 存得多了（存增 > 处理增）
  //   b) 处理慢了（存稳，处理减）
  //   c) 前期存量低 + 处理充分 → 近期存量上来后还没追上
  //   现在用 recent30Available vs prev60Available 区分 a / b，无法区分时给中性陈述
  let title: string, narrative: string
  const recentPct = Math.round(recentRate * 100)
  const prevPct = Math.round(prevRate * 100)
  if (diff > 0) {
    title = '你最近处理得更勤了'
    narrative = `处理率从之前的 ${prevPct}% 涨到现在的 ${recentPct}%——你比以前更愿意做决定。`
  } else {
    // 区分"存得多"vs"处理得慢"：看分母变化
    const saveGrowth = recent30Available / Math.max(1, prev60Available)
    if (saveGrowth >= CFG.CHANGE_SAVE_GROWTH_HIGH) {
      // 存量显著增加 → "存得多"
      title = '你最近存得多了'
      narrative = `处理率从之前的 ${prevPct}% 降到现在的 ${recentPct}%——这阵子保存量上来了，处理还在路上。`
    } else if (saveGrowth <= CFG.CHANGE_SAVE_GROWTH_LOW) {
      // 存量稳定或减少，但处理率降 → "处理慢了"
      title = '你最近处理得少了'
      narrative = `处理率从之前的 ${prevPct}% 降到现在的 ${recentPct}%——保存量没变多，是这阵子处理得少了。`
    } else {
      // 存量没明显变化，中性陈述
      title = '你最近的处理节奏慢了'
      narrative = `处理率从之前的 ${prevPct}% 降到现在的 ${recentPct}%——这阵子待处理的多了一些。`
    }
  }

  return {
    kind: 'process_rate_change',
    title,
    narrative,
    magnitude,
    data: { recentRate, prevRate, diff },
  }
}

// ─── 检测器 3: chip_shift ─────────────────────────

/** chip 偏好的分布变化（近 30 天 vs 30-90 天前） */
export function detectChipShift(items: Item[], now: number): ChangeSignal | null {
  const recentChipped = items.filter(
    (i) => i.usageChip && i.processedAt && i.processedAt >= now - 30 * DAY,
  )
  const prevChipped = items.filter(
    (i) => i.usageChip && i.processedAt && i.processedAt >= now - 90 * DAY && i.processedAt < now - 30 * DAY,
  )
  if (recentChipped.length < 5 || prevChipped.length < 10) return null

  // 各 chip 占比
  function distrib(arr: Item[]) {
    const counts: Record<string, number> = {}
    for (const i of arr) counts[i.usageChip!] = (counts[i.usageChip!] ?? 0) + 1
    const total = arr.length
    const dist: Record<string, number> = {}
    for (const [k, v] of Object.entries(counts)) dist[k] = v / total
    return dist
  }
  const recentDist = distrib(recentChipped)
  const prevDist = distrib(prevChipped)

  // 找变化最大的 chip
  const allChips = new Set([...Object.keys(recentDist), ...Object.keys(prevDist)])
  let maxDiff = 0
  let topChip = ''
  let direction: 'rising' | 'falling' = 'rising'
  for (const chip of allChips) {
    const r = recentDist[chip] ?? 0
    const p = prevDist[chip] ?? 0
    const d = r - p
    if (Math.abs(d) > Math.abs(maxDiff)) {
      maxDiff = d
      topChip = chip
      direction = d > 0 ? 'rising' : 'falling'
    }
  }
  if (Math.abs(maxDiff) < 0.15) return null  // 变化不显著

  const magnitude = Math.min(1, Math.abs(maxDiff) * 3)
  const recentPct = Math.round((recentDist[topChip] ?? 0) * 100)
  const prevPct = Math.round((prevDist[topChip] ?? 0) * 100)

  let title: string, narrative: string
  if (direction === 'rising') {
    title = '你跟内容的关系在变'
    narrative = `「${topChip}」最近占你处理动作的 ${recentPct}%——30 天前只有 ${prevPct}%。`
  } else {
    title = '你跟内容的关系在变'
    narrative = `你最近不那么常说「${topChip}」了——从 ${prevPct}% 降到 ${recentPct}%。`
  }

  return {
    kind: 'chip_shift',
    title,
    narrative,
    magnitude,
    data: { topChip, recentDist, prevDist, direction },
  }
}

// ─── 检测器 4: stability ──────────────────────────

/** 主题集合长期稳定，几乎没在变（一种"不变"也是一种洞察）*/
export function detectStability(items: Item[], now: number): ChangeSignal | null {
  // 看 30 天 vs 60-90 天的 cluster 集合的 Jaccard
  const recent30 = items.filter((i) => i.savedAt >= now - 30 * DAY && i.cluster)
  const prev60 = items.filter(
    (i) => i.savedAt >= now - 90 * DAY && i.savedAt < now - 30 * DAY && i.cluster,
  )
  if (recent30.length < CFG.CHANGE_STABILITY_MIN_RECENT30 || prev60.length < CFG.CHANGE_STABILITY_MIN_PREV60) return null

  const recentClusters = new Set(recent30.map((i) => i.cluster!))
  const prevClusters = new Set(prev60.map((i) => i.cluster!))
  const intersection = [...recentClusters].filter((c) => prevClusters.has(c)).length
  const union = new Set([...recentClusters, ...prevClusters]).size
  const jaccard = union > 0 ? intersection / union : 0

  // 同时看保存量 ratio：近 30 天 vs 月均
  const oldestSavedAt = Math.min(...items.map((i) => i.savedAt))
  const monthlyAvg = items.length / Math.max(1, (now - oldestSavedAt) / DAY / 30)
  const recentMonthlyRatio = recent30.length / Math.max(1, monthlyAvg)

  // 稳定 = Jaccard 高 + ratio 接近 1（不爆发也不衰退）
  if (jaccard < CFG.CHANGE_STABILITY_MIN_JACCARD || recentMonthlyRatio < CFG.CHANGE_STABILITY_MIN_MONTHLY_RATIO || recentMonthlyRatio > CFG.CHANGE_STABILITY_MAX_MONTHLY_RATIO) return null

  // magnitude: jaccard 越高 + ratio 越接近 1 → 越稳定
  const stabilityScore = jaccard * (1 - Math.abs(recentMonthlyRatio - 1))
  const magnitude = Math.min(1, stabilityScore)
  if (magnitude < CFG.CHANGE_STABILITY_MIN_MAGNITUDE) return null  // 不够明显

  // v3.1.24 · 原"你的注意力在哪里停了"句不通顺 + 数据本身就能给出具体答案
  //   从 recentClusters 取保存量 top 3 主题，告诉用户注意力确切停在哪里
  const clusterCounts = new Map<string, number>()
  for (const item of recent30) {
    clusterCounts.set(item.cluster!, (clusterCounts.get(item.cluster!) ?? 0) + 1)
  }
  const topClusters = [...clusterCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => `「${name}」`)
    .join('、')

  const title = '你这一阵子没在变'
  const narrative = topClusters
    ? `近 30 天的主题集合跟前 60 天重合度 ${Math.round(jaccard * 100)}%——你守在 ${topClusters} 这片熟悉的范围里。`
    : `近 30 天的主题集合跟前 60 天重合度 ${Math.round(jaccard * 100)}%——你守在熟悉的范围里。`

  return {
    kind: 'stability',
    title,
    narrative,
    magnitude,
    data: { jaccard, recentMonthlyRatio },
  }
}
