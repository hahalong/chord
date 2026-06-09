/**
 * NotificationBudgetService —— 每日通知预算系统
 *
 * 用户体验红线：任何 24h 内总通知数 ≤ 2
 * - daily: ≤ 1 条/天
 * - echo_moment: ≤ 1 条/天
 * - milestone / recall / vow 到期：不占预算（少而珍贵）
 *
 * 跨日重置基于本地时区（YYYY-MM-DD）。
 *
 * 实现：纯函数，需要传入 storage adapter（这里抽象为一个 KV 接口
 * 以保持 @chord/core 跨平台）。chrome.storage 适配在 ChromeStorageAdapter 层做。
 *
 * 详见 plan: 五层「主动出现」体系 §每日通知预算
 */

import { toDateString } from '../utils/date.js'

export type BudgetChannel = 'daily' | 'echo_moment'

export interface BudgetLog {
  // 每日通道计数
  [date: string]: Partial<Record<BudgetChannel, number>>
}

const DAILY_HARD_CAP = 2     // 总上限（daily + echo_moment 加起来）
const PER_CHANNEL_CAP = 1    // 单通道每日上限

/**
 * 查询是否能发某通道的通知。
 * @param log 当前预算日志（从 storage 读出来）
 * @param channel
 * @param now 当前时间戳（测试用）
 */
export function canSend(log: BudgetLog, channel: BudgetChannel, now: number = Date.now()): boolean {
  const today = toDateString(now)
  const dayLog = log[today] ?? {}

  // 单通道上限
  if ((dayLog[channel] ?? 0) >= PER_CHANNEL_CAP) return false

  // 总上限
  const total = (dayLog.daily ?? 0) + (dayLog.echo_moment ?? 0)
  if (total >= DAILY_HARD_CAP) return false

  return true
}

/**
 * 记录已发出通知，返回新 log 让调用方写回 storage。
 * 不可变更新（不修改入参 log）。
 */
export function recordSent(log: BudgetLog, channel: BudgetChannel, now: number = Date.now()): BudgetLog {
  const today = toDateString(now)
  const dayLog = log[today] ?? {}
  const next: BudgetLog = {
    ...log,
    [today]: {
      ...dayLog,
      [channel]: (dayLog[channel] ?? 0) + 1,
    },
  }
  // 顺手清理 30 天前的旧日志（避免无限增长）
  return prune(next, now)
}

/** 清理 30+ 天前的日志 */
export function prune(log: BudgetLog, now: number = Date.now()): BudgetLog {
  const cutoff = now - 30 * 86400_000
  const cutoffDate = toDateString(cutoff)
  const out: BudgetLog = {}
  for (const [date, day] of Object.entries(log)) {
    if (date >= cutoffDate) out[date] = day
  }
  return out
}

/** 返回今天已发出的通知总数（给观测用） */
export function todayCount(log: BudgetLog, now: number = Date.now()): number {
  const today = toDateString(now)
  const dayLog = log[today] ?? {}
  return (dayLog.daily ?? 0) + (dayLog.echo_moment ?? 0)
}
