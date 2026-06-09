#!/usr/bin/env node
/**
 * 直接读用户 Chrome 磁盘上 Chord 扩展的 storage，输出诊断报告。
 *
 * E-005 (评测方法论)：eval 数据 vs 用户实际数据不同步是常见排查陷阱
 * （用户看到 89 misc，eval 跑出来 9 misc，两份是不同时间点的不同状态）。
 * 这个脚本绕过 export 流程直接看「用户当下到底看到了什么」。
 *
 * 用法：
 *   pnpm --filter @chord/core chord:inspect              # 仅打印报告
 *   pnpm --filter @chord/core chord:inspect --export     # 同时导出 /tmp/chord-user-snapshot.json
 *   pnpm --filter @chord/core eval:user-storage          # = chord:inspect --export + 跑 AI eval
 *
 * 只支持 macOS（Chrome Default profile）；其他平台后续按需扩展。
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── 配置 ─────────────────────────────────────────────
// Chord 扩展的解包路径 → SHA-256 hex → 0-f 映射 a-p = 扩展 ID
// 这避免了「让用户告诉我 ID」，也避免了扫所有扩展目录的权限拦截
const UNPACKED_PATH = resolve(__dirname, '../../../../apps/extension/dist')
const EXT_ID = [...createHash('sha256').update(UNPACKED_PATH).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join('')

const CHROME_PROFILE = process.env.CHORD_CHROME_PROFILE
  ?? join(homedir(), 'Library/Application Support/Google/Chrome/Default')
const STORAGE_DIR = join(CHROME_PROFILE, 'Local Extension Settings', EXT_ID)
const SNAPSHOT_DIR = '/tmp/chord-storage-snapshot'
const EXPORT_PATH = process.env.CHORD_USER_SNAPSHOT ?? '/tmp/chord-user-snapshot.json'

const args = process.argv.slice(2)
const exportMode = args.includes('--export')

// ─── 校验 ─────────────────────────────────────────────
if (!existsSync(STORAGE_DIR)) {
  console.error(`❌ 没找到 Chord storage: ${STORAGE_DIR}`)
  console.error('   计算出的扩展 ID:', EXT_ID)
  console.error('   解包路径:', UNPACKED_PATH)
  console.error('   如果 Chrome profile 路径不一样，设置 CHORD_CHROME_PROFILE 环境变量')
  process.exit(1)
}

// ─── Copy storage（避免跟 Chrome 锁冲突）──────────────────
rmSync(SNAPSHOT_DIR, { recursive: true, force: true })
mkdirSync(SNAPSHOT_DIR, { recursive: true })
for (const f of readdirSync(STORAGE_DIR)) {
  try { copyFileSync(join(STORAGE_DIR, f), join(SNAPSHOT_DIR, f)) } catch {}
}

// ─── 读 leveldb ───────────────────────────────────────
const { ClassicLevel } = await import('classic-level')
const db = new ClassicLevel(SNAPSHOT_DIR, { valueEncoding: 'utf8' })
await db.open({ createIfMissing: false })

const read = async (key) => {
  try { return JSON.parse(await db.get(key)) }
  catch { return null }
}

const items = await read('chord_items') ?? []
const clusters = await read('chord_clusters') ?? []
const settings = await read('chord_settings') ?? {}
const reclusterStatus = await read('chord_recluster_status') ?? {}

await db.close()

// ─── 诊断报告 ─────────────────────────────────────────
console.log('=== Chord 用户存储诊断 ===')
console.log('扩展 ID:', EXT_ID)
console.log('Storage:', STORAGE_DIR)
console.log()

// 1. AI 配置（B-006 / D-006：选了 provider 没填 key 是常见陷阱）
const ai = settings.aiEngine ?? {}
const providerKey = ai.provider && ai.provider !== 'chord_bundled'
  ? (ai.providerKeys?.[ai.provider] ?? '')
  : '(bundled, no key needed)'
console.log('--- AI 引擎 ---')
console.log('  provider:', ai.provider ?? '(未设置)')
console.log('  mode:', ai.mode)
console.log('  key:', ai.provider === 'chord_bundled' ? '(bundled)' : (providerKey ? '✓ 已填' : '✗ 未填 ⚠️'))
if (ai.provider && ai.provider !== 'chord_bundled' && !providerKey) {
  console.log('  ⚠️  没填 key → AI 调用会失败 → 聚类卡在历史结果')
}
console.log()

// 2. Cluster 状态（D-001 / B-003：TFIDF 残留会让 cluster 名变 n-gram 乱码）
console.log('--- Cluster 状态（共', clusters.length, '个）---')
const tfidfClusters = clusters.filter((c) => c.algorithm === 'tfidf')
const aiClusters = clusters.filter((c) => c.algorithm === 'ai')
const unmarkedClusters = clusters.filter((c) => !c.algorithm)
console.log('  AI:', aiClusters.length, '| TFIDF:', tfidfClusters.length, '| 未标 (老数据):', unmarkedClusters.length)
if (tfidfClusters.length > 0) {
  console.log('  ⚠️  存在 TFIDF cluster → AI 之前失败了，看 lastError 排查')
}
const lastUpdate = clusters.length > 0 ? Math.max(...clusters.map((c) => c.updatedAt)) : 0
if (lastUpdate) console.log('  上次 recluster:', new Date(lastUpdate).toLocaleString())
clusters.sort((a, b) => b.itemIds.length - a.itemIds.length).forEach((c) => {
  const tag = c.algorithm === 'tfidf' ? ' ⚠️tfidf' : ''
  console.log(`  ${c.name.padEnd(28)} items=${String(c.itemIds?.length ?? 0).padStart(3)}${tag}`)
})
console.log()

// 3. Recluster 状态
console.log('--- Recluster Status ---')
console.log('  running:', reclusterStatus.running ?? false)
if (reclusterStatus.lastCompletedAt) console.log('  lastCompletedAt:', new Date(reclusterStatus.lastCompletedAt).toLocaleString())
if (reclusterStatus.lastError) console.log('  ⚠️ lastError:', reclusterStatus.lastError)
console.log()

// 4. Items 分布
console.log('--- Items 分布（共', items.length, '）---')
const byType = {}
const byStatus = {}
for (const i of items) {
  byType[i.type ?? 'unknown'] = (byType[i.type ?? 'unknown'] ?? 0) + 1
  byStatus[i.status ?? 'unknown'] = (byStatus[i.status ?? 'unknown'] ?? 0) + 1
}
console.log('  by type:', byType)
console.log('  by status:', byStatus)

// 5. Cluster 字段覆盖率（D-003：可能跟 Cluster.itemIds 不一致）
const contentItems = items.filter((i) => i.type === 'content')
const nocluster = contentItems.filter((i) => !i.cluster)
console.log('  content items 共:', contentItems.length, '| 缺 cluster:', nocluster.length)
if (nocluster.length > 0) {
  console.log('  ⚠️ 缺 cluster 的 content 项（这些不会出现在 Dashboard 的桶里，但占总数）:')
  nocluster.slice(0, 10).forEach((i) => {
    console.log(`    - ${(i.title ?? '').slice(0, 60)}`)
  })
}

// content items 但被 URLClassifier 错判成 tool 的（D-002 / 边界 case）
const toolItems = items.filter((i) => i.type === 'tool')
const toolNoCluster = toolItems.filter((i) => !i.cluster)
if (toolNoCluster.length > 0) {
  console.log()
  console.log('  type=tool 但可能应该是 content 的（被 URLClassifier 错判）:')
  toolNoCluster.slice(0, 5).forEach((i) => {
    console.log(`    - ${(i.title ?? '').slice(0, 50)} | ${i.sourceDomain ?? ''}`)
  })
}
console.log()

// 6. 「其他」cluster 内容（P-002 / BC-013 系列陷阱）
const miscCluster = clusters.find((c) => c.name === '其他')
if (miscCluster && miscCluster.itemIds?.length > 0) {
  console.log('--- 「其他」类内容（共', miscCluster.itemIds.length, '条）---')
  const miscRatio = miscCluster.itemIds.length / contentItems.length
  console.log(`  占 content 总数: ${(miscRatio * 100).toFixed(1)}% (阈值 < 15%)`)
  if (miscRatio >= 0.15) console.log('  ⚠️ 超过阈值！跑 pnpm eval:user-storage 看 AI 重判是否能挽救')
  const miscItems = contentItems.filter((i) => miscCluster.itemIds.includes(i.id))
  miscItems.slice(0, 10).forEach((i) => {
    console.log(`    - ${(i.title ?? '').slice(0, 60)} | ${i.sourceDomain ?? ''}`)
  })
  if (miscItems.length > 10) console.log(`    ... 还有 ${miscItems.length - 10} 条`)
}
console.log()

// ─── 导出 eval 兼容格式 ───────────────────────────────
if (exportMode) {
  const snapshot = {
    _meta: {
      exportedAt: new Date().toISOString(),
      source: 'chord:inspect --export',
      extId: EXT_ID,
      note: '从用户 Chrome 磁盘读出的当下状态。仅含 title + sourceDomain + 必要元数据，无 privateNote / userNote / 完整 URL',
    },
    items: items.map((i) => ({
      id: i.id,
      title: (i.title ?? '').slice(0, 200),
      sourceDomain: i.sourceDomain ?? '',
      type: i.type,
      status: i.status,
      cluster: i.cluster,
    })),
  }
  writeFileSync(EXPORT_PATH, JSON.stringify(snapshot, null, 2))
  console.log(`✓ 已导出快照到 ${EXPORT_PATH}（${snapshot.items.length} 条）`)
  console.log(`  跑 AI eval：CHORD_EVAL_REAL_DATASET=${EXPORT_PATH} pnpm --filter @chord/core eval:real`)
  console.log(`  或直接：pnpm --filter @chord/core eval:user-storage`)
}
