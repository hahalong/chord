/**
 * IntentValidationService —— SaveIntent v2 Sprint B.2 反馈闭环
 *
 * 把用户的 releaseReason（v2 二向决策放手原因）当作 saveIntent 准确性的验证信号。
 * 统计 (saveIntent × releaseReason) 矩阵，识别异常组合 = 意图分类可能错的信号。
 *
 * 例子：
 *   tool + not_interested → tool 类不该"不感兴趣"，可能意图判错
 *   tool + used → 意图正确（确实用过了）
 *   aspire + used → 意图正确且转化成行动
 *   aspire + not_interested → 正常（兴趣消退）
 *   inspire + used → 罕见组合，可能意图判错
 *
 * 输出可用于：
 *  1. Profile 显示"我们注意到 X 类的意图判断可能有问题"
 *  2. 评测脚本导出报告，指导下一轮 prompt 优化
 *  3. 未来自动调权（异常率高的 pattern 降权）
 *
 * 详见 plan: 动机系统 v2 优化 § Sprint B.2
 */

import type { Item, SaveIntent, ReleaseReason } from '@chord/types'
import { getPrimaryIntent } from '../ai/SaveIntentClassifier.js'

export type IntentReleaseMatrix = Record<SaveIntent, Partial<Record<ReleaseReason, number>>>

export interface IntentAnomaly {
  intent: SaveIntent
  reason: ReleaseReason
  count: number
  rate: number              // 该组合 / 该 intent 总数
  severity: 'low' | 'high'
  hint: string              // 给开发者 / 用户的解读
}

export interface IntentValidationStats {
  matrix: IntentReleaseMatrix
  totalReleased: number
  totalAnalyzed: number     // 实际有 saveIntent + releaseReason 的 item 数
  anomalies: IntentAnomaly[]
  perIntentTotal: Record<SaveIntent, number>
}

/** 异常组合规则表（plan §Sprint B.2）*/
const ANOMALY_RULES: Partial<Record<SaveIntent, Array<{
  reason: ReleaseReason
  threshold: number       // 占该 intent 总数的比例阈值
  severity: 'low' | 'high'
  hint: string
}>>> = {
  tool: [
    { reason: 'not_interested', threshold: 0.30, severity: 'high',
      hint: 'tool 类被「不感兴趣」放手率高 → 可能这些项不该被判为 tool（如非工具型教程被错归）' },
    { reason: 'misjudged', threshold: 0.40, severity: 'low',
      hint: 'tool 类被「当时存错了」 → 用户冲动收藏了工具但没真正想用' },
  ],
  learn: [
    { reason: 'not_interested', threshold: 0.40, severity: 'low',
      hint: 'learn 类被「不感兴趣」放手 → 正常（知识兴趣会消退）' },
    { reason: 'misjudged', threshold: 0.35, severity: 'high',
      hint: 'learn 类被「当时存错了」高 → 这些可能根本不是学习类内容' },
  ],
  inspire: [
    { reason: 'used', threshold: 0.30, severity: 'high',
      hint: 'inspire 类常被标「用过了」放手 → 这些可能是 tool/learn 而非情感共鸣类' },
    { reason: 'misjudged', threshold: 0.40, severity: 'high',
      hint: 'inspire 类被「当时存错了」 → BC-012 同款 root cause（域名误判，如 mp.weixin.qq.com 上的技术文章）' },
  ],
  track: [
    // track + no_time 是正常的，不算异常
    { reason: 'misjudged', threshold: 0.35, severity: 'low',
      hint: 'track 类被「当时存错了」 → 时效性资讯过期是正常的' },
  ],
  aspire: [
    // aspire 类的"不感兴趣"是正常的（兴趣消退），不算异常
    // aspire + used 是好信号（转化成行动），也不算异常
    { reason: 'replaced', threshold: 0.40, severity: 'low',
      hint: 'aspire 类被「找到更好的了」 → 用户在升级 role model / 渴望对象' },
  ],
}

/** 主入口：计算意图验证统计 */
export function computeStats(items: Item[]): IntentValidationStats {
  const matrix: IntentReleaseMatrix = {
    tool: {}, learn: {}, aspire: {}, inspire: {}, track: {},
  }
  const perIntentTotal: Record<SaveIntent, number> = {
    tool: 0, learn: 0, aspire: 0, inspire: 0, track: 0,
  }
  let totalReleased = 0
  let totalAnalyzed = 0

  for (const item of items) {
    if (item.status === 'released') totalReleased++
    if (item.status !== 'released' || !item.releaseReason) continue
    const intent = getPrimaryIntent(item)
    if (!intent) continue

    matrix[intent][item.releaseReason] = (matrix[intent][item.releaseReason] ?? 0) + 1
    perIntentTotal[intent]++
    totalAnalyzed++
  }

  const anomalies: IntentAnomaly[] = []
  for (const [intentKey, rules] of Object.entries(ANOMALY_RULES) as [SaveIntent, typeof ANOMALY_RULES[SaveIntent]][]) {
    if (!rules) continue
    const intentTotal = perIntentTotal[intentKey]
    if (intentTotal < 5) continue   // 样本太少不算

    for (const rule of rules) {
      const count = matrix[intentKey][rule.reason] ?? 0
      const rate = count / intentTotal
      if (rate >= rule.threshold) {
        anomalies.push({
          intent: intentKey,
          reason: rule.reason,
          count,
          rate,
          severity: rule.severity,
          hint: rule.hint,
        })
      }
    }
  }

  return { matrix, totalReleased, totalAnalyzed, anomalies, perIntentTotal }
}

/**
 * 给定 stats，返回前 N 条「值得开发者关注」的异常（按 severity high + rate 高排序）
 */
export function topAnomalies(stats: IntentValidationStats, n: number = 3): IntentAnomaly[] {
  return [...stats.anomalies]
    .sort((a, b) => {
      const sevA = a.severity === 'high' ? 1 : 0
      const sevB = b.severity === 'high' ? 1 : 0
      if (sevA !== sevB) return sevB - sevA
      return b.rate - a.rate
    })
    .slice(0, n)
}

/**
 * 给用户的友好文案（用于 Profile Finding 展示）
 * 只在 high severity + sample 足够多时返回非空
 */
export function userFacingHint(stats: IntentValidationStats): string | null {
  if (stats.totalAnalyzed < 10) return null   // 样本太少不显示
  const high = stats.anomalies.filter((a) => a.severity === 'high')
  if (high.length === 0) return null
  const top = high[0]!
  const intentName = INTENT_DISPLAY_NAMES[top.intent]
  const reasonName = REASON_DISPLAY_NAMES[top.reason]
  return `你最近放手的「${intentName}」类内容中，${Math.round(top.rate * 100)}% 是「${reasonName}」——意图分类可能有偏差，欢迎反馈`
}

const INTENT_DISPLAY_NAMES: Record<SaveIntent, string> = {
  tool: '工具',
  learn: '学习',
  aspire: '渴望',
  inspire: '灵感',
  track: '追踪',
}

const REASON_DISPLAY_NAMES: Record<ReleaseReason, string> = {
  used: '已经用过了',
  not_interested: '不感兴趣了',
  misjudged: '当时存错了',
  replaced: '找到更好的了',
  no_time: '没时间看了',
  custom: '自己说',
}
