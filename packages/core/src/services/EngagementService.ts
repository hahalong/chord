// 参与度评分：把决策、chip、笔记、速度合成 0-100 分
// 速度分用 firstSeenAt（Chord 看到此 item 的时间）而不是 savedAt（用户原始收藏时间），
// 这样老书签今天处理也能合理拿到速度分。

import type { Item } from '@chord/types'

export type EngagementLevel = 'deep' | 'light' | 'zero'

export interface EngagementResult {
  score: number       // 0-100
  level: EngagementLevel
}

// ─── 配置（与产品文档 §五 一致）───────────────────────────────
const DECISION_BASE: Record<Item['status'], number> = {
  pending: 0,
  kept: 20,
  used: 50,
  released: 10,
}

const CHIP_BONUS: Record<string, number> = {
  '实际用到了': 30,
  '分享出去了': 25,
  '启发思路': 15,
  '仅此一读，够了': 5,
}

const CUSTOM_NOTE_BONUS = 10

// 私人注释每 10 字 +1 分，最多 +20
function privateNotePoints(note?: string): number {
  if (!note) return 0
  return Math.min(20, Math.floor(note.length / 10))
}

// 决策速度（决策时刻 - 看到 item 的时刻）
function speedPoints(item: Item): number {
  if (!item.processedAt) return 0
  // 优先用 firstSeenAt，fallback 到 savedAt（保证迁移期老数据也能算）
  const seenAt = item.firstSeenAt ?? item.savedAt
  const lagDays = (item.processedAt - seenAt) / 86_400_000
  if (lagDays < 0) return 0           // 处理时间早于 seenAt 视为数据异常
  if (lagDays <= 3) return 10
  if (lagDays <= 14) return 5
  return 0
}

// v0.1.2 · Chrome 访问加分 · 解决"兴趣地图全虚线 vs §3 真热情之林"跨视图矛盾
//   背景: pending 状态 item 在 Chord 内得 0 分 → 兴趣地图全显"基本未动"
//         但用户在 Chrome 里实际打开过该 url （visitCount > 0）
//         §3 用 reallyUsedRate (chip OR visitCount > 0 OR lastVisitedAt < 90d) 算出 79% 真热情
//         两个视图给出完全相反结论，用户混乱
//   修法: 让 scoreItem 接受可选的 visitCount，pending 但真访问过的 item 也给分
//        score 跟 chip='实际用到了' (30) 同档：访问 ≥ 5 次 = 30 / ≥ 2 次 = 15 / 仅 1 次 = 5
//        + chrome.history 90 天内访问 = 5 分 lastVisitedAt 触发
const VISIT_BONUS_HIGH = 30   // visit ≥ 5
const VISIT_BONUS_MID = 15    // visit ≥ 2
const VISIT_BONUS_LOW = 5     // visit = 1
const RECENT_VISIT_BONUS = 5  // lastVisitedAt 90 天内

function visitPoints(visitCount?: number, lastVisitedAt?: number, now?: number): number {
  let pts = 0
  if (visitCount != null) {
    if (visitCount >= 5) pts = VISIT_BONUS_HIGH
    else if (visitCount >= 2) pts = VISIT_BONUS_MID
    else if (visitCount >= 1) pts = VISIT_BONUS_LOW
  }
  if (lastVisitedAt != null && now != null && now - lastVisitedAt < 90 * 86_400_000) {
    pts += RECENT_VISIT_BONUS
  }
  return pts
}

/** 主入口：算一条 item 的参与度。纯函数，无副作用。
 *  v0.1.2 · visitCount/now 是可选注入，让 Chrome 访问加分跟 §3 reallyUsedRate 口径对齐 */
export function scoreItem(item: Item, visitCount?: number, now?: number): EngagementResult {
  let score = DECISION_BASE[item.status] ?? 0

  // chip 加分（v2 没 used，但 migrateUsedToKept 保留 usageChip；新数据 kept 也可能有旧 chip）
  if ((item.status === 'used' || item.status === 'kept') && item.usageChip) {
    score += CHIP_BONUS[item.usageChip] ?? 0
  }

  // 自定义 chip 输入（即「＋ 自己说」填了内容）
  if (item.usageCustom && item.usageCustom.length > 0) {
    score += CUSTOM_NOTE_BONUS
  }

  // 私人注释（跨所有决策类型有效）
  score += privateNotePoints(item.privateNote)

  // 决策速度
  score += speedPoints(item)

  // v0.1.2 · Chrome 访问加分（不论 status，pending 也算）
  score += visitPoints(visitCount, item.lastVisitedAt, now)

  const final = Math.min(100, Math.max(0, score))
  return { score: final, level: levelOf(final) }
}

function levelOf(score: number): EngagementLevel {
  if (score >= 60) return 'deep'
  if (score >= 20) return 'light'
  return 'zero'
}
