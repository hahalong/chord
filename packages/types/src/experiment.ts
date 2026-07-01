/**
 * v1.1.4 · 隐性自我 §5 "愿意试 7 天 →" 闭环
 *
 * 用户在 §5 心理引导小实验里点 CTA → 系统记录 → 7 天后通知回访 → 用户反馈 → 沉淀历史
 *
 * 存储 key: chord_experiments  (chrome.storage.local Array<Experiment>)
 */

export type ExperimentStatus =
  | 'active'      // 用户点了 CTA, 7 天还没到
  | 'due'         // 7 天到了, 等用户反馈（通知已发 or 待补看）
  | 'completed'   // 用户已反馈 outcome
  | 'skipped'     // 用户明确跳过（比如超过 30 天没反馈自动 skip）

export type ExperimentOutcome =
  | 'changed'     // "有改变了"
  | 'partial'     // "一般"
  | 'not_done'    // "没真做到"

export interface Experiment {
  id: string
  /** 触发 CTA 的段（当前只有 'guidance' = §5 心理引导; 未来可能扩到别处）*/
  sectionKey: 'guidance'
  /** 实验文案（存下发时的 slots.experiment 原文, 用于回访提示 + 时间线展示）*/
  experimentText: string
  /** 触发时的身份组合代码 (如 'HXG'), 便于统计 */
  identityCombo?: string
  /** 触发时的 comboName (如 '囤积家') */
  comboName?: string
  /** 用户 confirm 点击的时间戳 */
  startedAt: number
  /** 回访时间点 = startedAt + 7d */
  expiresAt: number
  /** 通知已发的时间戳（避免重复发 + 补看 banner 用来判断"通知已发过"）*/
  notifiedAt?: number
  status: ExperimentStatus
  /** 用户反馈时间戳 */
  outcomeAt?: number
  outcome?: ExperimentOutcome
}
