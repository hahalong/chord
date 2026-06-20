/**
 * SW 生命周期护航测试 · v0.1.2 新增
 *
 * 起因: CWS 用户两次报"正在分析 N 条收藏"banner 永不消失
 *       根因 MV3 SW fire-and-forget 半路被回收, status 卡 running:true
 * 护航: 这个文件 fail = 一定有 banner 卡死 bug, 不准发版
 */

import { describe, it, expect, vi } from 'vitest'
import {
  clearStaleReclusterStatus,
  makeKeepalive,
  runReclusterWithCoordination,
  type ReclusterStatus,
  type StatusStorage,
  type RuntimePinger,
} from './ReclusterCoordinator.js'

function memStorage(initial?: ReclusterStatus): StatusStorage & { _peek: () => ReclusterStatus | undefined } {
  let s: ReclusterStatus | undefined = initial
  return {
    get: async () => s,
    set: async (next) => { s = next },
    clear: async () => { s = undefined },
    _peek: () => s,
  }
}

function fakeTimerKeepalive() {
  const pinger: RuntimePinger & { calls: number } = {
    calls: 0,
    ping: async () => { pinger.calls++ },
  }
  return { pinger, keepalive: makeKeepalive(pinger, { intervalMs: 100 }) }
}

describe('clearStaleReclusterStatus · SW 启动无脑清', () => {
  it('running=true → 无脑清 (不管 elapsed)', async () => {
    const storage = memStorage({ running: true, startedAt: Date.now() - 1000 })  // 才 1 秒
    const r = await clearStaleReclusterStatus(storage)
    expect(r.cleared).toBe(true)
    expect(storage._peek()).toBeUndefined()
  })

  it('running=true 即使是 1 秒前的也清 · 之前 elapsed>3×eta 阈值导致 CWS 卡 banner', async () => {
    const storage = memStorage({ running: true, startedAt: Date.now() - 1000, estimatedSeconds: 3600 })
    const r = await clearStaleReclusterStatus(storage)
    expect(r.cleared).toBe(true)
  })

  it('running=false → 不动', async () => {
    const storage = memStorage({ running: false, lastCompletedAt: Date.now() })
    const r = await clearStaleReclusterStatus(storage)
    expect(r.cleared).toBe(false)
    expect(storage._peek()?.running).toBe(false)
  })

  it('storage 空 → 无副作用', async () => {
    const storage = memStorage()
    const r = await clearStaleReclusterStatus(storage)
    expect(r.cleared).toBe(false)
  })
})

describe('makeKeepalive · ping 启停', () => {
  it('start 后周期调 ping; stop 后立刻停', () => {
    vi.useFakeTimers()
    const { pinger, keepalive } = fakeTimerKeepalive()
    keepalive.start()
    expect(keepalive.isRunning()).toBe(true)
    vi.advanceTimersByTime(350)  // 3 次 100ms tick
    expect(pinger.calls).toBe(3)
    keepalive.stop()
    expect(keepalive.isRunning()).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(pinger.calls).toBe(3)  // stop 后不再涨
    vi.useRealTimers()
  })

  it('重复 start 幂等 · 不建多个 interval', () => {
    vi.useFakeTimers()
    const { pinger, keepalive } = fakeTimerKeepalive()
    keepalive.start()
    keepalive.start()
    keepalive.start()
    vi.advanceTimersByTime(100)
    expect(pinger.calls).toBe(1)  // 只一份 interval
    keepalive.stop()
    vi.useRealTimers()
  })

  it('pinger 异常不抛 · 不能让 setInterval 死循环报错', () => {
    vi.useFakeTimers()
    const badPinger: RuntimePinger = { ping: async () => { throw new Error('chrome runtime gone') } }
    const ka = makeKeepalive(badPinger, { intervalMs: 50 })
    ka.start()
    expect(() => vi.advanceTimersByTime(200)).not.toThrow()
    ka.stop()
    vi.useRealTimers()
  })
})

describe('runReclusterWithCoordination · fire-and-forget 终态护航', () => {
  it('recluster 成功 → status 写回 running:false + lastCompletedAt', async () => {
    const storage = memStorage()
    const { keepalive } = fakeTimerKeepalive()
    const r = await runReclusterWithCoordination({
      storage,
      keepalive,
      totalItems: 100,
      estimatedSeconds: 30,
      recluster: async () => { /* 模拟成功 */ },
    })
    expect(r.ok).toBe(true)
    const s = storage._peek()
    expect(s?.running).toBe(false)
    expect(s?.lastCompletedAt).toBeGreaterThan(0)
    expect(keepalive.isRunning()).toBe(false)
  })

  it('recluster 抛错 → status 仍写回 running:false + lastError · banner 一定消失', async () => {
    const storage = memStorage()
    const { keepalive } = fakeTimerKeepalive()
    const r = await runReclusterWithCoordination({
      storage,
      keepalive,
      totalItems: 100,
      estimatedSeconds: 30,
      recluster: async () => { throw new Error('AI 调用超时') },
    })
    expect(r.ok).toBe(false)
    const s = storage._peek()
    expect(s?.running).toBe(false)
    expect(s?.lastError).toContain('AI 调用超时')
    expect(keepalive.isRunning()).toBe(false)
  })

  it('recluster 跑期间 keepalive 一直 active', async () => {
    const storage = memStorage()
    const { keepalive } = fakeTimerKeepalive()
    let kaDuringRecluster = false
    await runReclusterWithCoordination({
      storage,
      keepalive,
      totalItems: 100,
      estimatedSeconds: 30,
      recluster: async () => { kaDuringRecluster = keepalive.isRunning() },
    })
    expect(kaDuringRecluster).toBe(true)
    expect(keepalive.isRunning()).toBe(false)  // 跑完一定 stop
  })

  it('storage.set 调用顺序: running:true 在 recluster 之前, running:false 在之后', async () => {
    const calls: string[] = []
    const storage: StatusStorage = {
      get: async () => undefined,
      set: async (s) => { calls.push(`set:running=${s.running}`) },
      clear: async () => { calls.push('clear') },
    }
    const { keepalive } = fakeTimerKeepalive()
    await runReclusterWithCoordination({
      storage,
      keepalive,
      totalItems: 100,
      estimatedSeconds: 30,
      recluster: async () => { calls.push('recluster') },
    })
    expect(calls).toEqual(['set:running=true', 'recluster', 'set:running=false'])
  })

  it('startedAt 一定带, totalItems / estimatedSeconds 透传', async () => {
    const storage = memStorage()
    const { keepalive } = fakeTimerKeepalive()
    const now = 1_700_000_000_000
    await runReclusterWithCoordination({
      storage,
      keepalive,
      totalItems: 197,
      estimatedSeconds: 30,
      recluster: async () => {
        // 跑期间 status 应该是 running:true
        const s = await storage.get()
        expect(s?.running).toBe(true)
        expect(s?.startedAt).toBe(now)
        expect(s?.totalItems).toBe(197)
        expect(s?.estimatedSeconds).toBe(30)
      },
      now: () => now,
    })
  })
})

describe('结构性 lint · 阻止 sw.ts 再裸调 ClusterService.recluster', () => {
  it('sw.ts 里所有 ClusterService.recluster 调用都必须在 runReclusterWithCoordination / maybeRunBackgroundRecluster 函数内', async () => {
    const fs = await import('node:fs')
    const url = await import('node:url')
    const path = await import('node:path')
    // 测试运行时 import.meta.url 是这个 test 文件的 url
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const swPath = path.resolve(here, '../../../../apps/extension/src/background/sw.ts')
    expect(fs.existsSync(swPath), `sw.ts 没找到: ${swPath} · 结构 lint 失效, 不准发版`).toBe(true)
    const src = fs.readFileSync(swPath, 'utf8')
    // 找所有 ClusterService.recluster( 调用的行号
    const lines = src.split('\n')
    const callLines: number[] = []
    lines.forEach((l, i) => { if (/ClusterService\.recluster\s*\(/.test(l)) callLines.push(i) })
    expect(callLines.length, 'sw.ts 里居然没 ClusterService.recluster · 是不是路径错了 或 lint 失效').toBeGreaterThan(0)

    for (const lineIdx of callLines) {
      // 向上找最近的函数边界, 判断在哪个函数里
      let inAllowedFn = false
      for (let i = lineIdx; i >= Math.max(0, lineIdx - 50); i--) {
        const l = lines[i]!
        if (/function\s+(maybeRunBackgroundRecluster|runReclusterWithCoordination)\b/.test(l)) {
          inAllowedFn = true
          break
        }
        // 撞到其他 function 定义 → 不在允许的函数内
        if (/^(async\s+)?function\s+\w/.test(l)) break
      }
      if (!inAllowedFn) {
        throw new Error(
          `sw.ts:${lineIdx + 1} 调用了 ClusterService.recluster 但不在 maybeRunBackgroundRecluster / runReclusterWithCoordination 内。` +
          `\n  fire-and-forget recluster 必须经协调器包装, 否则 SW 被回收时 status 卡 running:true。` +
          `\n  改用 maybeRunBackgroundRecluster() 调用。`
        )
      }
    }
  })
})
