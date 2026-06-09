import type { Item, UserSettings } from '@chord/types'
import { daysSince } from '../utils/date.js'
import { classifyInterestState } from './InterestStateService.js'

interface ScoredItem {
  item: Item
  score: number
}

// 唤醒选择算法：加权评分
// visitCounts 可选：itemId → 过去 90 天访问次数（来自 chrome.history）
export function selectItemToResuface(
  items: Item[],
  visitCounts?: Map<string, number>,
): Item | null {
  const candidates = items.filter(
    (i) => i.type === 'content' && (i.status === 'pending' || i.status === 'kept'),
  )

  if (candidates.length === 0) return null

  // 计算各 cluster 的积累/转化比（转化率越低，权重越高）
  const clusterStats = computeClusterStats(items)

  // 每个 cluster 的兴趣生命状态：dormant 的 cluster 里挑一条来唤醒可能比追新有意义
  const clusterStates = new Map<string, ReturnType<typeof classifyInterestState>>()
  for (const item of items) {
    if (!item.cluster || clusterStates.has(item.cluster)) continue
    const members = items.filter((i) => i.cluster === item.cluster)
    clusterStates.set(item.cluster, classifyInterestState(members))
  }

  const scored: ScoredItem[] = candidates.map((item) => {
    let score = 0
    const age = daysSince(item.savedAt)

    // 保存超过30天且从未处理过
    if (age >= 30 && item.wakeCount === 0) score += 100

    // 所在 cluster 积累多但转化率低
    if (item.cluster) {
      const stat = clusterStats.get(item.cluster)
      if (stat && stat.processRate < 0.3 && stat.total >= 5) score += 50
    }

    // wakeCount 越低，分越高（避免重复唤醒）
    score += Math.max(0, 30 - item.wakeCount * 10)

    // 年龄加权（越老越优先，但不线性，用对数）
    score += Math.min(80, Math.log2(Math.max(1, age)) * 10)

    // 访问频率信号（chrome.history）
    // 90 天没访问 + 老收藏 → 该响一下；高频访问 → 用户已在用别打扰
    if (visitCounts) {
      const visits = visitCounts.get(item.id) ?? 0
      if (visits === 0 && age >= 30) score += 25
      else if (visits >= 5) score -= 35
    }

    // 兴趣生命状态：dormant 簇的内容是「挖出来的好机会」；fading 簇也加权
    if (item.cluster) {
      const state = clusterStates.get(item.cluster)
      if (state === 'dormant') score += 30
      else if (state === 'fading') score += 15
    }

    // 随机 jitter（±15），确保不会每次都选同一条
    score += (Math.random() - 0.5) * 30

    return { item, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.item ?? null
}

function computeClusterStats(
  items: Item[],
): Map<string, { total: number; processRate: number }> {
  const stats = new Map<string, { total: number; processed: number }>()

  for (const item of items) {
    if (!item.cluster) continue
    const s = stats.get(item.cluster) ?? { total: 0, processed: 0 }
    s.total++
    if (item.status === 'used' || item.status === 'released') s.processed++
    stats.set(item.cluster, s)
  }

  const result = new Map<string, { total: number; processRate: number }>()
  for (const [cluster, s] of stats) {
    result.set(cluster, {
      total: s.total,
      processRate: s.total > 0 ? s.processed / s.total : 0,
    })
  }
  return result
}

/**
 * @deprecated 生产代码不再使用——"同一天看到同一条"契约被反转：
 * 用户开 popup 期望看不同思考点，不是被同一条堵着（用户反馈"今天第二次给我弹这个"）。
 * 现在 sw.ts getTodayItem 每次都走 fresh 选择，由 wakeCount × -10 衰减项自然降权。
 *
 * 保留纯函数 + 单测，万一未来产品契约改回"同一天同一条"时能直接用。
 */
export function findCachedTodayItem(items: Item[]): Item | null {
  const cached = items
    .filter((i) =>
      i.status === 'pending'      // 已 kept / released 的不再算"今日"——否则会死循环
      && !!i.aiQuestion           // 必须已生成问句（避免 popup 显示空白）
      && i.wakeCount > 0,         // wakeCount > 0 表示已被 alarm/popup 选过一次（fresh 选择路径会 bump）
    )
    .sort((a, b) => (b.processedAt ?? b.savedAt) - (a.processedAt ?? a.savedAt))
  return cached[0] ?? null
}

export function isTimeToResuface(settings: UserSettings): boolean {
  const { resurfaceFreq, resurfaceTime, lastResurfacedAt } = settings

  if (resurfaceFreq === 'off') return false

  const [h, m] = resurfaceTime.split(':').map(Number)
  const now = new Date()
  const scheduled = new Date()
  scheduled.setHours(h ?? 9, m ?? 0, 0, 0)

  if (!lastResurfacedAt) return now >= scheduled

  const lastDate = new Date(lastResurfacedAt).toDateString()
  const today = now.toDateString()

  if (resurfaceFreq === 'daily') {
    return lastDate !== today && now >= scheduled
  }

  if (resurfaceFreq === 'weekly') {
    const dayOfWeek = now.getDay() // 0=Sun,1=Mon,3=Wed,5=Fri
    const isResurfaceDay = [1, 3, 5].includes(dayOfWeek)
    return isResurfaceDay && lastDate !== today && now >= scheduled
  }

  return false
}
