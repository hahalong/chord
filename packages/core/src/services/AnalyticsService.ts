import type { StorageAdapter, Item, Finding, ProfileBanner, JourneyMoment, ConsumptionStyle } from '@chord/types'
import { daysSince } from '../utils/date.js'
import { scoreItem } from './EngagementService.js'
// v3.1.25 Phase 4 · skipAnxiety 从 IdentityConstraints 中心源推导
import { getConsumptionConstraint } from './IdentityConstraints.js'
import { IDENTITY_CONFIG as CFG } from './IdentityConfig.js'
// v3.1.29 · 共享地形分类
import { classifyAllClusters, pickRepresentatives, type TerrainResult } from './TerrainClassifier.js'

export async function computeProfileBanner(adapter: StorageAdapter): Promise<ProfileBanner> {
  const items = await adapter.getItems()
  const contentItems = items.filter((i) => i.type === 'content')
  const processed = contentItems.filter((i) => i.status !== 'pending')
  const processedRate = contentItems.length > 0 ? processed.length / contentItems.length : 0

  // 真实热情率：处理率≥30% 的 cluster 下的内容占比
  const clusterMap = groupByCluster(contentItems)
  let realPassionItems = 0
  for (const [, clusterItems] of clusterMap) {
    const rate = processedRate_(clusterItems)
    if (rate >= 0.3) realPassionItems += clusterItems.length
  }
  const realPassionRate = contentItems.length > 0 ? realPassionItems / contentItems.length : 0

  const now = Date.now()
  const monthStart = new Date(now)
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const releasedThisMonth = contentItems.filter(
    (i) =>
      i.status === 'released' &&
      i.processedAt != null &&
      i.processedAt >= monthStart.getTime(),
  ).length

  return {
    totalItems: contentItems.length,
    processedRate,
    realPassionRate,
    releasedThisMonth,
    dataBasedOn: `${contentItems.length} 条收藏、${Math.round(processedRate * 100)}% 的处理率、以及 ${releasedThisMonth} 次放手`,
  }
}

export async function computeInsights(
  adapter: StorageAdapter,
  visitCounts?: Map<string, number>,
  // v3.1.25 · 加 consumptionId 让 §3 跟 §1 身份一致——MINIMALIST 用户不该有"焦虑沼泽"
  consumptionId?: string,
): Promise<Finding[]> {
  const items = await adapter.getItems({ type: ['content'] })
  const findings: Finding[] = []
  const clusterMap = groupByCluster(items)
  // v3.1.25 · skipAnxiety 推导规则：当 consumption 的 bannedAngles 含"囤积"或"积累焦虑"时 skip
  //   现在仅 MINIMALIST 命中。以后加新身份只要在 IdentityConstraints 里填 bannedAngles 就自动生效。
  const constraint = consumptionId ? getConsumptionConstraint(consumptionId) : null
  const skipAnxiety = constraint
    ? constraint.bannedAngles.some((a) => a.includes('囤积') || a.includes('积累焦虑'))
    : false

  // Note: 之前的独立 frequent_topic Finding 已合并到下方 Hidden Strength（CR-009）。
  // visitCounts 现在作为 Hidden Strength 的 OR 触发信号一起使用。

  // v3.1.25 · "久未保存"判定：最近一条 > STALE_TOPIC_MIN_AGE_DAYS → 算沉睡，不算焦虑沼泽
  const STALE_MS = CFG.STALE_TOPIC_MIN_AGE_DAYS * 86_400_000
  const NOW = Date.now()
  // v3.1.28 · 真用过率窗口（90 天），跟 IdentityService consumption 维度对齐
  const RECENT_USE_MS = CFG.TERRAIN_RECENT_USE_WINDOW_DAYS * 86_400_000

  // v3.1.28 · helper: 计算一个 cluster 的真用过率
  //   reallyUsed = chip='实际用到了' OR visitCount > 0 OR lastVisitedAt 近 90 天
  //   背景: release 是放手不该算"真在用"——用 visitCount 做主信号，避免"集中处理一批历史链接 → processRate 飙升 → 误判真实热情"
  function reallyUsedRateOf(clusterItems: Item[]): { rate: number; usedCount: number; visitTotal: number } {
    let usedCount = 0
    let visitTotal = 0
    for (const it of clusterItems) {
      const v = visitCounts?.get(it.id) ?? 0
      visitTotal += v
      const isUsed =
        it.usageChip === '实际用到了'
        || v > 0
        || (it.lastVisitedAt != null && NOW - it.lastVisitedAt < RECENT_USE_MS)
      if (isUsed) usedCount++
    }
    return {
      rate: clusterItems.length > 0 ? usedCount / clusterItems.length : 0,
      usedCount,
      visitTotal,
    }
  }

  // ─── v3.1.29 · §3 地形 v2 · 通过共享 TerrainClassifier 一次性算 4 块代表 ─────
  //   取代旧 4 个独立 finding 类型（illusion_anxiety / real_passion / momentum_rising / momentum_falling）
  //   两个 tab 共享同一算法 + 同一阈值
  const terrainResults = classifyAllClusters(clusterMap, visitCounts, NOW)
  const picks = pickRepresentatives(terrainResults)

  // forest · 真实热情之林
  if (picks.forest) {
    const { cluster, result } = picks.forest
    // 真用过率高 + 体量 → 「这才是真实的你」
    findings.push({
      type: 'terrain_forest',
      cluster,
      claim: `你对「${cluster}」的热情是真实的`,
      evidence: result.visitTotal > 0
        ? `${result.total} 篇，90 天里 ${result.reallyUsedCount} 条真打开过，累计访问 ${result.visitTotal} 次——不是嘴上的兴趣，是手在去的方向。`
        : `${result.total} 篇，${Math.round(result.reallyUsedRate * 100)}% 真打开过——你不只是保存，是真在用。`,
      accentColor: 'linear-gradient(180deg,#A8C8E0,#9CA3D4)',
      eyebrow: '这才是真实的你',
      metricLabel: '真用过率',
      metricValue: result.reallyUsedRate,
      metricText: `${Math.round(result.reallyUsedRate * 100)}% · ${result.total} 条`,
      ctaLabel: '深入探索',
      ctaTarget: `#terrain?cluster=${encodeURIComponent(cluster)}&mode=explore`,
    })
  }

  // swamp · 焦虑沼泽（仅在 consumption 非 MINIMALIST 时显示）
  if (picks.swamp && !skipAnxiety) {
    const { cluster, result } = picks.swamp
    const clusterItems = clusterMap.get(cluster) ?? []
    const aspireCount = clusterItems.filter((i) => i.saveIntent === 'aspire').length
    const aspireRate = result.total > 0 ? aspireCount / result.total : 0
    const isAspirationGap = aspireRate > 0.4

    findings.push({
      type: 'terrain_swamp',
      cluster,
      claim: isAspirationGap
        ? `你收藏了 ${result.total} 条关于「${cluster}」的内容，但几乎没有处理过任何一条`
        : `「${cluster}」可能不是你的兴趣，是你的焦虑`,
      evidence: isAspirationGap
        ? `这可能是一个渴望，不一定是一个计划——但它在说明你真正在意什么。`
        : `你收藏了 ${result.total} 篇关于${cluster}的内容，90 天里只 ${result.reallyUsedCount} 条真打开过——其余在等你。`,
      accentColor: 'linear-gradient(180deg,#F5C0BE,#D9706A)',
      eyebrow: isAspirationGap ? '渴望落差' : '你可能只是在焦虑',
      metricLabel: '真用过率',
      metricValue: result.reallyUsedRate,
      metricText: `${Math.round(result.reallyUsedRate * 100)}% · ${result.total} 条`,
      ctaLabel: isAspirationGap ? '扫一遍这个主题，看看哪些还想要' : '现在去批量放手',
      ctaTarget: `#process?cluster=${encodeURIComponent(cluster)}`,
    })
  }

  // ember · 新冒火苗
  if (picks.ember) {
    const { cluster, result } = picks.ember
    const ratio = result.recent30 / Math.max(1, result.prev30to90)
    findings.push({
      type: 'terrain_ember',
      cluster,
      claim: `过去 30 天，你对「${cluster}」的关注在加速`,
      evidence: `近一个月保存了 ${result.recent30} 条${result.prev30to90 > 0 ? `，是前 60 天的 ${ratio.toFixed(1)} 倍` : '——之前几乎没有'}。可能有什么事情在你内心推动着这个方向。`,
      accentColor: 'linear-gradient(180deg,#A8C8E0,#9CA3D4)',
      eyebrow: '动量信号 · 上升',
      metricLabel: '近30天速度',
      metricValue: Math.min(1, result.recent30 / 30),
      metricText: `${result.recent30} 条 / 30 天`,
      ctaLabel: '看看是什么',
      ctaTarget: `#terrain?cluster=${encodeURIComponent(cluster)}`,
    })
  }

  // sleep · 沉睡之地
  if (picks.sleep) {
    const { cluster, result } = picks.sleep
    const days = Math.round(result.lastSaveDays)
    findings.push({
      type: 'terrain_sleep',
      cluster,
      claim: `你曾经在意「${cluster}」，但已经 ${days} 天没再保存`,
      evidence: `${result.total} 条收藏在书房里等着。最早一条来自 ${Math.round(result.oldestSaveDays)} 天前。是走过了，还是只是暂停了？`,
      accentColor: 'linear-gradient(180deg,#E8D8D6,#B89098)',
      eyebrow: '动量信号 · 沉睡',
      metricLabel: '距今天数',
      metricValue: Math.min(1, result.lastSaveDays / 365),
      metricText: `${days} 天前最后保存 · ${result.total} 条`,
      ctaLabel: '回顾一下',
      ctaTarget: `#terrain?cluster=${encodeURIComponent(cluster)}`,
    })
  }

  // ─── Finding: 你的内容消费方式（Consumption Style）───────────────────
  const style = inferConsumptionStyle(items)
  if (style) {
    findings.push({
      type: 'consumption_style',
      claim: style.claim,
      evidence: style.evidence,
      accentColor: 'linear-gradient(180deg,#EEEEF8,#9CA3D4)',
      eyebrow: '你的消费方式',
      metricLabel: '类型',
      metricValue: style.confidence,
      metricText: style.label,
    })
  }

  // v3.1.29 · 删除独立的 long_wait finding —— 已被 terrain_sleep 取代（按 cluster 维度 + score 排序）

  // Finding: 越来越诚实（需要历史事件数据，简化版先用本月放手数判断）
  const now = Date.now()
  const monthStart = new Date(now)
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const prevMonthStart = new Date(monthStart)
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1)

  const thisMonth = items.filter(
    (i) => i.status === 'released' && i.processedAt != null && i.processedAt >= monthStart.getTime(),
  ).length
  const prevMonth = items.filter(
    (i) =>
      i.status === 'released' &&
      i.processedAt != null &&
      i.processedAt >= prevMonthStart.getTime() &&
      i.processedAt < monthStart.getTime(),
  ).length

  if (thisMonth > prevMonth && thisMonth >= 3) {
    findings.push({
      type: 'growing_honest',
      claim: `本月你放手了 ${thisMonth} 条——比上月多 ${thisMonth - prevMonth} 条`,
      evidence: `放手不是失败，是识别出哪些「感兴趣」只是一瞬间的冲动。你越来越擅长对自己诚实了。这是进步。`,
      accentColor: 'linear-gradient(180deg,#B8EDCA,#5AB870)',
      eyebrow: '你越来越诚实了',
      metricLabel: '月度放手',
      metricValue: Math.min(1, thisMonth / 30),
      metricText: `${thisMonth} 条`,
    })
  }

  // v3.1.29 · 删除 anxiety_panorama 合并逻辑——terrain_swamp 已 pickRepresentatives 挑了最强 1 个
  //   旧 panorama 是把 ≥2 个 illusion_anxiety 合并成对比表，现在每种 type 只 emit 1 个不会冲突
  //   旧 dedupByCluster 也不再需要——TerrainClassifier 输出每个 cluster 只属于 1 个 type

  return findings.slice(0, 6)  // 保留最多 6 条：4 块地形 + consumption_style + growing_honest
}

export async function buildJourneyLog(adapter: StorageAdapter): Promise<JourneyMoment[]> {
  const items = await adapter.getItems({ type: ['content'] })
  const moments: JourneyMoment[] = []

  for (const item of items) {
    if (item.status === 'used' && item.processedAt) {
      const waited = daysSince(item.savedAt)
      if (waited >= 30) {
        moments.push({
          type: 'sweet',
          timestamp: item.processedAt,
          itemId: item.id,
          cluster: item.cluster,
          savedDaysAgo: waited,
          description: `等了你 ${waited} 天，终于等到了`,
        })
      }
    }

    if (item.status === 'released' && item.processedAt) {
      const waited = daysSince(item.savedAt)
      if (waited >= 365 && item.userNote) {
        moments.push({
          type: 'tear',
          timestamp: item.processedAt,
          itemId: item.id,
          cluster: item.cluster,
          savedDaysAgo: waited,
          userNote: item.userNote,
          description: `陪伴了你 ${Math.floor(waited / 365)} 年，今天温柔地放手了`,
        })
      }
    }
  }

  return moments.sort((a, b) => b.timestamp - a.timestamp)
}

function groupByCluster(items: Item[]): Map<string, Item[]> {
  const map = new Map<string, Item[]>()
  for (const item of items) {
    if (!item.cluster) continue
    const list = map.get(item.cluster) ?? []
    list.push(item)
    map.set(item.cluster, list)
  }
  return map
}

function processedRate_(items: Item[]): number {
  if (items.length === 0) return 0
  const done = items.filter((i) => i.status !== 'pending').length
  return done / items.length
}

// 推断用户消费方式：5 类型分支，基于全局 chip 分布 + noteRate + avgDecisionLag + 总处理率
interface StyleResult {
  style: ConsumptionStyle
  label: string
  claim: string
  evidence: string
  confidence: number
}

function inferConsumptionStyle(items: Item[]): StyleResult | null {
  const contentItems = items.filter((i) => i.type === 'content')
  if (contentItems.length < 10) return null   // 数据不足

  const processed = contentItems.filter((i) => i.status !== 'pending')
  const processRate = contentItems.length > 0 ? processed.length / contentItems.length : 0

  // chip 分布
  const chipCount: Record<string, number> = {}
  for (const i of contentItems) {
    if (i.usageChip) chipCount[i.usageChip] = (chipCount[i.usageChip] ?? 0) + 1
  }
  const totalChips = Object.values(chipCount).reduce((s, n) => s + n, 0)

  // noteRate
  const noteCount = contentItems.filter((i) => i.privateNote && i.privateNote.length > 0).length
  const noteRate = noteCount / contentItems.length

  // 平均决策延迟（天）
  const lagDays: number[] = []
  for (const i of processed) {
    if (!i.processedAt) continue
    const seen = i.firstSeenAt ?? i.savedAt
    lagDays.push((i.processedAt - seen) / 86_400_000)
  }
  const avgLag = lagDays.length > 0 ? lagDays.reduce((s, n) => s + n, 0) / lagDays.length : 0

  // 类型判定（优先级从特征鲜明到通用）
  // hoarder：处理率 < 0.2 且体量 ≥ 30
  if (processRate < 0.2 && contentItems.length >= 30) {
    return {
      style: 'hoarder',
      label: 'hoarder · 收藏家',
      claim: '你的书房在等你',
      evidence: `${contentItems.length} 条收藏里有 ${Math.round((1 - processRate) * 100)}% 还没被打开。也许不是不感兴趣，只是没腾出时间。`,
      confidence: 0.8,
    }
  }

  // slow_reader：平均决策延迟 > 60 天，但处理率不低
  if (avgLag > 60 && processRate > 0.3) {
    return {
      style: 'slow_reader',
      label: 'slow reader · 慢读者',
      claim: '你不着急，内容在等你准备好',
      evidence: `平均 ${Math.round(avgLag)} 天才做决定——这不是拖延，是慎重。好东西经得起放一放。`,
      confidence: 0.7,
    }
  }

  if (totalChips >= 5) {
    const ratio = (k: string) => (chipCount[k] ?? 0) / totalChips
    // executor：实际用到了 占多数
    if (ratio('实际用到了') > 0.4) {
      return {
        style: 'executor',
        label: 'executor · 行动者',
        claim: '你是行动者，收藏是为了用',
        evidence: `你最常说「实际用到了」（${Math.round(ratio('实际用到了') * 100)}%）。对你来说，保存的意义是落地，不是装饰。`,
        confidence: 0.75,
      }
    }
    // thinker：启发思路 占多数 + noteRate 高
    if (ratio('启发思路') > 0.35 && noteRate > 0.2) {
      return {
        style: 'thinker',
        label: 'thinker · 思想家',
        claim: '你是思想家，用内容滋养想法',
        evidence: `「启发思路」是你最常按的 chip（${Math.round(ratio('启发思路') * 100)}%），还有 ${Math.round(noteRate * 100)}% 的内容你留了笔记。内容对你是思考的材料。`,
        confidence: 0.75,
      }
    }
    // curator：处理率高 + 但 chip 主要是「仅此一读」
    if (processRate > 0.5 && ratio('仅此一读，够了') > 0.4) {
      return {
        style: 'curator',
        label: 'curator · 策展人',
        claim: '你是策展人，精选内容是享受',
        evidence: `你处理率 ${Math.round(processRate * 100)}%，但常说「仅此一读，够了」。读过、感受过、放下——这是一种克制的从容。`,
        confidence: 0.7,
      }
    }
  }

  return null   // 信号不明确就不出标签，避免误判
}
