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

/** 主入口：算一条 item 的参与度。纯函数，无副作用。 */
export function scoreItem(item: Item): EngagementResult {
  let score = DECISION_BASE[item.status] ?? 0

  // chip 加分（仅当 used 状态时）
  if (item.status === 'used' && item.usageChip) {
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

  const final = Math.min(100, Math.max(0, score))
  return { score: final, level: levelOf(final) }
}

function levelOf(score: number): EngagementLevel {
  if (score >= 60) return 'deep'
  if (score >= 20) return 'light'
  return 'zero'
}
