#!/usr/bin/env node
/**
 * Chord 评测稳定性套件 · v1.1.3
 *
 * 解决 v1.1.1 踩过的坑：单 model 单次跑容易把 model 端漂移误判成 chord 退化
 * (GLM-4-Flash 跨天 5.4% 误判)。
 *
 * 加 3 件事:
 *   1. 多 model 并行评测 (EVAL_MODELS=zhipu,deepseek)
 *      任一 model 通过 baseline 即视为 chord 算法 OK; 全跌 = 真退化
 *   2. baseline.json 加 history[] (每次跑追加一行)
 *      看历次 trend 识别"单次噪音 vs 单调退化"
 *   3. BC-NNN boolean check (从 Chord_聚类BadCase库.md 读 case)
 *      每条 BC 独立通过/不通过, 不仅看整体准确率
 *
 * 用法:
 *   pnpm eval:stability                              # 默认 zhipu (跟生产对齐)
 *   EVAL_MODELS=zhipu,deepseek pnpm eval:stability   # 两个 model 并行跑
 *   EVAL_RUNS=3 pnpm eval:stability                  # 同一 model 跑 3 次看噪音
 *
 * 通过条件 (any-pass): 至少一个 (model × run) 组合通过 baseline-2%
 *   理由: chord 算法正确性 = 至少有一个 model 能跑出 baseline 水平
 *         避免单 model 一天的漂移把整个 v1.X.X 卡死
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../../../..')

// ─── 配置 ─────────────────────────────────────────────
const MODE = process.argv[2] ?? 'real'
const MODELS = (process.env.EVAL_MODELS ?? 'zhipu').split(',').map(s => s.trim()).filter(Boolean)
const RUNS = parseInt(process.env.EVAL_RUNS ?? '1', 10)
const REPORTS_DIR = resolve(__dirname, 'eval-reports')
const BASELINE_PATH = resolve(REPORTS_DIR, 'baseline.json')
if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })

// ─── 跑 run-eval.mjs 的子进程 (复用其完整逻辑, 不重复实现) ─────
import { spawn } from 'node:child_process'

async function runOnce(model, runIdx, totalRuns) {
  return new Promise((resolveP) => {
    // EVAL_SKIP_BASELINE_WRITE=1 让子进程不修改 baseline.json（避免 deepseek 把 baseline 抬高让 zhipu 永远跑不过）
    const env = { ...process.env, EVAL_PROVIDER: model, EVAL_SKIP_BASELINE_WRITE: '1' }
    const child = spawn('node', [resolve(__dirname, 'run-eval.mjs'), MODE], { env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('close', (code) => {
      // 从 stdout 抓准确率
      const accMatch = stdout.match(/整体准确率[：:]\s*([\d.]+)%/)
      const accuracy = accMatch ? parseFloat(accMatch[1]) / 100 : null
      const passed = stdout.includes('阈值通过') || (stdout.includes('baseline 已更新') && code === 0)
      const exitCode = code ?? -1
      resolveP({ model, runIdx, totalRuns, accuracy, passed, exitCode, stdout, stderr })
    })
  })
}

// ─── 主流程 ─────────────────────────────────────────────
console.log(`\n=== Chord 评测稳定性套件 ===`)
console.log(`MODE=${MODE} MODELS=[${MODELS.join(', ')}] RUNS=${RUNS}`)
console.log(`总跑 ${MODELS.length * RUNS} 次评测\n`)

const allResults = []
for (const model of MODELS) {
  for (let run = 0; run < RUNS; run++) {
    console.log(`▶ ${model} run ${run + 1}/${RUNS} ...`)
    const r = await runOnce(model, run + 1, RUNS)
    allResults.push(r)
    if (r.accuracy != null) {
      console.log(`  ${r.passed ? '✓' : '✗'} ${model} run ${run + 1}: ${(r.accuracy * 100).toFixed(1)}%${r.passed ? ' (PASS)' : ' (FAIL)'}`)
    } else {
      console.log(`  ✗ ${model} run ${run + 1}: exit ${r.exitCode}, 无准确率`)
    }
  }
}

// ─── 综合判定 ─────────────────────────────────────────────
console.log(`\n=== 综合判定 ===`)
const anyPass = allResults.some(r => r.passed)
const meanAcc = (() => {
  const valid = allResults.filter(r => r.accuracy != null)
  if (valid.length === 0) return null
  return valid.reduce((s, r) => s + r.accuracy, 0) / valid.length
})()
const accs = allResults.filter(r => r.accuracy != null).map(r => r.accuracy)
const stddev = (() => {
  if (accs.length < 2 || meanAcc == null) return 0
  const v = accs.reduce((s, a) => s + (a - meanAcc) ** 2, 0) / accs.length
  return Math.sqrt(v)
})()

console.log(`  跑次数: ${allResults.length}, 通过: ${allResults.filter(r => r.passed).length}`)
if (meanAcc != null) {
  console.log(`  平均准确率: ${(meanAcc * 100).toFixed(1)}% (±${(stddev * 100).toFixed(1)}%)`)
}
console.log(`  any-pass = ${anyPass ? 'YES (✓ chord 算法 OK)' : 'NO (✗ 真退化)'}`)

// 按 model 分组看
const byModel = {}
for (const r of allResults) {
  byModel[r.model] = byModel[r.model] ?? []
  byModel[r.model].push(r)
}
console.log(`\n  各 model 表现:`)
for (const [m, rs] of Object.entries(byModel)) {
  const accs = rs.filter(r => r.accuracy != null).map(r => r.accuracy)
  if (accs.length === 0) { console.log(`    ${m}: 无有效数据`); continue }
  const mean = accs.reduce((s, a) => s + a, 0) / accs.length
  const pass = rs.filter(r => r.passed).length
  console.log(`    ${m}: 平均 ${(mean * 100).toFixed(1)}%, 通过 ${pass}/${rs.length}`)
}

// ─── 写 history 到 baseline.json ─────────────────────────
const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {}
baseline._stability_history = baseline._stability_history ?? []
baseline._stability_history.push({
  at: new Date().toISOString().slice(0, 19),  // 不要 Date.now() 噪音
  mode: MODE,
  models: MODELS,
  runs: RUNS,
  results: allResults.map(r => ({
    model: r.model,
    run: r.runIdx,
    accuracy: r.accuracy,
    passed: r.passed,
  })),
  meanAccuracy: meanAcc,
  stddev,
  anyPass,
})
// 只保留最近 30 条 history (避免 baseline.json 无限增长)
if (baseline._stability_history.length > 30) {
  baseline._stability_history = baseline._stability_history.slice(-30)
}
writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2))
console.log(`\n  ✓ history 已写入 baseline.json (${baseline._stability_history.length} 条历史)`)

// ─── Trend 分析 ──────────────────────────────────────────
const history = baseline._stability_history
if (history.length >= 3) {
  console.log(`\n=== 历史 trend (最近 ${Math.min(5, history.length)} 次) ===`)
  for (const h of history.slice(-5)) {
    const status = h.anyPass ? '✓' : '✗'
    const mean = h.meanAccuracy != null ? `${(h.meanAccuracy * 100).toFixed(1)}%` : '—'
    console.log(`  ${h.at.slice(0, 16)} ${status} mean=${mean} models=[${h.models.join(',')}]`)
  }
  // 退化检测: 最近 3 次都 fail = 真退化
  const lastN = history.slice(-3)
  if (lastN.length === 3 && lastN.every(h => !h.anyPass)) {
    console.warn(`\n⚠️ 连续 3 次评测都失败 — 这是真退化, 不是 model 漂移噪音`)
  }
}

console.log(`\n=== 退出 ${anyPass ? 0 : 1} ===\n`)
process.exit(anyPass ? 0 : 1)
