/**
 * EchoMomentService —— 「念念之响」visit 触发式通知
 *
 * 当用户回访某条已收藏的内容达到阈值（3 / 7 / 15 / 30 次）时，
 * 系统温柔地问一句：「这条你回访了 N 次——它对你意味着什么？」
 *
 * 关键约束：
 *  - 同一条 item 14 天冷却（即使新阈值跨越也不重复打扰）
 *  - 只对 pending / kept 状态触发（released 不响）
 *  - 每条只命中 visitCount 跨越的最高阈值（visit=8 时只发"7 次"而非"3+7"）
 *  - 调用方负责通知预算（NotificationBudgetService）+ 通知设置（settings.notifications）
 *
 * 详见 plan: 五层「主动出现」体系 §Layer 3
 * + 产品文档/Chord_念念回响_功能设计.md §1
 */

import type { Item } from '@chord/types'

const DAY = 86400_000

export const VISIT_THRESHOLDS = [3, 7, 15, 30] as const
export const COOLDOWN_DAYS = 14

export type EchoMomentThreshold = typeof VISIT_THRESHOLDS[number]

/**
 * 文案池：按阈值分级（设计文档原文）
 */
const TEMPLATES: Record<EchoMomentThreshold, (item: Item, n: number) => string> = {
  3: (_, n) => `你最近常回来看这条——是想再读一遍，还是该处理了？`,
  7: (_, n) => `这条你回访了 ${n} 次——它对你来说意味着什么？`,
  15: (_, n) => `${n} 次回访。这条不该只是收藏。`,
  30: (_, n) => `这条已经成为你生活的一部分了。要不要写下它教会你什么？`,
}

export interface EchoMomentTriggerResult {
  shouldTrigger: boolean
  threshold?: EchoMomentThreshold
  message?: string
  reason?: string  // 不触发时的原因（调试日志用）
}

/**
 * 判定是否要为某条 item 触发 Echo Moment。
 * 纯函数，不写 storage，调用方拿到结果后自行 chrome.notifications.create + 记录 echoMomentTriggeredAt
 *
 * @param item 收藏条目
 * @param visitCount 当前 visit 次数（从 chrome.history 查得）
 * @param now 当前时间戳
 */
export function evaluate(
  item: Item,
  visitCount: number,
  now: number = Date.now(),
): EchoMomentTriggerResult {
  // 1. 状态过滤
  if (item.status !== 'pending' && item.status !== 'kept') {
    return { shouldTrigger: false, reason: 'status not pending/kept' }
  }
  if (item.type !== 'content') {
    return { shouldTrigger: false, reason: 'not content type' }
  }

  // 2. 14 天冷却（即使跨越新阈值也别重复打扰）
  if (item.echoMomentTriggeredAt) {
    const daysSinceTrigger = (now - item.echoMomentTriggeredAt) / DAY
    if (daysSinceTrigger < COOLDOWN_DAYS) {
      return { shouldTrigger: false, reason: `cooldown ${Math.round(COOLDOWN_DAYS - daysSinceTrigger)} days remaining` }
    }
  }

  // 3. 找到 visitCount 跨越的最高阈值
  const matchedThreshold = matchThreshold(visitCount, item.echoMomentLastVisitCount ?? 0)
  if (!matchedThreshold) {
    return { shouldTrigger: false, reason: `visit ${visitCount} did not cross any threshold` }
  }

  return {
    shouldTrigger: true,
    threshold: matchedThreshold,
    message: TEMPLATES[matchedThreshold](item, visitCount),
  }
}

/**
 * 找 visit 从 prev → current 跨越的最高阈值。返回 undefined 表示没跨越任何阈值。
 *
 * 例子：
 *  prev=2, current=4 → 跨过 3 → return 3
 *  prev=6, current=8 → 跨过 7 → return 7
 *  prev=14, current=16 → 跨过 15 → return 15
 *  prev=4, current=6 → 没跨过 7（因为 prev>=3 已经在 3-7 区间）→ return undefined
 *  prev=0, current=10 → 跨过 3 和 7，选最高 → return 7
 */
export function matchThreshold(currentVisit: number, previousVisit: number): EchoMomentThreshold | undefined {
  if (currentVisit <= previousVisit) return undefined

  let highest: EchoMomentThreshold | undefined
  for (const t of VISIT_THRESHOLDS) {
    if (currentVisit >= t && previousVisit < t) {
      highest = t
    }
  }
  return highest
}
