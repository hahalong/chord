/**
 * SaveIntent ground-truth eval
 *
 * 跟 test/eval/ground-truth-intent.json 跑对照，给出 top-1 accuracy + per-class
 * precision/recall + BC-012 类回归断言。
 *
 * 跟 packages/core/test/eval/run-eval.mjs（AI 聚类评测）不同：SaveIntent 是纯
 * 规则，确定性，跑得快，放在 vitest 里跟单测一起跑，每次 `pnpm test` 都护航。
 *
 * Case 形式：
 *   - `label: <intent>` —— 正向断言（规则必须输出这个 intent）
 *   - `label: null`    —— 规则不应判出任何 intent（裸字等模糊样本）
 *   - `must_not: <intent>` —— 仅断言不该判到这一类，其他都行（BC-012 类语义边界）
 *
 * 硬阈值：
 *   - 正向 + null 类样本 top-1 accuracy ≥ 75%
 *   - BC-012 must_not 类 100% 不能命中禁忌 intent —— BC-012 修复的回归底线
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectIntentByRules } from './SaveIntentClassifier.js'
import type { SaveIntent } from '@chord/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GROUND_TRUTH_PATH = resolve(__dirname, '../../test/eval/ground-truth-intent.json')

interface Case {
  id: string
  title: string
  url: string
  domain: string
  label?: SaveIntent | null
  must_not?: SaveIntent
  notes?: string
}

const data = JSON.parse(readFileSync(GROUND_TRUTH_PATH, 'utf8')) as { cases: Case[] }

function run(c: Case): SaveIntent | null {
  return detectIntentByRules({ url: c.url, title: c.title, domain: c.domain })
}

describe('SaveIntent ground-truth eval', () => {
  it('top-1 accuracy ≥ 75%（label 类样本）', () => {
    const labelled = data.cases.filter((c) => c.label !== undefined)
    let correct = 0
    const wrong: { id: string; expected: SaveIntent | null; got: SaveIntent | null }[] = []

    for (const c of labelled) {
      const got = run(c)
      if (got === c.label) correct++
      else wrong.push({ id: c.id, expected: c.label!, got })
    }

    const accuracy = correct / labelled.length
    if (accuracy < 0.75 && wrong.length > 0) {
      console.error('SaveIntent eval wrong cases:', wrong)
    }
    expect(accuracy).toBeGreaterThanOrEqual(0.75)
  })

  it('per-class precision/recall（信息性，不阻塞）', () => {
    const classes: (SaveIntent | 'null')[] = ['tool', 'learn', 'aspire', 'inspire', 'track', 'null']
    const tp: Record<string, number> = {}
    const fp: Record<string, number> = {}
    const fn: Record<string, number> = {}
    for (const c of classes) { tp[c] = 0; fp[c] = 0; fn[c] = 0 }

    for (const c of data.cases.filter((x) => x.label !== undefined)) {
      const got = run(c)
      const expectedKey = (c.label ?? 'null') as string
      const gotKey = (got ?? 'null') as string
      if (gotKey === expectedKey) {
        tp[gotKey]!++
      } else {
        fp[gotKey]!++
        fn[expectedKey]!++
      }
    }

    const report = classes.map((c) => {
      const t = tp[c]!, f = fp[c]!, n = fn[c]!
      const precision = (t + f) === 0 ? null : t / (t + f)
      const recall = (t + n) === 0 ? null : t / (t + n)
      return { class: c, tp: t, precision, recall }
    })
    console.log('[SaveIntent per-class]', JSON.stringify(report, null, 2))
    // 信息性 assertion：每个类至少有 1 个 ground-truth 样本
    for (const c of classes) {
      expect(tp[c]! + fn[c]!, `class ${c} should have at least 1 ground-truth case`).toBeGreaterThan(0)
    }
  })

  it('BC-012 回归：must_not 类样本不能命中禁忌 intent', () => {
    const guarded = data.cases.filter((c) => c.must_not !== undefined)
    expect(guarded.length, 'BC-012 ground truth 至少 1 条').toBeGreaterThan(0)
    const failed: { id: string; mustNot: SaveIntent; got: SaveIntent | null }[] = []
    for (const c of guarded) {
      const got = run(c)
      if (got === c.must_not) failed.push({ id: c.id, mustNot: c.must_not!, got })
    }
    if (failed.length > 0) {
      console.error('BC-012 regression failures:', failed)
    }
    expect(failed.length, 'BC-012 类样本不能被规则判到禁忌 intent').toBe(0)
  })
})
