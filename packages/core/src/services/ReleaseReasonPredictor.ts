/**
 * ReleaseReasonPredictor —— 智能预填放手原因
 *
 * 给定一条 item + 该 item 的 visit count + 同 cluster 已被放手次数，
 * 根据行为信号推断"最可能的放手原因"，预填到 ReleaseReasonDialog 让用户 confirm 或修改。
 *
 * 设计：纯函数 + 规则引擎，无 AI 依赖、无 storage 读写。
 * 详见 Chord_二向决策_实施方案.md §4
 */

import type { Item, ReleaseReason } from '@chord/types'

export interface PredictContext {
  /** 这条 item 过去 90 天 chrome.history 访问次数 */
  visitCount: number
  /** 该 cluster 中已被 released 的 item 数（用于"找到更好的了"信号）*/
  clusterReleasedCount?: number
  /** 当前时间（测试可注入；默认 Date.now()）*/
  now?: number
}

const DAY = 86400_000

function ageDays(savedAt: number, now: number): number {
  return (now - savedAt) / DAY
}

/**
 * 根据行为信号预测放手原因。返回 null 表示"系统不确定，让用户自己选"。
 *
 * 优先级（从高到低）：
 *  1. migratedFromUsed → 'used'（老 used 数据迁移过来的，最强信号）
 *  2. high visit + 老 item → 'used'
 *  3. 多次唤醒未访问 → 'not_interested'
 *  4. 新存 + 从未访问 → 'misjudged'
 *  5. 同 cluster 已多次被放手 → 'replaced'
 *  6. 老 item + 从未访问 + 无笔记 → 'no_time'
 *  7. 都不匹配 → null
 */
export function predictReason(item: Item, ctx: PredictContext): ReleaseReason | null {
  const now = ctx.now ?? Date.now()
  const days = ageDays(item.savedAt, now)
  const visit = ctx.visitCount ?? 0
  const wake = item.wakeCount ?? 0

  // 1. 老数据迁移过来的，最强信号
  if (item.migratedFromUsed) return 'used'

  // 2. 高 visit + 老 item → 用户用过它了
  if (visit >= 3 && days > 30) return 'used'

  // 3. 多次唤醒但用户从未访问 → 不感兴趣
  if (wake >= 5 && visit === 0) return 'not_interested'

  // 4. 新存 + 从未访问 → 当时存错了
  if (days < 30 && visit === 0) return 'misjudged'

  // 5. 同 cluster 已被放手 5+ 次 → 找到更好的了
  if ((ctx.clusterReleasedCount ?? 0) >= 5) return 'replaced'

  // 6. 老于 180 天 + 从未访问 + 无笔记 → 没时间看了
  if (days > 180 && visit === 0 && !item.userNote && !item.privateNote) return 'no_time'

  // 7. 都不匹配
  return null
}
