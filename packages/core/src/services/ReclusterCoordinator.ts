/**
 * Recluster 协调器 · 抽 sw.ts 的 SW 生命周期逻辑成纯函数，让单测能护航
 *
 * 为什么独立: MV3 Service Worker 没有持久 JS context, fire-and-forget promise 跟 SW 一起死
 *           → chord_recluster_status: { running: true } 永远不会写回 false
 *           → 用户看到「正在分析…」横幅永不消失（v0.1.1 / v0.1.2 实测踩过两次）
 *
 * 协调器接受 storage / runtime adapter, 不依赖真实 chrome.* 全局, 可被 vitest 直接驱动。
 */

export interface ReclusterStatus {
  running: boolean
  startedAt?: number
  totalItems?: number
  estimatedSeconds?: number
  lastError?: string
  lastCompletedAt?: number
}

/** 抽象 storage · 测试注入内存 Map, 生产注入 chrome.storage.local wrapper */
export interface StatusStorage {
  get(): Promise<ReclusterStatus | undefined>
  set(s: ReclusterStatus): Promise<void>
  clear(): Promise<void>
}

/** 抽象 runtime ping · 测试注入 counter, 生产注入 chrome.runtime.getPlatformInfo */
export interface RuntimePinger {
  ping(): Promise<void>
}

/**
 * SW 启动时无条件清 stale running · v0.1.2 修法
 *   背景: 之前用 elapsed > 3×eta 阈值, CWS 用户实测仍卡 banner
 *   现在: SW 重启 = 前 task 必死 (fire-and-forget promise 跟 JS context 一起没了)
 *        → running:true 残留必然 stale, 无脑清
 */
export async function clearStaleReclusterStatus(storage: StatusStorage): Promise<{ cleared: boolean; elapsed?: number }> {
  const s = await storage.get()
  if (!s?.running) return { cleared: false }
  const elapsed = s.startedAt ? Date.now() - s.startedAt : 0
  await storage.clear()
  return { cleared: true, elapsed: Math.round(elapsed / 1000) }
}

/**
 * Keepalive controller · 跑 recluster 期间防止 MV3 SW 30 秒空闲被回收
 *
 * 用法:
 *   const ka = makeKeepalive(pinger, { intervalMs: 20_000 })
 *   ka.start()
 *   try { await recluster() } finally { ka.stop() }
 *
 * 契约:
 *   start() 后周期调 pinger.ping
 *   stop() 后立刻不再 ping (验证 isRunning === false)
 *   重复 start 幂等 (不会建多个 interval)
 */
export interface KeepaliveController {
  start(): void
  stop(): void
  isRunning(): boolean
}

export function makeKeepalive(pinger: RuntimePinger, opts: { intervalMs?: number; setInterval?: typeof globalThis.setInterval; clearInterval?: typeof globalThis.clearInterval } = {}): KeepaliveController {
  const intervalMs = opts.intervalMs ?? 20_000
  const setI = opts.setInterval ?? globalThis.setInterval
  const clearI = opts.clearInterval ?? globalThis.clearInterval
  let timer: ReturnType<typeof setInterval> | null = null

  return {
    start() {
      if (timer) return  // 幂等
      timer = setI(() => {
        pinger.ping().catch(() => {})
      }, intervalMs)
    },
    stop() {
      if (timer) { clearI(timer); timer = null }
    },
    isRunning() {
      return timer !== null
    },
  }
}

/**
 * Recluster 跑全程协调 · fire-and-forget 必须用此包装, 杜绝裸 .then().catch()
 *
 * 契约 (单测重点护航):
 *   1. 跑前一定写 running:true + startedAt
 *   2. keepalive 在 recluster promise 开始时 start
 *   3. recluster 不管成功失败, status 一定写回 running:false
 *   4. recluster 不管成功失败, keepalive 一定 stop
 *
 * 这是本协调器存在的根本理由: 第 3/4 条之前在 sw.ts 里靠人肉记得写 .finally,
 * 现在用类型 + 单测强制, 漏写 → CI 红。
 */
export async function runReclusterWithCoordination(args: {
  storage: StatusStorage
  keepalive: KeepaliveController
  totalItems: number
  estimatedSeconds: number
  recluster: () => Promise<void>
  now?: () => number
}): Promise<{ ok: boolean; error?: string }> {
  const now = args.now ?? Date.now

  // P1-15 · 入口拦并发：任何 caller（SW message / Terrain forceRecluster / alarm）撞上 running:true 都 return
  //   跟 sw.ts 入口 P0-6 storage 检查互不冗余——不同入口的多层防御
  const curr = await args.storage.get()
  if (curr?.running) {
    const elapsed = curr.startedAt ? now() - curr.startedAt : 0
    const timeout = (curr.estimatedSeconds ?? 60) * 3 * 1000
    if (elapsed < timeout) {
      return { ok: false, error: 'already_running' }
    }
    // stale → 清掉后继续
  }

  await args.storage.set({
    running: true,
    startedAt: now(),
    totalItems: args.totalItems,
    estimatedSeconds: args.estimatedSeconds,
  })
  args.keepalive.start()
  try {
    await args.recluster()
    await args.storage.set({ running: false, lastCompletedAt: now() })
    return { ok: true }
  } catch (e) {
    const msg = (e as Error).message?.slice(0, 200) ?? String(e)
    await args.storage.set({ running: false, lastError: msg, lastCompletedAt: now() })
    return { ok: false, error: msg }
  } finally {
    args.keepalive.stop()
  }
}
