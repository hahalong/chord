/**
 * RecallService —— 重新召回（用户 N 天没打开 Chord 时的渐进通知策略）
 *
 * 三档软推进（plan §Layer 4）：
 *   3 天未开：仅改 badge 颜色（不发通知）
 *   14 天未开：1 次摘要通知「书房悄悄发生了什么——X 涨了 Y 条」
 *   30 天未开：1 次「我们想你」+ 数据导出 + 反馈链接
 *   60+ 天未开：永远静默（尊重用户决定走开）
 *
 * 每个 trigger 只发 1 次（fired log 持久化在 chrome.storage 由 sw 维护）
 *
 * 纯函数：调用方传入"上次打开"和"已 fired log"，返回应该 fire 哪些 trigger
 */

const DAY = 86400_000

export type RecallTrigger = 'absent_14' | 'absent_30'

export interface RecallFiredLog {
  absent_14?: number   // 上次 fire 的时间戳
  absent_30?: number
}

export interface RecallEvaluation {
  daysAbsent: number
  shouldDimBadge: boolean          // 3 天后 badge 颜色加深
  triggers: RecallTrigger[]        // 应该 fire 的通知列表
}

/**
 * 评估当前应该 fire 哪些 recall trigger。
 *
 * @param lastOpenedAt 用户最后一次打开 popup/options 的时间
 * @param fired 已 fire 过的 log（防重）
 * @param now 当前时间
 */
export function evaluate(
  lastOpenedAt: number | undefined,
  fired: RecallFiredLog,
  now: number = Date.now(),
): RecallEvaluation {
  // 没有 lastOpenedAt = 新用户 / Phase 1 还没跑 → 当前时间认为是"刚开过"
  const last = lastOpenedAt ?? now
  const daysAbsent = (now - last) / DAY

  const triggers: RecallTrigger[] = []

  // 3 天起 badge 加深
  const shouldDimBadge = daysAbsent >= 3

  // 14 天首次召回（仅 fire 一次）
  if (daysAbsent >= 14 && !fired.absent_14) {
    triggers.push('absent_14')
  }

  // 30 天最后召回（仅 fire 一次）
  if (daysAbsent >= 30 && !fired.absent_30) {
    triggers.push('absent_30')
  }

  // 60+ 天：什么都不 fire（静默）— evaluate 不主动加任何 trigger

  return { daysAbsent, shouldDimBadge, triggers }
}

/**
 * 生成 14 天召回的通知文案。
 * 调用方负责构造 summary 数据（新增的 cluster / item 数等）。
 */
export interface AbsenceSummary {
  topCluster?: string       // 缺席期间增长最快的 cluster
  delta?: number            // 该 cluster 增长了多少条
  totalAdded?: number       // 总新增数
}

export function buildRecall14Message(summary: AbsenceSummary): { title: string; message: string } {
  const title = '书房悄悄发生了什么'
  let message: string
  if (summary.topCluster && summary.delta && summary.delta > 0) {
    message = `「${summary.topCluster}」涨了 ${summary.delta} 条 · 你在不在都还在等你`
  } else if (summary.totalAdded && summary.totalAdded > 0) {
    message = `书房悄悄又长了 ${summary.totalAdded} 条 · 你想回来看看吗？`
  } else {
    message = '它一直在等你回来，没有变化也没有催促'
  }
  return { title, message }
}

export function buildRecall30Message(): { title: string; message: string } {
  return {
    title: '我们想你',
    message: '如果你要走，请告诉我们。或者回来看看这一个月你的兴趣地形怎么变化了。',
  }
}

/**
 * 记录某 trigger 已 fired。返回新的 fired log（不可变）。
 */
export function recordFired(
  fired: RecallFiredLog,
  trigger: RecallTrigger,
  now: number = Date.now(),
): RecallFiredLog {
  return { ...fired, [trigger]: now }
}
