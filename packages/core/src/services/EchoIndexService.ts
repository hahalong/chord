/**
 * EchoIndexService —— 「Echo Index 回响指数」算法
 *
 * 每条 item 一个 0-100 的分数，表达"此刻多大程度值得系统主动回响给用户"。
 * 详见 plan: 五层「主动出现」体系 + 产品文档/Chord_念念回响_功能设计.md
 *
 * 公式（v1 · 纯规则，无 AI）：
 *   visitScore       0-40   visitCount × 5（封顶 40）
 *   unprocessedPenalty 0-25 pending → +25；其他 → 0
 *   freshness        0-15   lastVisit 7/30/90 天内 → 15/10/5/0
 *   noteScore        0-10   userNote / privateNote 存在各 +5
 *   wakeFatigue     -10-0   wakeCount × -2（多次唤醒 = 别再吼了）
 *   tooOld          -15-0   lastVisit > 180 天 → -15
 *
 * 三档分级驱动 UI 决策：
 *   silent < 30    不打扰
 *   murmur 30-60   出现在「念念之屏」（被动展示）
 *   sing   60-85   触发 Echo Moment（主动通知，温柔）
 *   shout  >= 85   今日必现 + badge 重点高亮
 */

import type { Item } from '@chord/types'

const DAY = 86400_000

export type EchoTier = 'silent' | 'murmur' | 'sing' | 'shout'

export interface EchoIndexInput {
  item: Item
  visitCount: number
  now?: number
}

/**
 * 计算 item 的 Echo Index（0-100）。纯函数，无 IO。
 */
export function computeEchoIndex({ item, visitCount, now }: EchoIndexInput): number {
  const t = now ?? Date.now()
  const visit = Math.max(0, visitCount)

  // 1. 访问活跃度（核心 · 0-40）
  const visitScore = Math.min(40, visit * 5)

  // 2. 未处理惩罚（pending 才有）
  const unprocessedPenalty = item.status === 'pending' ? 25 : 0

  // 3. 时间新鲜度：以 lastVisitedAt 为准，无则用 savedAt
  const lastTouchAt = item.lastVisitedAt ?? item.savedAt
  const daysSinceTouch = (t - lastTouchAt) / DAY
  let freshness = 0
  if (daysSinceTouch <= 7) freshness = 15
  else if (daysSinceTouch <= 30) freshness = 10
  else if (daysSinceTouch <= 90) freshness = 5

  // 4. 笔记深度
  let noteScore = 0
  if (item.userNote && item.userNote.length > 0) noteScore += 5
  if (item.privateNote && item.privateNote.length > 0) noteScore += 5

  // 5. 唤醒疲劳：唤醒次数越多越减分
  const wakeFatigue = -Math.min(10, (item.wakeCount ?? 0) * 2)

  // 6. 太老兜底
  const tooOld = daysSinceTouch > 180 ? -15 : 0

  const raw = visitScore + unprocessedPenalty + freshness + noteScore + wakeFatigue + tooOld
  return Math.max(0, Math.min(100, raw))
}

/** 把分数映射成档位 */
export function tierOf(echoIndex: number): EchoTier {
  if (echoIndex < 30) return 'silent'
  if (echoIndex < 60) return 'murmur'
  if (echoIndex < 85) return 'sing'
  return 'shout'
}

/**
 * 批量算 + 按 echoIndex 降序排。
 * 用于：badge 显示 ready 数 / 念念之屏 top N / Echo Moment 候选。
 */
export interface EchoEntry {
  item: Item
  echoIndex: number
  tier: EchoTier
}

export function computeEchoEntries(
  items: Item[],
  visitCounts: Map<string, number>,
  now?: number,
): EchoEntry[] {
  return items
    .map((item) => {
      const score = computeEchoIndex({
        item,
        visitCount: visitCounts.get(item.id) ?? 0,
        now,
      })
      return { item, echoIndex: score, tier: tierOf(score) }
    })
    .sort((a, b) => b.echoIndex - a.echoIndex)
}

/** 取「ready 档」（sing + shout，i.e. echoIndex >= 60）item 数量——给 badge 用 */
export function countReadyToEcho(
  items: Item[],
  visitCounts: Map<string, number>,
  now?: number,
): number {
  let n = 0
  for (const item of items) {
    if (item.status !== 'pending' && item.status !== 'kept') continue
    if (item.type !== 'content') continue
    const score = computeEchoIndex({
      item,
      visitCount: visitCounts.get(item.id) ?? 0,
      now,
    })
    if (score >= 60) n++
  }
  return n
}
