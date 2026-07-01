import { describe, it, expect } from 'vitest'
import * as ExperimentService from './ExperimentService.js'
import type { Experiment } from '@chord/types'

const DAY = 86_400_000

class MemStorage implements ExperimentService.StorageLike {
  data: Record<string, Experiment[]> = {}
  async get(key: string) { return this.data[key] }
  async set(key: string, value: Experiment[]) { this.data[key] = value }
}

describe('ExperimentService', () => {
  describe('createExperiment', () => {
    it('默认 7 天后到期', () => {
      const now = 1_700_000_000_000
      const e = ExperimentService.createExperiment({
        experimentText: '试试这 7 天',
        startedAt: now,
      })
      expect(e.expiresAt).toBe(now + 7 * DAY)
      expect(e.status).toBe('active')
      expect(e.sectionKey).toBe('guidance')
    })

    it('durationDays 可自定义', () => {
      const now = 1_700_000_000_000
      const e = ExperimentService.createExperiment({
        experimentText: 'x',
        startedAt: now,
        durationDays: 30,
      })
      expect(e.expiresAt).toBe(now + 30 * DAY)
    })
  })

  describe('findDueExperiments', () => {
    it('active + 过期 + 未通知 → 应该发', () => {
      const now = 1_700_000_000_000
      const all: Experiment[] = [
        { id: 'e1', sectionKey: 'guidance', experimentText: 'x', startedAt: now - 8 * DAY, expiresAt: now - 1 * DAY, status: 'active' },
        // 未过期
        { id: 'e2', sectionKey: 'guidance', experimentText: 'x', startedAt: now - 3 * DAY, expiresAt: now + 4 * DAY, status: 'active' },
        // 已通知过
        { id: 'e3', sectionKey: 'guidance', experimentText: 'x', startedAt: now - 8 * DAY, expiresAt: now - 1 * DAY, notifiedAt: now - 1000, status: 'due' },
        // completed
        { id: 'e4', sectionKey: 'guidance', experimentText: 'x', startedAt: now - 8 * DAY, expiresAt: now - 1 * DAY, notifiedAt: now - 1000, status: 'completed', outcome: 'changed', outcomeAt: now },
      ]
      const due = ExperimentService.findDueExperiments(all, now)
      expect(due.map(e => e.id)).toEqual(['e1'])
    })
  })

  describe('markNotified + recordOutcome', () => {
    it('markNotified 转 due, recordOutcome 转 completed', () => {
      const now = 1_700_000_000_000
      const e: Experiment = {
        id: 'e1', sectionKey: 'guidance', experimentText: 'x',
        startedAt: now - 8 * DAY, expiresAt: now - 1 * DAY, status: 'active',
      }
      const notified = ExperimentService.markNotified(e, now)
      expect(notified.status).toBe('due')
      expect(notified.notifiedAt).toBe(now)

      const done = ExperimentService.recordOutcome(notified, 'changed', now + 1000)
      expect(done.status).toBe('completed')
      expect(done.outcome).toBe('changed')
      expect(done.outcomeAt).toBe(now + 1000)
    })
  })

  describe('autoSkipStale', () => {
    it('due 状态且 notifiedAt 超过 30 天 → 自动 skip', () => {
      const now = 1_700_000_000_000
      const all: Experiment[] = [
        { id: 'e1', sectionKey: 'guidance', experimentText: 'x', startedAt: now - 60 * DAY, expiresAt: now - 53 * DAY, notifiedAt: now - 40 * DAY, status: 'due' },
        // 未到 30 天不动
        { id: 'e2', sectionKey: 'guidance', experimentText: 'x', startedAt: now - 20 * DAY, expiresAt: now - 13 * DAY, notifiedAt: now - 10 * DAY, status: 'due' },
      ]
      const skipped = ExperimentService.autoSkipStale(all, now)
      expect(skipped[0]!.status).toBe('skipped')
      expect(skipped[1]!.status).toBe('due')
    })
  })

  describe('storage helpers', () => {
    it('add + update + load', async () => {
      const s = new MemStorage()
      const now = 1_700_000_000_000
      const e1 = ExperimentService.createExperiment({ experimentText: 'a', startedAt: now })
      const e2 = ExperimentService.createExperiment({ experimentText: 'b', startedAt: now + 1000 })
      await ExperimentService.addExperiment(s, e1)
      await ExperimentService.addExperiment(s, e2)

      const loaded = await ExperimentService.loadAll(s)
      expect(loaded.length).toBe(2)

      const updated = await ExperimentService.updateExperiment(s, e1.id, (e) =>
        ExperimentService.recordOutcome(e, 'partial', now + 8 * DAY),
      )
      expect(updated?.status).toBe('completed')
      expect(updated?.outcome).toBe('partial')

      const found = (await ExperimentService.loadAll(s)).find(x => x.id === e1.id)
      expect(found?.status).toBe('completed')
    })

    it('updateExperiment 不存在的 id 返回 null', async () => {
      const s = new MemStorage()
      const r = await ExperimentService.updateExperiment(s, 'nonexistent', (e) => e)
      expect(r).toBeNull()
    })
  })

  describe('findPendingFollowups', () => {
    it('只返回 status=due', () => {
      const now = 1_700_000_000_000
      const all: Experiment[] = [
        { id: 'e1', sectionKey: 'guidance', experimentText: 'x', startedAt: now, expiresAt: now + 7 * DAY, status: 'active' },
        { id: 'e2', sectionKey: 'guidance', experimentText: 'x', startedAt: now, expiresAt: now + 7 * DAY, notifiedAt: now, status: 'due' },
        { id: 'e3', sectionKey: 'guidance', experimentText: 'x', startedAt: now, expiresAt: now + 7 * DAY, notifiedAt: now, status: 'completed', outcome: 'changed', outcomeAt: now },
      ]
      const pending = ExperimentService.findPendingFollowups(all)
      expect(pending.map(e => e.id)).toEqual(['e2'])
    })
  })
})
