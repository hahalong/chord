/**
 * 临时报告生成 · 跑全部 14 fixture · 写 JSON 到 /tmp/chord-identity-report.json
 *
 * 用法: pnpm exec vitest run IdentityReport
 */

import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { computeAllIdentities } from './IdentityService.js'
import { generateMockData } from '../testing/MockFactory.js'
import { IDENTITY_CONSTRAINTS } from './IdentityConstraints.js'
import { FIXTURES } from './IdentityRegression.test.js'

describe('📊 身份卡组合报告生成', () => {
  it('跑全部 fixture · 写 JSON 报告到 /tmp/chord-identity-report.json', () => {
    const NOW = Date.now()
    const report: Array<Record<string, unknown>> = []

    for (const f of FIXTURES) {
      const data = generateMockData(f.spec)
      const items = data.chord_items
      const visitCounts = new Map(Object.entries(data.chord_history).map(([k, v]) => [k, v]))
      const cards = computeAllIdentities(items, visitCounts, NOW)

      const c = cards.find((x) => x.dimension === 'consumption')
      const m = cards.find((x) => x.dimension === 'mindset')
      const r = cards.find((x) => x.dimension === 'radius')

      // 算关键数据指标
      const DAY = 86_400_000
      const recent90 = items.filter((i) => i.savedAt && (NOW - i.savedAt) <= 90 * DAY && i.cluster)
      const counts = new Map<string, number>()
      for (const it of recent90) counts.set(it.cluster!, (counts.get(it.cluster!) || 0) + 1)
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
      const total = recent90.length
      const top1 = sorted[0]?.[1] || 0
      const top3 = sorted.slice(0, 3).reduce((s, [, cnt]) => s + cnt, 0)
      const clusterCount = sorted.length
      const processed = items.filter((i) => i.status !== 'pending').length
      const processRate = items.length > 0 ? processed / items.length : 0

      report.push({
        mbti: f.mbti,
        name: f.name,
        expected: f.expected,
        actual: {
          consumption: c?.id ?? null,
          mindset: m?.id ?? null,
          radius: r?.id ?? null,
        },
        match: {
          consumption: f.expected.consumption ? c?.id === f.expected.consumption : null,
          mindset: f.expected.mindset ? m?.id === f.expected.mindset : null,
          radius: f.expected.radius ? r?.id === f.expected.radius : null,
        },
        claims: {
          consumption: c ? (IDENTITY_CONSTRAINTS[c.id]?.coreClaim || c.claim) : null,
          mindset: m ? (IDENTITY_CONSTRAINTS[m.id]?.coreClaim || m.claim) : null,
          radius: r ? (IDENTITY_CONSTRAINTS[r.id]?.coreClaim || r.claim) : null,
        },
        stats: {
          totalItems: items.length,
          recent90: total,
          clusterCount,
          top1Share: total > 0 ? (top1 / total) : 0,
          top3Share: total > 0 ? (top3 / total) : 0,
          processRate,
          topClusters: sorted.slice(0, 5).map(([n, cnt]) => ({ name: n, count: cnt })),
        },
      })
    }

    writeFileSync('/tmp/chord-identity-report.json', JSON.stringify(report, null, 2))
    // eslint-disable-next-line no-console
    console.log(`\n✓ 报告已写到 /tmp/chord-identity-report.json (${report.length} 个 fixture)`)
  })
})
