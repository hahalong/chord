// 兴趣生命状态：基于时间序列给每个 cluster 标注当前状态
//   emerging — 萌芽：近 30 天新增加速，处理率尚低（用户在补充但还没消化）
//   active   — 活跃：近 90 天持续有新增 + 处理（健康的兴趣）
//   fading   — 渐退：曾经有量但近 60 天保存稀少
//   dormant  — 休眠：> 6 个月无新 save 或处理率 < 0.1 且体量较大（积压严重）
//
// 与 ClusterStats 的 engagementLevel 互补：engagementLevel 看「用户和这堆内容的关系」，
// InterestState 看「这堆内容在用户生活里的势能」。

import type { Item, InterestState } from '@chord/types'

const DAY = 86_400_000

interface ClusterTimeSeries {
  saves: number[]              // 所有 item 的 savedAt 数组
  processedCount: number       // status !== pending 的数量
  totalCount: number
}

function summarize(items: Item[]): ClusterTimeSeries {
  const saves = items.map((i) => i.savedAt).sort((a, b) => a - b)
  let processedCount = 0
  for (const i of items) if (i.status !== 'pending') processedCount++
  return { saves, processedCount, totalCount: items.length }
}

export function classifyInterestState(items: Item[]): InterestState {
  if (items.length === 0) return 'dormant'

  const ts = summarize(items)
  const now = Date.now()
  const lastSaveAge = ts.saves.length > 0 ? (now - ts.saves[ts.saves.length - 1]!) / DAY : Infinity
  const recent30 = ts.saves.filter((t) => now - t < 30 * DAY).length
  const prev30to90 = ts.saves.filter((t) => {
    const age = now - t
    return age >= 30 * DAY && age < 90 * DAY
  }).length
  const processRate = ts.totalCount > 0 ? ts.processedCount / ts.totalCount : 0

  // dormant：>6 个月没新增 是最强信号
  if (lastSaveAge > 180) return 'dormant'
  // 或：体量较大、积压（处理率极低）且 ≥60 天没新增动作（不只是积压，还失去关注）
  if (ts.totalCount > 5 && processRate < 0.1 && lastSaveAge > 60) return 'dormant'

  // emerging：近 30 天有≥3 条新增，且近 30 天显著超过 30-90 天的量（加速中）
  if (recent30 >= 3 && recent30 > prev30to90 * 1.5) return 'emerging'

  // fading：近 30 天和 30-90 天窗口都没新增（动量消失）
  if (recent30 === 0 && prev30to90 === 0) return 'fading'

  // active：常态健康
  return 'active'
}

/** 计算 cluster 的动量信号：近 30 天保存量 vs 历史月均（30 天以前的）。 */
export interface MomentumSignal {
  velocity30d: number       // 近 30 天新增条数
  velocityHist: number      // 历史月均（30 天前的，按月归一化）
  direction: 'rising' | 'falling' | 'stable'
}

export function computeMomentum(items: Item[]): MomentumSignal {
  if (items.length === 0) {
    return { velocity30d: 0, velocityHist: 0, direction: 'stable' }
  }
  const now = Date.now()
  const saves = items.map((i) => i.savedAt)
  const velocity30d = saves.filter((t) => now - t < 30 * DAY).length

  // 历史月均：30 天之前的 saves 数 / (该窗口跨多少个月)
  const historicalSaves = saves.filter((t) => now - t >= 30 * DAY)
  const oldest = historicalSaves.length > 0 ? Math.min(...historicalSaves) : now - 30 * DAY
  const historyMonths = Math.max(1, (now - 30 * DAY - oldest) / (30 * DAY))
  const velocityHist = historicalSaves.length / historyMonths

  // 判定阈值：rising 需要 1.5×；falling 需要 0.3× 且历史月均 ≥3
  let direction: MomentumSignal['direction'] = 'stable'
  if (velocity30d >= 3 && velocity30d > velocityHist * 1.5) direction = 'rising'
  else if (velocityHist >= 3 && velocity30d < velocityHist * 0.3) direction = 'falling'

  return { velocity30d, velocityHist, direction }
}
