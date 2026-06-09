/** 读用户磁盘 LevelDB → 跑 computeAllIdentities → 打印当前 Chord Triad
 *  用于 v3.1.x 改动后验证「真实账号」归属
 *
 *  默认不跑（避免别的 dev clone 后没有用户 Chrome profile 失败 / 浪费 CI 时间）
 *  跑法：CHORD_INSPECT_REAL=1 pnpm vitest run src/testing/real-user-identity.test.ts
 *
 *  环境变量：
 *    CHORD_INSPECT_REAL=1                必填，作为 opt-in 闸门
 *    CHORD_EXTENSION_PATH=<abs path>     覆盖默认 unpack 路径
 *    CHORD_CHROME_PROFILE=<abs path>     覆盖默认 Chrome profile 路径
 */
import { describe, it } from 'vitest'
import { copyFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { computeAllIdentities, getComboCode } from '../services/IdentityService.js'

const DAY = 86_400_000

describe('真实账号 Chord Triad', () => {
  it.skipIf(!process.env.CHORD_INSPECT_REAL)('print', async () => {
    const UNPACKED_PATH = process.env.CHORD_EXTENSION_PATH
      ?? resolve(__dirname, '../../../../apps/extension/dist')
    const EXT_ID = [...createHash('sha256').update(UNPACKED_PATH).digest('hex').slice(0, 32)]
      .map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('')
    const CHROME_PROFILE = process.env.CHORD_CHROME_PROFILE
      ?? join(homedir(), 'Library/Application Support/Google/Chrome/Default')
    const STORAGE_DIR = join(CHROME_PROFILE, 'Local Extension Settings', EXT_ID)
    const SNAPSHOT_DIR = '/tmp/chord-triad-snapshot'

    if (!existsSync(STORAGE_DIR)) {
      console.log(`SKIP: storage 不存在 ${STORAGE_DIR}`)
      return
    }
    rmSync(SNAPSHOT_DIR, { recursive: true, force: true })
    mkdirSync(SNAPSHOT_DIR, { recursive: true })
    for (const f of readdirSync(STORAGE_DIR)) {
      try { copyFileSync(join(STORAGE_DIR, f), join(SNAPSHOT_DIR, f)) } catch {}
    }
    const { ClassicLevel } = await import('classic-level')
    const db = new ClassicLevel(SNAPSHOT_DIR, { valueEncoding: 'utf8' })
    await db.open({ createIfMissing: false })
    const items = JSON.parse(await db.get('chord_items'))
    await db.close()

    const now = Date.now()
    const content = items.filter((i: any) => i.type === 'content')
    const active = content.filter((i: any) => i.status !== 'released')
    const processed = content.filter((i: any) => i.status !== 'pending')
    const oldest = Math.min(...content.map((i: any) => i.savedAt))
    const newest = Math.max(...content.map((i: any) => i.savedAt))
    const recent30 = content.filter((i: any) => i.savedAt >= now - 30 * DAY)
    const recent90 = content.filter((i: any) => i.savedAt >= now - 90 * DAY)
    const recent30Clusters = new Set(recent30.map((i: any) => i.cluster).filter(Boolean))
    const recent90Clusters = new Set(recent90.map((i: any) => i.cluster).filter(Boolean))
    const withChip = content.filter((i: any) => i.usageChip)

    console.log(`\n=== 真实账号 stats ===`)
    console.log(`items 总: ${items.length} | content: ${content.length} | active: ${active.length}`)
    console.log(`pending: ${content.filter((i: any) => i.status === 'pending').length} | kept: ${content.filter((i: any) => i.status === 'kept').length} | released: ${content.filter((i: any) => i.status === 'released').length}`)
    console.log(`oldest: ${((now - oldest) / DAY).toFixed(0)} 天前 | newest: ${((now - newest) / DAY).toFixed(0)} 天前`)
    console.log(`processRate (含 release): ${(processed.length / content.length * 100).toFixed(0)}%`)
    console.log(`recent30: ${recent30.length} 条 / ${recent30Clusters.size} 主题`)
    console.log(`recent90: ${recent90.length} 条 / ${recent90Clusters.size} 主题`)
    console.log(`有 chip: ${withChip.length}`)

    const cards = computeAllIdentities(items)
    console.log(`\n=== Chord Triad: ${getComboCode(cards)} ===`)
    if (cards.length === 0) console.log('  （无身份卡）')
    for (const c of cards) {
      console.log(`\n  [${c.dimension}] ${c.id} (${c.name})  extremity=${c.extremity.toFixed(2)} conf=${c.confidence.toFixed(2)}`)
      console.log(`    claim:    ${c.claim}`)
      console.log(`    evidence: ${c.evidence}`)
    }
    console.log()
  }, 30_000)
})
