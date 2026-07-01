/**
 * v1.1.4 · Experiment 状态机 + 存储 helper
 *
 * 用户在 §5 心理引导小实验里点"愿意试 7 天 →" → 记录 → 7 天后通知回访 → 反馈 outcome
 *
 * 纯函数 + storage helper（不依赖 chrome.*，方便测试）
 */

import type { Experiment, ExperimentOutcome } from '@chord/types'

const STORAGE_KEY = 'chord_experiments'
const DEFAULT_DURATION_DAYS = 7
const DAY_MS = 86_400_000
/** 超过这么久没反馈 → 自动 skip（避免 due 状态无限堆积） */
const AUTO_SKIP_AFTER_DAYS = 30

export interface StorageLike {
  get(key: string): Promise<Experiment[] | undefined>
  set(key: string, value: Experiment[]): Promise<void>
}

// ─── 纯函数 · 状态机 ─────────────────────────────────────────

export function createExperiment(input: {
  experimentText: string
  identityCombo?: string
  comboName?: string
  startedAt: number
  durationDays?: number
}): Experiment {
  const duration = input.durationDays ?? DEFAULT_DURATION_DAYS
  return {
    id: `exp_${input.startedAt}_${Math.random().toString(36).slice(2, 8)}`,
    sectionKey: 'guidance',
    experimentText: input.experimentText,
    identityCombo: input.identityCombo,
    comboName: input.comboName,
    startedAt: input.startedAt,
    expiresAt: input.startedAt + duration * DAY_MS,
    status: 'active',
  }
}

/**
 * 找出所有该发通知的 experiment（active + 已过 expiresAt + 未发过通知）
 * SW alarm handler 调用，返回列表；调用方发通知后调 markNotified
 */
export function findDueExperiments(all: Experiment[], now: number): Experiment[] {
  return all.filter((e) =>
    e.status === 'active' && e.expiresAt <= now && !e.notifiedAt,
  )
}

/**
 * 找出所有待用户补看反馈的 experiment（status='due'）
 * 顶部 banner 显示用
 */
export function findPendingFollowups(all: Experiment[]): Experiment[] {
  return all.filter((e) => e.status === 'due')
}

/** 标记通知已发 + status 转 due */
export function markNotified(exp: Experiment, notifiedAt: number): Experiment {
  return { ...exp, notifiedAt, status: 'due' }
}

/** 用户反馈 outcome */
export function recordOutcome(exp: Experiment, outcome: ExperimentOutcome, outcomeAt: number): Experiment {
  return { ...exp, outcome, outcomeAt, status: 'completed' }
}

/** 检查是否长期未反馈, 自动 skip 避免 due 无限堆积 */
export function autoSkipStale(all: Experiment[], now: number): Experiment[] {
  const threshold = now - AUTO_SKIP_AFTER_DAYS * DAY_MS
  return all.map((e) => {
    if (e.status === 'due' && e.notifiedAt && e.notifiedAt < threshold) {
      return { ...e, status: 'skipped' as const }
    }
    return e
  })
}

// ─── 存储 helper ─────────────────────────────────────────

export async function loadAll(storage: StorageLike): Promise<Experiment[]> {
  return (await storage.get(STORAGE_KEY)) ?? []
}

export async function saveAll(storage: StorageLike, all: Experiment[]): Promise<void> {
  await storage.set(STORAGE_KEY, all)
}

/** 添加一条 + 保存 */
export async function addExperiment(
  storage: StorageLike,
  experiment: Experiment,
): Promise<Experiment[]> {
  const all = await loadAll(storage)
  const next = [...all, experiment]
  await saveAll(storage, next)
  return next
}

/** 按 id 更新一条 + 保存 */
export async function updateExperiment(
  storage: StorageLike,
  id: string,
  updater: (e: Experiment) => Experiment,
): Promise<Experiment | null> {
  const all = await loadAll(storage)
  const idx = all.findIndex((e) => e.id === id)
  if (idx < 0) return null
  const next = [...all]
  next[idx] = updater(all[idx]!)
  await saveAll(storage, next)
  return next[idx]!
}

export const EXPERIMENT_STORAGE_KEY = STORAGE_KEY
