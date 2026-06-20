// chord:diag-terrain · 用真实用户数据跑 §3 地形算法 + 对比新旧逻辑
// 用法: pnpm chord:diag-terrain
// 前置: 用户 reload Chord 扩展 → 等 1 分钟（让 sw 写 chord_visitcounts_cache）

import { ClassicLevel } from 'classic-level'
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const STORAGE_DIR = '/Users/heyrain/Library/Application Support/Google/Chrome/Default/Local Extension Settings/bjlnjfajekhnmhjcdfjdoeokbgaheacm'
const SNAP = join(tmpdir(), 'chord-diag-terrain')
rmSync(SNAP, { recursive: true, force: true })
mkdirSync(SNAP, { recursive: true })
for (const f of readdirSync(STORAGE_DIR)) {
  try { copyFileSync(join(STORAGE_DIR, f), join(SNAP, f)) } catch {}
}

const db = new ClassicLevel(SNAP, { valueEncoding: 'utf8' })
await db.open({ createIfMissing: false })
const read = async (key) => { try { return JSON.parse(await db.get(key)) } catch { return null } }

const items = (await read('chord_items')) ?? []
const cache = (await read('chord_visitcounts_cache')) ?? {}
const clusters = (await read('chord_clusters')) ?? []
await db.close()

// 转 visitCounts 字典 → Map
const visitMap = new Map()
const cacheAge = cache._ts ? Math.round((Date.now() - Number(cache._ts)) / 60000) : null
for (const [k, v] of Object.entries(cache)) {
  if (k === '_ts') continue
  visitMap.set(k, Number(v))
}

console.log(`════════════ chord:diag-terrain ════════════`)
console.log(`items: ${items.length} · clusters: ${clusters.length}`)
console.log(`visitCounts cache: ${visitMap.size} 条 · ${cacheAge !== null ? `更新于 ${cacheAge} 分钟前` : '⚠️ 没有缓存 · reload 扩展 + 等 1 分钟'}`)

if (visitMap.size === 0) {
  console.log('\n❌ 没有 visitCounts cache · 请 reload Chord 扩展后重试')
  process.exit(1)
}

// 简版 TerrainClassifier · 跑两次算法对比
function classifyOne(items, visitCounts, threshold) {
  const now = Date.now()
  const DAY = 86_400_000
  const RECENT = 90 * DAY
  let used = 0
  let visitTotal = 0
  for (const it of items) {
    const v = visitCounts.get(it.id) ?? 0
    visitTotal += v
    const isUsed =
      it.usageChip === '实际用到了' ||
      v >= threshold ||
      (it.lastVisitedAt && now - it.lastVisitedAt < RECENT)
    if (isUsed) used++
  }
  return {
    total: items.length,
    used,
    visitTotal,
    rate: items.length ? used / items.length : 0,
  }
}

// 按 cluster 分组
const byCluster = new Map()
for (const it of items) {
  if (it.type !== 'content' || !it.cluster) continue
  if (!byCluster.has(it.cluster)) byCluster.set(it.cluster, [])
  byCluster.get(it.cluster).push(it)
}

console.log(`\n════════════ 算法对比 (v > 0 旧 vs v >= 2 新) ════════════\n`)

const rows = []
for (const [name, clItems] of byCluster) {
  const old = classifyOne(clItems, visitMap, 1)  // 旧：v > 0 = v >= 1
  const next = classifyOne(clItems, visitMap, 2)
  rows.push({
    name,
    total: old.total,
    visitTotal: old.visitTotal,
    oldUsed: old.used,
    oldRate: old.rate,
    newUsed: next.used,
    newRate: next.rate,
    diff: old.used - next.used,
  })
}
rows.sort((a, b) => b.total - a.total)

console.log('Cluster                          条数   累计visit  旧used  旧%    新used  新%    Δused  地形(旧→新)')
console.log('─'.repeat(110))

function terrainOf(rate) {
  if (rate >= 0.5) return '🌳 真热情之林'
  if (rate < 0.3) return '🌫 焦虑沼泽'
  return '⚪ 中间态'
}

for (const r of rows) {
  const oldT = terrainOf(r.oldRate)
  const newT = terrainOf(r.newRate)
  const changed = oldT !== newT ? '⚠️' : ' '
  console.log(
    `${r.name.padEnd(28)}  ${String(r.total).padStart(4)}  ${String(r.visitTotal).padStart(8)}   ${String(r.oldUsed).padStart(4)}  ${(r.oldRate * 100).toFixed(0).padStart(3)}%   ${String(r.newUsed).padStart(4)}  ${(r.newRate * 100).toFixed(0).padStart(3)}%   ${String(-r.diff).padStart(4)}  ${changed}${oldT} → ${newT}`
  )
}

console.log(`\n════════════ visitCount 分布（理解你 Chrome 行为）════════════\n`)
const buckets = { '0': 0, '1': 0, '2': 0, '3-5': 0, '6-10': 0, '>10': 0 }
for (const v of visitMap.values()) {
  if (v === 0) buckets['0']++
  else if (v === 1) buckets['1']++
  else if (v === 2) buckets['2']++
  else if (v <= 5) buckets['3-5']++
  else if (v <= 10) buckets['6-10']++
  else buckets['>10']++
}
for (const [k, v] of Object.entries(buckets)) {
  const bar = '▍'.repeat(Math.min(80, Math.round(v / Math.max(1, items.length) * 100)))
  console.log(`  v=${k.padEnd(5)}: ${String(v).padStart(4)} 条  ${bar}`)
}

const v1count = buckets['1']
const totalReal = visitMap.size
console.log(`\n关键观察: v=1 的占比 = ${(v1count / totalReal * 100).toFixed(1)}% (${v1count}/${totalReal})`)
console.log(`这部分是改算法后会被取消"used" 状态的 item。`)

console.log(`\n════════════ 结论 ════════════\n`)
const changed = rows.filter((r) => terrainOf(r.oldRate) !== terrainOf(r.newRate))
if (changed.length === 0) {
  console.log('  无 cluster 地形发生变化 · 阈值改动对你的数据没有 effect')
} else {
  console.log(`  ${changed.length} 个 cluster 地形发生变化:`)
  for (const c of changed) {
    console.log(`    · ${c.name}: ${terrainOf(c.oldRate)} → ${terrainOf(c.newRate)}`)
  }
}
