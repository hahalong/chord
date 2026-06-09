import { describe, it, expect } from 'vitest'
import { canSend, recordSent, todayCount, prune, type BudgetLog } from './NotificationBudgetService.js'

const T = new Date('2026-05-17T10:00:00Z').getTime()

describe('NotificationBudgetService', () => {
  it('empty log → can send any channel', () => {
    const log: BudgetLog = {}
    expect(canSend(log, 'daily', T)).toBe(true)
    expect(canSend(log, 'echo_moment', T)).toBe(true)
  })

  it('record + can-send blocks duplicate same channel', () => {
    let log: BudgetLog = {}
    log = recordSent(log, 'daily', T)
    expect(canSend(log, 'daily', T)).toBe(false)       // already used
    expect(canSend(log, 'echo_moment', T)).toBe(true)  // other channel ok
  })

  it('hard cap blocks all after 2 sent', () => {
    let log: BudgetLog = {}
    log = recordSent(log, 'daily', T)
    log = recordSent(log, 'echo_moment', T)
    expect(canSend(log, 'daily', T)).toBe(false)
    expect(canSend(log, 'echo_moment', T)).toBe(false)
  })

  it('cross-day reset', () => {
    let log: BudgetLog = {}
    log = recordSent(log, 'daily', T)
    const tomorrow = T + 86400_000
    expect(canSend(log, 'daily', tomorrow)).toBe(true)
  })

  it('todayCount returns total', () => {
    let log: BudgetLog = {}
    expect(todayCount(log, T)).toBe(0)
    log = recordSent(log, 'daily', T)
    expect(todayCount(log, T)).toBe(1)
    log = recordSent(log, 'echo_moment', T)
    expect(todayCount(log, T)).toBe(2)
  })

  it('prune drops 30+ days old logs', () => {
    const oldDate = T - 35 * 86400_000
    const recentDate = T - 10 * 86400_000
    const log: BudgetLog = {
      [new Date(oldDate).toISOString().slice(0, 10)]: { daily: 1 },
      [new Date(recentDate).toISOString().slice(0, 10)]: { daily: 1 },
      [new Date(T).toISOString().slice(0, 10)]: { daily: 1 },
    }
    const pruned = prune(log, T)
    expect(Object.keys(pruned).length).toBe(2)  // old gone, recent + today kept
  })

  it('recordSent does not mutate input', () => {
    const log: BudgetLog = {}
    const next = recordSent(log, 'daily', T)
    expect(log).toEqual({})              // not mutated
    expect(next).not.toBe(log)
  })
})
