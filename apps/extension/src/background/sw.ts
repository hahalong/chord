import {
  ItemService, ResurfaceService, StreakService, ClusterService, Migration,
  EchoIndexService, NotificationBudgetService, EchoMomentService, RecallService, MilestoneService,
  ExperimentService,
  buildEngine, classifyURL, getFaviconUrl, nextOccurrenceOf,
} from '@chord/core'
import { ChromeStorageAdapter } from '../storage/ChromeStorageAdapter.js'
import { DEFAULT_NOTIFICATIONS } from '@chord/types'
import type { UserSettings, Experiment, ExperimentOutcome } from '@chord/types'
import type { BudgetLog, RecallFiredLog, MilestoneFiredLog } from '@chord/core'

const adapter = new ChromeStorageAdapter()

// ─── 主动出现系统：Icon Badge ─────────────────────────────────
// Plan §Layer 0：badge 显示 echoIndex >= 60 的 pending/kept item 数
// 实时跟踪 chrome.storage 变化，1s debounce 避免高频更新
let badgeRefreshTimer: ReturnType<typeof setTimeout> | null = null
let lastBadgeCount = -1   // cache，相等时跳过 setBadgeText 调用
function scheduleBadgeRefresh() {
  if (badgeRefreshTimer) clearTimeout(badgeRefreshTimer)
  badgeRefreshTimer = setTimeout(() => {
    badgeRefreshTimer = null
    refreshBadge().catch((e) => console.warn('[Chord] badge refresh failed:', e))
  }, 1000)
}

async function refreshBadge() {
  const t0 = performance.now()
  const settings = await adapter.getSettings()
  const notif = settings.notifications ?? DEFAULT_NOTIFICATIONS
  const mode = notif.badgeMode ?? 'number'

  if (mode === 'off') {
    if (lastBadgeCount !== 0) {
      chrome.action.setBadgeText({ text: '' })
      chrome.action.setTitle({ title: 'Chord · 念念不忘，必有回响' })
      lastBadgeCount = 0
    }
    return
  }

  const items = await adapter.getItems({ status: ['pending', 'kept'], type: ['content'] })
  const visitCounts = await ChromeStorageAdapter.getVisitCounts(items.map((i) => ({ id: i.id, url: i.url })))
  // v3.1.32 · 把 visitCounts 快照存 chrome.storage.local，给 chord:diag-terrain Node 脚本读
  //   {[itemId]: visitCount, _ts: 时间戳}
  try {
    const snapshot: Record<string, number | string> = { _ts: String(Date.now()) }
    for (const [id, v] of visitCounts) snapshot[id] = v
    chrome.storage.local.set({ chord_visitcounts_cache: snapshot })
  } catch {/* 缓存失败不影响主流程 */}
  const ready = EchoIndexService.countReadyToEcho(items, visitCounts)

  if (ready === lastBadgeCount) return   // 没变化，省一次 chrome API 调用
  lastBadgeCount = ready

  if (ready === 0) {
    chrome.action.setBadgeText({ text: '' })
    chrome.action.setTitle({ title: 'Chord · 念念不忘，必有回响' })
  } else {
    const text = mode === 'dot' ? '·' : (ready > 9 ? '9+' : String(ready))
    chrome.action.setBadgeText({ text })
    chrome.action.setBadgeBackgroundColor({ color: '#D9706A' })
    chrome.action.setTitle({ title: `Chord · ${ready} 条想跟你说话` })
  }
  const dt = performance.now() - t0
  if (dt > 100) console.log(`[Chord] badge refresh took ${Math.round(dt)}ms (${items.length} items, ${ready} ready)`)
}

// chord_items / chord_settings 任意变化都触发 badge 重算（debounced）
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return
  if (changes['chord_items'] || changes['chord_settings']) {
    scheduleBadgeRefresh()
  }
})

// 求「原收藏时间」：取 bookmark.dateAdded 与 chrome.history 最早访问时间的较早者
// 用户可能 2 年前看过此页、1 天前才加书签——以更早的为准（更接近"用户最早接触"的语义）
// 任一来源不可用时用另一个；都不可用返回 undefined（让 ItemService 走 Date.now() fallback）
async function earliestSavedAt(url: string, dateAdded?: number): Promise<number | undefined> {
  const earliestVisit = await ChromeStorageAdapter.getEarliestVisit(url)
  if (typeof dateAdded === 'number' && dateAdded > 0 && earliestVisit !== null) {
    return Math.min(dateAdded, earliestVisit)
  }
  if (typeof dateAdded === 'number' && dateAdded > 0) return dateAdded
  if (earliestVisit !== null) return earliestVisit
  return undefined
}

// ─── 首次安装 ───────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html#onboarding') })
  }

  // 扩展更新（Chrome 静默升级）：给已经打开的 Options/Popup 标签发广播
  // 让它们提示用户「刷新一下用新版」，避免老 JS 跑新 SW 出怪事
  if (details.reason === 'update') {
    const newVersion = chrome.runtime.getManifest().version
    await chrome.storage.local.set({
      chord_extension_updated: {
        from: details.previousVersion ?? 'unknown',
        to: newVersion,
        at: Date.now(),
        dismissed: false,
      },
    })
  }

  await registerAlarmIfNeeded()
  // 扩展更新/安装时立刻检查是否需要 recluster（算法升级时让用户尽快看到新结果）
  // 用短延迟而非立刻调用：避免和首次 install 的 onboarding 流程抢资源
  await chrome.alarms.create('chord_background_recluster', { delayInMinutes: 0.5 })

  // SW 启动时立刻清 stale recluster_status（上次 recluster 被 SW 生命周期中断卡住的）
  clearStaleReclusterStatus().catch((e) => console.warn('[Chord] clear stale status failed:', e))

  // 一次性 migration：用 chrome.history 最早访问时间回溯修正 savedAt
  migrateSavedAtToEarliestVisit().catch((e) => console.warn('[Chord] savedAt v1 migration failed:', e))
  // v3.1.28-2 · savedAt v2 修复（解决 import dateAdded 丢失 bug）
  migrateSavedAtV2().catch((e) => console.warn('[Chord] savedAt v2 migration failed:', e))

  // v2 二向决策迁移：把老的 status='used' 改成 status='kept' + migratedFromUsed=true
  // 详见 Chord_二向决策_实施方案.md §1
  migrateUsedStatusToKept().catch((e) => console.warn('[Chord] status v2 migration failed:', e))

  // SaveIntent v2 Sprint B.1：老 saveIntent → 多标签 saveIntents
  migrateSaveIntentsV2Wrapper().catch((e) => console.warn('[Chord] saveIntents v2 migration failed:', e))

  // 主动出现：立即刷一次 badge
  refreshBadge().catch((e) => console.warn('[Chord] initial badge refresh failed:', e))
  // 主动出现 Phase 4：注册 recall daily alarm
  ensureRecallAlarm().catch((e) => console.warn('[Chord] recall alarm register failed:', e))
  // SaveIntent v2：注册 intent batch alarm（每小时补判 unknown）
  ensureIntentBatchAlarm().catch((e) => console.warn('[Chord] intent alarm register failed:', e))
})

chrome.runtime.onStartup.addListener(async () => {
  await registerAlarmIfNeeded()
  // 浏览器启动 / SW 唤醒：检查是否需要 recluster
  await chrome.alarms.create('chord_background_recluster', { delayInMinutes: 0.5 })

  clearStaleReclusterStatus().catch((e) => console.warn('[Chord] clear stale status failed:', e))
  migrateSavedAtToEarliestVisit().catch((e) => console.warn('[Chord] savedAt v1 migration failed:', e))
  // v3.1.28-2 · savedAt v2 修复（解决 import dateAdded 丢失 bug）
  migrateSavedAtV2().catch((e) => console.warn('[Chord] savedAt v2 migration failed:', e))
  migrateUsedStatusToKept().catch((e) => console.warn('[Chord] status v2 migration failed:', e))
  migrateSaveIntentsV2Wrapper().catch((e) => console.warn('[Chord] saveIntents v2 migration failed:', e))

  // 主动出现：浏览器启动也刷一次
  refreshBadge().catch((e) => console.warn('[Chord] startup badge refresh failed:', e))
  ensureRecallAlarm().catch((e) => console.warn('[Chord] recall alarm register failed:', e))
  ensureIntentBatchAlarm().catch((e) => console.warn('[Chord] intent alarm register failed:', e))
})

// SW 启动时清掉「卡住的 recluster_status」
// MV3 SW 生命周期：跑 recluster 期间 SW 可能被回收，{ running: true } 的 status 永远写不到 { running: false }
// 用户看到「正在分析…」横幅永远不消失
//
// v0.1.2 · 改成"无条件清"——SW 重启 = 前一个 task 必死（fire-and-forget promise 跟 JS context 一起没了）
//          之前用 elapsed > 3×eta 阈值，CWS 用户实测仍会卡在 banner（eta 估的 30s 太短，elapsed 始终在阈值内来回弹）
async function clearStaleReclusterStatus() {
  const data = await chrome.storage.local.get('chord_recluster_status')
  const s = data['chord_recluster_status'] as { running?: boolean; startedAt?: number } | undefined
  if (!s?.running) return
  await chrome.storage.local.remove('chord_recluster_status')
  const elapsed = s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : 0
  console.log(`[Chord] SW 启动 · 清掉 stale recluster_status (elapsed ${elapsed}s; SW 重启等于前 task 必死)`)
}

// v0.1.2 · keepalive · 让 SW 在跑 recluster 期间保持活跃
//   背景: MV3 SW 在没有活跃 listener 时 30 秒被回收；fire-and-forget 的 promise 跟 JS context 一起死
//   做法: 每 20 秒访问 chrome.runtime / chrome.storage 重置 SW 的回收计时器
let keepaliveTimer: ReturnType<typeof setInterval> | null = null
function startReclusterKeepalive() {
  if (keepaliveTimer) return
  keepaliveTimer = setInterval(() => {
    chrome.runtime.getPlatformInfo().catch(() => {})  // 任何 chrome API 调用都能重置计时器
  }, 20_000)
}
function stopReclusterKeepalive() {
  if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null }
}

/** v3.1.28-2 · savedAt v2 修复 · 解决 import 时 dateAdded 丢失导致全部 savedAt = import 时间的 bug
 *  实测：83 条 bookmark 的 savedAt 都被设成同一个时间戳（import 那刻）
 *
 *  跟 v1 的区别：
 *  - v1 只用 chrome.history.getEarliestVisits，对老书签可能没数据
 *  - v2 同时拉 chrome.bookmarks.getTree() 拿真 dateAdded，跟 history 取最早
 *  - v2 不依赖 v1 的 flag（用独立 chord_savedat_migrated_v2 flag）
 *  - 支持 force=true 跳过 flag（给 Settings 按钮用）
 *
 *  返回 { totalChecked, updated, oldest, newest } 让 UI 可以显示进度
 */
async function migrateSavedAtV2(force = false): Promise<{ totalChecked: number; updated: number; oldestDaysAgo: number; newestDaysAgo: number }> {
  if (!force) {
    const flag = await chrome.storage.local.get('chord_savedat_migrated_v2')
    if (flag['chord_savedat_migrated_v2']) {
      return { totalChecked: 0, updated: 0, oldestDaysAgo: 0, newestDaysAgo: 0 }
    }
  }

  const items = await adapter.getItems()
  const bookmarkItems = items.filter((i) => i.source === 'bookmark' || i.source === 'bookmark_auto')
  if (bookmarkItems.length === 0) {
    await chrome.storage.local.set({ chord_savedat_migrated_v2: { at: Date.now(), updated: 0, total: 0 } })
    return { totalChecked: 0, updated: 0, oldestDaysAgo: 0, newestDaysAgo: 0 }
  }

  console.log(`[Chord] savedAt v2 修复：检查 ${bookmarkItems.length} 条 bookmark items…`)

  // 1. 拉 chrome.bookmarks 全部 → 建 url → dateAdded 索引（用真 dateAdded 而非依赖 import 时传入的值）
  const bookmarkIndex = new Map<string, number>()
  try {
    const tree = await chrome.bookmarks.getTree()
    const walk = (node: chrome.bookmarks.BookmarkTreeNode) => {
      if (node.url && typeof node.dateAdded === 'number' && node.dateAdded > 0) {
        bookmarkIndex.set(node.url, node.dateAdded)
      }
      node.children?.forEach(walk)
    }
    tree.forEach(walk)
  } catch (e) {
    console.warn('[Chord] migrateSavedAtV2: chrome.bookmarks.getTree failed:', e)
  }

  // 2. 拉 chrome.history 最早访问
  const urls = bookmarkItems.map((i) => i.url)
  const earliestVisits = await ChromeStorageAdapter.getEarliestVisits(urls)

  // 3. 对每个 item，取 min(bookmark.dateAdded, earliestVisit, currentSavedAt)
  const NOW = Date.now()
  let updated = 0
  for (const item of bookmarkItems) {
    const candidates: number[] = []
    const bmDate = bookmarkIndex.get(item.url)
    if (typeof bmDate === 'number' && bmDate > 0 && bmDate <= NOW) candidates.push(bmDate)
    const earliest = earliestVisits.get(item.url)
    if (typeof earliest === 'number' && earliest > 0 && earliest <= NOW) candidates.push(earliest)
    if (candidates.length === 0) continue

    const earliestNew = Math.min(...candidates)
    // 只在新值比当前 savedAt 更早 ≥ 1 天 时 update（避免噪声 update）
    if (earliestNew < item.savedAt - 86_400_000) {
      await adapter.putItem({ ...item, savedAt: earliestNew })
      updated++
    }
  }

  // 统计 oldest/newest
  const refreshed = await adapter.getItems()
  const bookmarks = refreshed.filter((i) => i.source === 'bookmark' || i.source === 'bookmark_auto')
  const oldest = bookmarks.length > 0 ? Math.min(...bookmarks.map((i) => i.savedAt)) : NOW
  const newest = bookmarks.length > 0 ? Math.max(...bookmarks.map((i) => i.savedAt)) : NOW
  const oldestDaysAgo = Math.floor((NOW - oldest) / 86_400_000)
  const newestDaysAgo = Math.floor((NOW - newest) / 86_400_000)

  console.log(`[Chord] savedAt v2 done: 修正 ${updated}/${bookmarkItems.length} 条；oldest=${oldestDaysAgo}d, newest=${newestDaysAgo}d`)
  await chrome.storage.local.set({
    chord_savedat_migrated_v2: { at: Date.now(), updated, total: bookmarkItems.length, oldestDaysAgo, newestDaysAgo },
  })
  return { totalChecked: bookmarkItems.length, updated, oldestDaysAgo, newestDaysAgo }
}

// 一次性 migration：把现有 item 的 savedAt 回溯成「chrome.history 最早访问时间」
// 用户反馈：bookmark.dateAdded 可能是 Chrome 同步时刷新的，不反映真正的「最早接触」时间
// 通过 chord_savedat_migrated_v1 flag 防重跑
async function migrateSavedAtToEarliestVisit() {
  const flag = await chrome.storage.local.get('chord_savedat_migrated_v1')
  if (flag['chord_savedat_migrated_v1']) return

  const items = await adapter.getItems()
  if (items.length === 0) {
    await chrome.storage.local.set({ chord_savedat_migrated_v1: { at: Date.now(), updated: 0, total: 0 } })
    return
  }

  console.log(`[Chord] savedAt migration: 检查 ${items.length} 条 item 的 chrome.history…`)
  const urls = items.map((i) => i.url)
  const earliestVisits = await ChromeStorageAdapter.getEarliestVisits(urls)

  let updatedCount = 0
  for (const item of items) {
    const earliest = earliestVisits.get(item.url)
    if (earliest === undefined) continue
    if (earliest >= item.savedAt) continue   // 现有 savedAt 已经更早或相同，不动
    await adapter.putItem({ ...item, savedAt: earliest })
    updatedCount++
  }

  console.log(`[Chord] savedAt migration done: ${updatedCount}/${items.length} 条被修正成更早的 history 时间`)
  await chrome.storage.local.set({
    chord_savedat_migrated_v1: { at: Date.now(), updated: updatedCount, total: items.length },
  })
}

// v2 一次性 migration：把老 status='used' 的 item 改成 status='kept' + migratedFromUsed=true
// 详见 packages/core/src/services/Migration.ts + Chord_二向决策_实施方案.md §1
// 通过 chord_status_migrated_v2 flag 防重跑
async function migrateUsedStatusToKept() {
  const flag = await chrome.storage.local.get('chord_status_migrated_v2')
  if (flag['chord_status_migrated_v2']) return

  const result = await Migration.migrateUsedToKept(adapter)
  console.log(`[Chord] status v2 migration done: ${result.migratedCount}/${result.totalItems} 条 used → kept (migratedFromUsed=true)`)
  await chrome.storage.local.set({
    chord_status_migrated_v2: { at: Date.now(), migrated: result.migratedCount, total: result.totalItems },
  })
}

// SaveIntent v2 Sprint B.1 migration：老单标签 saveIntent → 多标签 saveIntents
// 通过 chord_saveintents_migrated_v1 flag 防重跑
async function migrateSaveIntentsV2Wrapper() {
  const flag = await chrome.storage.local.get('chord_saveintents_migrated_v1')
  if (flag['chord_saveintents_migrated_v1']) return

  const result = await Migration.migrateSaveIntentsV2(adapter)
  console.log(`[Chord] saveIntents v2 migration done: ${result.migratedCount}/${result.totalItems} 条 saveIntent → saveIntents`)
  await chrome.storage.local.set({
    chord_saveintents_migrated_v1: { at: Date.now(), migrated: result.migratedCount, total: result.totalItems },
  })
}

// ─── 书签自动监听（Auto-capture）────────────────────────────

// 后台 recluster 触发器（item 增加时调用，debounce 1 分钟）
// 避免连续添加书签时频繁 recluster；保证用户停止添加 1 分钟后跑一次
const BACKGROUND_RECLUSTER_ALARM = 'chord_background_recluster'
async function scheduleBackgroundRecluster() {
  await chrome.alarms.create(BACKGROUND_RECLUSTER_ALARM, { delayInMinutes: 1 })
}

// 即时后台 recluster：用户高频触发的入口（Popup 打开、Options 打开）调用。
// 不等 alarm 的 30s 最小延迟，立刻 fire-and-forget。
// 内置防抖：5 分钟内只跑一次，避免用户连续点扩展图标时重复调 AI。
let lastImmediateReclusterAt = 0
const IMMEDIATE_RECLUSTER_DEBOUNCE_MS = 5 * 60 * 1000

// 估算 recluster 时间（秒）
// AI 模式（智谱 GLM-4-Flash）：基础 ~10s + 每 50 条 5s（一次性塞 prompt 还要看长度）
// 离线 TF-IDF：~0.02 * items.length（1000 条 20 秒；100 条 2 秒）
function estimateReclusterSeconds(itemCount: number, mode: 'ai' | 'offline'): number {
  if (mode === 'ai') return Math.max(10, Math.round(10 + (itemCount / 50) * 5))
  return Math.max(2, Math.round(itemCount * 0.02))
}

// 写状态到 storage——UI 订阅 chrome.storage.onChanged 显示进度
async function setReclusterStatus(status: {
  running: boolean
  startedAt?: number
  totalItems?: number
  estimatedSeconds?: number
  lastError?: string
  lastCompletedAt?: number
}) {
  await chrome.storage.local.set({ chord_recluster_status: status })
}

async function maybeRunBackgroundRecluster(opts: { force?: boolean } = {}) {
  // P0-6 · 双重防并发——lastImmediateReclusterAt 是 module-level，SW 重启会丢；
  //         chord_recluster_status.running 落 storage 不会丢，是 source of truth
  const currStatus = await chrome.storage.local.get('chord_recluster_status')
  const rs = currStatus['chord_recluster_status'] as { running?: boolean; startedAt?: number; estimatedSeconds?: number } | undefined
  if (rs?.running) {
    const elapsed = rs.startedAt ? Date.now() - rs.startedAt : 0
    const timeout = (rs.estimatedSeconds ?? 60) * 3 * 1000
    if (elapsed < timeout) {
      console.log('[Chord] recluster already running (storage flag), skip')
      return
    }
    // stale → 清掉，继续往下跑
    console.log('[Chord] detected stale recluster status, clearing')
    await chrome.storage.local.remove('chord_recluster_status')
  }

  const now = Date.now()
  if (!opts.force && now - lastImmediateReclusterAt < IMMEDIATE_RECLUSTER_DEBOUNCE_MS) return

  // 注意：防抖时间戳要在「确认要真跑 recluster」之后才更新，
  // 否则前面 items<15 / !needs 这些早退路径会把防抖锁住，导致后续真正需要重算时被跳过
  try {
    const items = await adapter.getItems({ type: ['content'] })
    if (items.length < 15) return
    if (!opts.force && !(await ClusterService.shouldRecluster(adapter))) return

    // 确认要跑了，才更新防抖时间戳
    lastImmediateReclusterAt = now

    const settings = await adapter.getSettings()
    const mode: 'ai' | 'offline' = settings.aiEngine.mode === 'ai' && settings.aiEngine.apiKey ? 'ai' : 'offline'
    const eta = estimateReclusterSeconds(items.length, mode)
    console.log(`[Chord] starting background recluster: ${items.length} items, mode=${mode}, eta≈${eta}s`)

    // v0.1.3 · 预先 build engine——MissingApiKeyError 在这里同步抛出
    //   背景: 用户选了 AI provider 但没填 key → buildEngine 之前静默 fallback tfidf, 写一堆怪 cluster
    //   现在: 抛错 → 写 lastError, 保留旧 cluster, banner 红色提示用户去填 key
    let engine
    try {
      engine = buildEngine(settings.aiEngine)
    } catch (e) {
      console.warn('[Chord] buildEngine failed, skip recluster:', e)
      await setReclusterStatus({
        running: false,
        lastError: (e as Error).message?.slice(0, 200),
        lastCompletedAt: Date.now(),
      })
      return
    }

    // 写状态：UI 可以订阅展示进度
    await setReclusterStatus({
      running: true,
      startedAt: now,
      totalItems: items.length,
      estimatedSeconds: eta,
    })

    // v0.1.2 · 起 keepalive · 防止 MV3 SW 30s 空闲被回收导致 recluster 半路死掉
    startReclusterKeepalive()
    // 真正的 fire-and-forget：不 await，不阻塞 message handler
    ClusterService.recluster(adapter, engine)
      .then(() => {
        console.log('[Chord] background recluster done')
        setReclusterStatus({ running: false, lastCompletedAt: Date.now() })
      })
      .catch((e) => {
        console.warn('[Chord] background recluster failed:', e)
        setReclusterStatus({ running: false, lastError: (e as Error).message?.slice(0, 200), lastCompletedAt: Date.now() })
      })
      .finally(() => {
        stopReclusterKeepalive()
      })
  } catch (e) {
    console.warn('[Chord] maybeRunBackgroundRecluster check failed:', e)
  }
}

chrome.bookmarks.onCreated.addListener(async (_id, bookmark) => {
  if (!bookmark.url) return

  const settings = await adapter.getSettings()
  const classification = classifyURL(bookmark.url, settings.domainPrefs)

  // 「原收藏时间」= min(bookmark.dateAdded, chrome.history 最早访问)
  // 用户可能很久前就访问过此页，今天才加书签——以更早的为准
  const earliest = await earliestSavedAt(bookmark.url, bookmark.dateAdded)

  // 永不询问的工具型（gmail 等）→ 静默归入快速入口
  if (classification.type === 'tool' && 'neverAsk' in classification && classification.neverAsk) {
    await ItemService.saveItem(
      adapter,
      { url: bookmark.url, title: bookmark.title ?? '', source: 'bookmark_auto', favicon: getFaviconUrl(bookmark.url), type: 'tool', savedAt: earliest },
      { userId: settings.userId, deviceId: settings.deviceId, engine: buildEngine(settings.aiEngine) },
    )
    return
  }

  // 高置信度内容型 → 静默归入书房
  if (classification.type === 'content' && classification.confidence === 'high') {
    const result = await ItemService.saveItem(
      adapter,
      { url: bookmark.url, title: bookmark.title ?? '', source: 'bookmark_auto', favicon: getFaviconUrl(bookmark.url), type: 'content', savedAt: earliest },
      { userId: settings.userId, deviceId: settings.deviceId, engine: buildEngine(settings.aiEngine) },
    )
    if (result.status === 'added') {
      // 通知 content script 显示 Toast
      notifyActiveTab({ type: 'SHOW_SAVE_TOAST', message: '已自动纳入书房' })
      // 加入新 content 后调度一次后台 recluster（debounced 1 分钟）
      scheduleBackgroundRecluster()
    }
    return
  }

  // 高置信度工具型 → 静默归入快速入口
  if (classification.type === 'tool') {
    await ItemService.saveItem(
      adapter,
      { url: bookmark.url, title: bookmark.title ?? '', source: 'bookmark_auto', favicon: getFaviconUrl(bookmark.url), type: 'tool', savedAt: earliest },
      { userId: settings.userId, deviceId: settings.deviceId, engine: buildEngine(settings.aiEngine) },
    )
    return
  }

  // 低置信度 → 先保守 saveItem（type='content' 让进书房不被埋没）+ 通知 content script 弹询问气泡
  //   P0-1 fix: 之前只发气泡不 save —— 用户即使点"放进书房"也只更新 domainPrefs，当前这条永远丢
  //   现在：先 save，气泡 USER_DOMAIN_PREF handler 收到选择后只修正 type（findItem by url + 改 type）
  const lowConfResult = await ItemService.saveItem(
    adapter,
    { url: bookmark.url, title: bookmark.title ?? '', source: 'bookmark_auto', favicon: getFaviconUrl(bookmark.url), type: 'content', savedAt: earliest },
    { userId: settings.userId, deviceId: settings.deviceId, engine: buildEngine(settings.aiEngine) },
  )
  notifyActiveTab({
    type: 'SHOW_CLASSIFICATION_BUBBLE',
    url: bookmark.url,
    title: bookmark.title ?? '',
    domain: classification.domain,
  })
  if (lowConfResult.status === 'added') scheduleBackgroundRecluster()
})

// ─── 唤醒定时器 ─────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // 后台 recluster：用户停止添加书签 1 分钟后触发；只在需要 recluster 时才跑
  // CR-027：alarm 路径也走 maybeRunBackgroundRecluster，复用 status 上报（之前 alarm 跑完 UI 看不到）
  // 不传 force——让 shouldRecluster() 决定是否真的需要跑。
  //   之前传 force: true 是 bug，每次 SW 重启（如手动 reload 扩展）都会 30 秒后无脑跑一次 recluster
  if (alarm.name === BACKGROUND_RECLUSTER_ALARM) {
    maybeRunBackgroundRecluster()
    return
  }

  // 主动出现 Phase 4：重新召回检查（每天一次）
  if (alarm.name === RECALL_ALARM) {
    checkRecallTriggers().catch((e) => console.warn('[Chord] recall check failed:', e))
    return
  }

  // SaveIntent v2 Sprint A.3：异步意图补判（每小时一次）
  // 保存时同步 AI 失败 / 超时的 item 在这里批量补救
  if (alarm.name === INTENT_BATCH_ALARM) {
    classifyUnknownIntentsAsync().catch((e) => console.warn('[Chord] intent batch failed:', e))
    return
  }

  // v1.1.4 · Experiment 每日检查到期（§5 "愿意试 7 天"）
  if (alarm.name === EXPERIMENT_ALARM) {
    checkDueExperiments().catch((e) => console.warn('[Chord] experiment check failed:', e))
    return
  }

  if (alarm.name !== 'chord_daily_resuface') return

  const settings = await adapter.getSettings()
  if (!ResurfaceService.isTimeToResuface(settings)) return

  // 主动出现 Phase 1：尊重通知设置
  const notif = settings.notifications ?? DEFAULT_NOTIFICATIONS
  if (notif.daily === false) {
    console.log('[Chord] daily notification skipped: user disabled')
    return
  }
  if (notif.muteUntil && notif.muteUntil > Date.now()) {
    console.log(`[Chord] daily notification skipped: muted until ${new Date(notif.muteUntil).toISOString()}`)
    return
  }
  // 安静时段
  const nowHour = new Date().getHours()
  const inQuiet = notif.quietStart <= notif.quietEnd
    ? (nowHour >= notif.quietStart && nowHour < notif.quietEnd)         // 同一天内（如 1-5）
    : (nowHour >= notif.quietStart || nowHour < notif.quietEnd)         // 跨夜（如 22-8）
  if (inQuiet) {
    console.log(`[Chord] daily notification skipped: quiet hours (${notif.quietStart}-${notif.quietEnd}, now ${nowHour})`)
    return
  }
  // 周末
  const day = new Date().getDay()
  if (notif.skipWeekend && (day === 0 || day === 6)) {
    console.log('[Chord] daily notification skipped: weekend')
    return
  }
  // 4 小时内已主动开过 popup/options → 用户已经在用，不推
  if (settings.lastOpenedAt && Date.now() - settings.lastOpenedAt < 4 * 3600_000) {
    console.log('[Chord] daily notification skipped: user opened Chord within 4h')
    return
  }
  // 通知预算
  const budget = await getBudget()
  if (!NotificationBudgetService.canSend(budget, 'daily')) {
    console.log('[Chord] daily notification skipped: budget exhausted')
    return
  }

  const items = await adapter.getItems({ status: ['pending', 'kept'], type: ['content'] })
  const visitCounts = await ChromeStorageAdapter.getVisitCounts(
    items.map((i) => ({ id: i.id, url: i.url })),
  )
  const item = ResurfaceService.selectItemToResuface(items, visitCounts)
  if (!item) return

  // 质量门槛：echoIndex < 40 不发（没什么值得说的）
  const itemEchoIndex = EchoIndexService.computeEchoIndex({
    item,
    visitCount: visitCounts.get(item.id) ?? 0,
  })
  if (itemEchoIndex < 40) {
    console.log(`[Chord] daily notification skipped: top item echoIndex ${itemEchoIndex} < 40 quality threshold`)
    return
  }

  // 标记已唤醒
  await ItemService.markWoken(adapter, item.id, {
    userId: settings.userId,
    deviceId: settings.deviceId,
  })

  // 生成问句（AI 离线）
  const question = await buildEngine(settings.aiEngine).generateQuestion({
    title: item.title,
    domain: item.sourceDomain,
    savedAt: item.savedAt,
    wakeCount: item.wakeCount,
    userNote: item.userNote,
    cluster: item.cluster,
  })

  // 更新 item 的 aiQuestion 字段
  await adapter.putItem({ ...item, aiQuestion: question, wakeCount: item.wakeCount + 1 })

  // 发推送通知
  await chrome.notifications.create(`resuface_${item.id}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
    title: '回响',
    message: question,
    contextMessage: `${item.title.slice(0, 50)}`,
  })

  // 记录通知预算
  await setBudget(NotificationBudgetService.recordSent(budget, 'daily'))

  // 更新 lastResurfacedAt
  await adapter.putSettings({ lastResurfacedAt: Date.now() })

  // 更新 streak
  await StreakService.checkAndUpdateStreak(adapter, settings)

  // 检查是否需要重新聚类（v0.1.2 · 走 maybeRunBackgroundRecluster 统一管 status + keepalive）
  maybeRunBackgroundRecluster()
})

// ─── 通知点击 ────────────────────────────────────────────────

chrome.notifications.onClicked.addListener((notifId) => {
  chrome.notifications.clear(notifId)
  // 主动出现：根据通知 id 前缀路由到不同 options 页
  let hash = '#process'  // 默认（resuface_ / echo_）
  if (notifId.startsWith('milestone_')) {
    // milestone 路由：id 形如 milestone_items_100 → 去 dashboard
    if (notifId.includes('items_')) hash = '#dashboard'
    else if (notifId.includes('streak_')) hash = '#profile'
    else if (notifId.includes('processed_')) hash = '#profile'
  } else if (notifId.startsWith('experiment_')) {
    // v1.1.4 · Experiment 通知点击 → 进 Profile 顶部 banner 补选 outcome
    hash = '#profile'
  } else if (notifId.startsWith('recall_')) {
    hash = '#dashboard'  // 重新召回 → 直接进候响室
  }
  chrome.tabs.create({ url: chrome.runtime.getURL(`src/options/index.html${hash}`) })
})

// ─── 消息桥接 ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const message = msg as Record<string, unknown>

  if (message['type'] === 'SAVE_CURRENT_PAGE') {
    handleSaveCurrentPage(message).then(sendResponse)
    return true // 异步响应
  }

  // v3.1.28-2 · 强制重跑 savedAt v2 修复（Settings 按钮触发）
  if (message['type'] === 'FORCE_SAVEDAT_FIX') {
    migrateSavedAtV2(true).then(sendResponse).catch((e) => {
      console.warn('[Chord] FORCE_SAVEDAT_FIX failed:', e)
      sendResponse({ error: String(e) })
    })
    return true
  }

  if (message['type'] === 'USER_DOMAIN_PREF') {
    const { domain, itemType, url } = message as { domain: string; itemType: 'content' | 'tool'; url?: string }
    ;(async () => {
      const s = await adapter.getSettings()
      await adapter.putSettings({
        domainPrefs: { ...s.domainPrefs, [domain]: itemType },
      })
      // P0-1 · 低置信度路径已经 save 了 type='content'；这里按 url 找回 item 修正 type
      //   只改最近 30s 内 save 的（避免误改老 item）
      if (url) {
        const items = await adapter.getItems()
        const recent = items
          .filter((i) => i.url === url && Date.now() - i.savedAt < 30_000)
          .sort((a, b) => b.savedAt - a.savedAt)[0]
        if (recent && recent.type !== itemType) {
          await adapter.putItem({ ...recent, type: itemType })
        }
      }
    })().catch((e) => console.warn('[Chord] USER_DOMAIN_PREF handler failed:', e))
  }

  if (message['type'] === 'GET_TODAY_ITEM') {
    getTodayItem().then(sendResponse)
    // 用户点扩展图标 → Popup 打开 → 调 GET_TODAY_ITEM。
    // 这是高频入口；趁机 fire-and-forget 检查 + 触发后台 recluster。
    // 用户在 Popup 处理 1-2 条 item 的时间足够 AI 跑完，等用户后面进 Terrain 已经有新结果。
    maybeRunBackgroundRecluster()
    return true
  }

  if (message['type'] === 'ENSURE_AI_QUESTION') {
    // 修法 A · popup 拿到 item 后异步拉问句填充
    const { itemId } = message as { itemId: string }
    ensureAIQuestion(itemId).then((question) => sendResponse({ question }))
    return true
  }

  if (message['type'] === 'PAGE_OPENED') {
    // Options / Popup 任何页面打开都触发——确保用户进任何页面都能看到最新分类
    maybeRunBackgroundRecluster()
    return false
  }

  // v1.1.1 · 已删 AI_PROVIDER_CHANGED 自动触发逻辑
  //   背景: v0.1.3 切 provider 就自动清+重跑, 用户只点选还没填 key 也会跑 → MissingApiKeyError
  //   现在: Settings.maybeOfferRecluster 弹 confirm 后用户确认 + 直接在 options page 跑 ClusterService.recluster
  //         不再走 sw 路径 (避免双跑 + 简化状态管理)
  //
  // v1.1.1 · 但 ReclusterStatusBar "重试" 按钮发的是 RECLUSTER_NOW (用户主动点)
  if (message['type'] === 'RECLUSTER_NOW') {
    console.log(`[Chord] 用户主动触发 recluster (重试按钮) · 清防抖 + force`)
    lastImmediateReclusterAt = 0
    maybeRunBackgroundRecluster({ force: true })
    return false
  }

  if (message['type'] === 'RECORD_CHIP') {
    const { itemId, chip } = message as { itemId: string; chip: string | null }
    if (chip) {
      adapter.getItem(itemId).then(async (it) => {
        if (it) await adapter.putItem({ ...it, usageChip: chip })
      })
    }
  }

  if (message['type'] === 'PROCESS_ITEM') {
    const { itemId, decision, chip, custom, reason, reasonCustom, deleteBookmark } = message as {
      itemId: string
      decision: 'keep' | 'release'  // P0-4 · v2 二向决策
      chip?: string
      custom?: string
      reason?: import('@chord/types').ReleaseReason
      reasonCustom?: string
      deleteBookmark?: boolean
    }
    handleProcessItem(itemId, decision, { chip, custom, reason, reasonCustom, deleteBookmark }).then(sendResponse)
    return true
  }

  // v1.1.4 · Experiment 闭环 · Profile.tsx CTA 点击 → 注册实验
  if (message['type'] === 'REGISTER_EXPERIMENT') {
    const { experimentText, identityCombo, comboName } = message as {
      experimentText: string
      identityCombo?: string
      comboName?: string
    }
    ;(async () => {
      const exp = ExperimentService.createExperiment({
        experimentText,
        identityCombo,
        comboName,
        startedAt: Date.now(),
      })
      await ExperimentService.addExperiment(experimentStorage, exp)
      await ensureExperimentAlarm()
      sendResponse({ ok: true, id: exp.id, expiresAt: exp.expiresAt })
    })().catch((e) => sendResponse({ ok: false, error: String(e) }))
    return true
  }

  // v1.1.4 · Experiment 反馈（Chord UI banner / 时间线内的按钮）
  if (message['type'] === 'RECORD_EXPERIMENT_OUTCOME') {
    const { id, outcome } = message as { id: string; outcome: ExperimentOutcome }
    recordExperimentOutcome(id, outcome).then(() => sendResponse({ ok: true }))
    return true
  }

  // v2 二向决策：单条删 Chrome 书签
  if (message['type'] === 'DELETE_BOOKMARK') {
    const { url } = message as { url: string }
    ChromeStorageAdapter.removeBookmarkByUrl(url).then((removed) => {
      console.log(`[Chord] removed ${removed} chrome bookmark(s) for ${url}`)
      sendResponse({ removed })
    })
    return true
  }

  // v2 二向决策：批量删 Chrome 书签
  if (message['type'] === 'DELETE_BOOKMARKS_BATCH') {
    const { urls } = message as { urls: string[] }
    ChromeStorageAdapter.removeBookmarksByUrls(urls).then((removed) => {
      console.log(`[Chord] batch removed ${removed} chrome bookmark(s) (${urls.length} urls)`)
      sendResponse({ removed })
    })
    return true
  }
})

// ─── Helpers ─────────────────────────────────────────────────

async function handleSaveCurrentPage(msg: Record<string, unknown>) {
  const { url, title, favicon, tabId } = msg as { url: string; title: string; favicon?: string; tabId?: number }
  const settings = await adapter.getSettings()

  // Try to get page text excerpt from content script for richer clustering
  let excerpt: string | undefined
  if (tabId != null) {
    try {
      const resp = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_TEXT' }) as { text?: string }
      if (resp?.text) excerpt = resp.text
    } catch {
      // Content script not ready or tab not accessible — proceed without excerpt
    }
  }

  // 主动保存：没有 Chrome bookmark.dateAdded，但 history 里可能有更早访问记录
  const earliest = await earliestSavedAt(url)

  const result = await ItemService.saveItem(
    adapter,
    { url, title, favicon, source: 'saved', excerpt, savedAt: earliest },
    { userId: settings.userId, deviceId: settings.deviceId, engine: buildEngine(settings.aiEngine) },
  )

  return { status: result.status, itemId: result.item.id }
}

async function getTodayItem() {
  const items = await adapter.getItems({ status: ['pending', 'kept'], type: ['content'] })

  // ★ 设计反转（之前 B-002 修了"卡死同一条"，但把契约改成"同一天同一条"也是错的——
  //   用户开 popup 期望的就是看不同思考点，不是被同一条堵着）
  // 现在每次开 popup 都走 fresh 选择；ResurfaceService 的 wakeCount × -10 衰减项
  // 自动避免短时间内反复推同一条。
  const visitCounts = await ChromeStorageAdapter.getVisitCounts(
    items.map((i) => ({ id: i.id, url: i.url })),
  )
  const item = ResurfaceService.selectItemToResuface(items, visitCounts)
  if (!item) return null

  // 修法 A · aiQuestion 拆懒加载：getTodayItem 不再阻塞等 AI
  //   - 有缓存 aiQuestion → 直接复用，不动
  //   - 无缓存 → 立刻返回（aiQuestion=undefined）+ wakeCount+1 落盘；
  //             popup 拿到 item 后再发 ENSURE_AI_QUESTION 异步生成填充
  // 这把 popup 首屏从 1-3s（含 AI 调用）压到 200-500ms（仅 storage + history）
  const updated = { ...item, wakeCount: item.wakeCount + 1 }
  await adapter.putItem(updated)
  return updated
}

/** 修法 A · 异步生成 aiQuestion 并落盘，给 popup lazy load 用 */
async function ensureAIQuestion(itemId: string): Promise<string | null> {
  const item = await adapter.getItem(itemId)
  if (!item) return null
  if (item.aiQuestion) return item.aiQuestion  // 已有缓存，直接返回

  const settings = await adapter.getSettings()
  const question = await buildEngine(settings.aiEngine).generateQuestion({
    title: item.title,
    domain: item.sourceDomain,
    savedAt: item.savedAt,
    wakeCount: item.wakeCount,
    userNote: item.userNote,
    cluster: item.cluster,
  })

  // 写回 storage 缓存（下次同 item 直接复用，不再调 AI）
  // 重新读 item 是为了避免 race condition（用户可能在 AI 跑的时候已 process 了这条）
  const fresh = await adapter.getItem(itemId)
  if (fresh) await adapter.putItem({ ...fresh, aiQuestion: question })
  return question
}

async function handleProcessItem(
  itemId: string,
  decision: 'keep' | 'release',  // P0-4 · v2 二向决策，'used' 已撤销
  opts: {
    chip?: string
    custom?: string
    reason?: import('@chord/types').ReleaseReason
    reasonCustom?: string
    deleteBookmark?: boolean
  } = {},
) {
  const settings = await adapter.getSettings()
  // 先抓 URL（用于可能的书签删除），processItem 之后 item 仍然存在（只改 status）
  const itemBefore = await adapter.getItem(itemId)
  const item = await ItemService.processItem(adapter, itemId, decision, {
    userId: settings.userId,
    deviceId: settings.deviceId,
    chip: opts.chip,
    custom: opts.custom,
    reason: opts.reason,
    reasonCustom: opts.reasonCustom,
  })
  await StreakService.checkAndUpdateStreak(adapter, settings)
  await bumpRhythmDay()

  // v2: 如果是放手 + 用户要删 Chrome 书签
  if (decision === 'release' && opts.deleteBookmark && itemBefore) {
    ChromeStorageAdapter.removeBookmarkByUrl(itemBefore.url).then((removed) => {
      console.log(`[Chord] removed ${removed} chrome bookmark(s) for released item`)
    })
  }

  return { status: 'ok', itemId: item.id }
}

// 写入「本日已处理」节奏数据，供 Dashboard.WeekRhythm 读取
async function bumpRhythmDay() {
  const today = isoDateLocal(new Date())  // 'YYYY-MM-DD'（本地时区）
  const { rhythm_days = {} } = await chrome.storage.local.get('rhythm_days') as { rhythm_days?: Record<string, number> }
  rhythm_days[today] = (rhythm_days[today] ?? 0) + 1
  await chrome.storage.local.set({ rhythm_days })
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function registerAlarmIfNeeded() {
  const existing = await chrome.alarms.get('chord_daily_resuface')
  if (existing) return

  const settings = await adapter.getSettings()
  if (settings.resurfaceFreq === 'off') return
  // P0-7 · 用 helper 防 NaN（"".split(':') → [""] → Number("") = NaN，?? 不防）
  const { h, m } = ResurfaceService.parseResurfaceTime(settings.resurfaceTime)
  const when = nextOccurrenceOf(h, m).getTime()

  await chrome.alarms.create('chord_daily_resuface', {
    when,
    periodInMinutes: 24 * 60,
  })
}

// P0-2 · 监听 chord_settings 里 resurfaceTime / resurfaceFreq 变化，重置 alarm
//   背景：registerAlarmIfNeeded 有 `if (existing) return` 首次注册保护，
//         但用户改 resurfaceTime 后没人 clear+重建 alarm，通知继续按原时间发
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return
  if (!changes['chord_settings']) return
  const prev = (changes['chord_settings'].oldValue ?? {}) as Partial<UserSettings>
  const curr = (changes['chord_settings'].newValue ?? {}) as Partial<UserSettings>
  if (prev.resurfaceTime !== curr.resurfaceTime || prev.resurfaceFreq !== curr.resurfaceFreq) {
    ;(async () => {
      await chrome.alarms.clear('chord_daily_resuface')
      await registerAlarmIfNeeded()
    })().catch((e) => console.warn('[Chord] re-register alarm failed:', e))
  }
})

function notifyActiveTab(msg: Record<string, unknown>) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id
    if (tabId != null) {
      chrome.tabs.sendMessage(tabId, msg).catch(() => {
        // content script 未注入（新标签页等），忽略
      })
    }
  })
}

// ═══════════════ 主动出现系统 · Phase 2-5 ═══════════════════════

// ─── Phase 2: 通知预算 storage helpers ──────────────────────────

async function getBudget(): Promise<BudgetLog> {
  const data = await chrome.storage.local.get('chord_notif_log')
  return (data['chord_notif_log'] as BudgetLog | undefined) ?? {}
}
async function setBudget(log: BudgetLog): Promise<void> {
  await chrome.storage.local.set({ chord_notif_log: log })
}

// ─── Phase 3: Echo Moment 触发式（chrome.history.onVisited）─────

chrome.history.onVisited.addListener(async (historyItem) => {
  try {
    if (!historyItem.url) return
    const items = await adapter.getItems({ type: ['content'] })
    const matched = items.find((i) => i.url === historyItem.url)
    if (!matched) return

    // 更新 lastVisitedAt
    await adapter.putItem({ ...matched, lastVisitedAt: Date.now() })

    // 检查通知设置
    const settings = await adapter.getSettings()
    const notif = settings.notifications ?? DEFAULT_NOTIFICATIONS
    if (!notif.echoMoment) return
    if (notif.muteUntil && notif.muteUntil > Date.now()) return

    // 安静时段
    const nowHour = new Date().getHours()
    const inQuiet = notif.quietStart <= notif.quietEnd
      ? (nowHour >= notif.quietStart && nowHour < notif.quietEnd)
      : (nowHour >= notif.quietStart || nowHour < notif.quietEnd)
    if (inQuiet) return

    // 查询最新 visitCount（chrome.history 自己已经累计了）
    const visitCount = await ChromeStorageAdapter.getVisitCount(matched.url)

    // 评估是否要 trigger
    const result = EchoMomentService.evaluate(matched, visitCount)
    if (!result.shouldTrigger) return

    // 通知预算
    const budget = await getBudget()
    if (!NotificationBudgetService.canSend(budget, 'echo_moment')) {
      console.log('[Chord] echo moment skipped: budget exhausted')
      return
    }

    // 发通知
    await chrome.notifications.create(`echo_${matched.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
      title: '念念之响',
      message: result.message!,
      contextMessage: `${matched.title.slice(0, 50)}`,
    })

    // 记录预算 + 更新 item 防重
    await setBudget(NotificationBudgetService.recordSent(budget, 'echo_moment'))
    await adapter.putItem({
      ...matched,
      lastVisitedAt: Date.now(),
      echoMomentTriggeredAt: Date.now(),
      echoMomentLastVisitCount: visitCount,
    })
    console.log(`[Chord] echo moment triggered for ${matched.title.slice(0, 40)} at visit ${visitCount} (threshold ${result.threshold})`)
  } catch (e) {
    console.warn('[Chord] history.onVisited handler failed:', e)
  }
})

// ─── Phase 4: 重新召回 daily alarm ──────────────────────────────

const RECALL_ALARM = 'chord_recall_check'

async function ensureRecallAlarm() {
  const existing = await chrome.alarms.get(RECALL_ALARM)
  if (existing) return
  // 每天检查一次，首次延迟 30 分钟（让安装/启动顺利完成）
  await chrome.alarms.create(RECALL_ALARM, {
    delayInMinutes: 30,
    periodInMinutes: 24 * 60,
  })
}

async function getRecallFired(): Promise<RecallFiredLog> {
  const data = await chrome.storage.local.get('chord_recall_fired')
  return (data['chord_recall_fired'] as RecallFiredLog | undefined) ?? {}
}
async function setRecallFired(log: RecallFiredLog): Promise<void> {
  await chrome.storage.local.set({ chord_recall_fired: log })
}

async function checkRecallTriggers() {
  const settings = await adapter.getSettings()
  const notif = settings.notifications ?? DEFAULT_NOTIFICATIONS
  if (!notif.recall) {
    console.log('[Chord] recall check skipped: user disabled')
    return
  }
  if (notif.muteUntil && notif.muteUntil > Date.now()) return

  const fired = await getRecallFired()
  const result = RecallService.evaluate(settings.lastOpenedAt, fired)

  // 3 天起 badge 加深（重置 lastBadgeCount 触发重算）
  if (result.shouldDimBadge) {
    lastBadgeCount = -1   // 强制下次 refreshBadge 改色
    chrome.action.setBadgeBackgroundColor({ color: '#A85048' })  // 加深的玫瑰
  }

  if (result.triggers.length === 0) return

  // 收集 14 天回响的摘要数据（可选，简化版：只统计总新增数）
  let summary: { topCluster?: string; delta?: number; totalAdded?: number } = {}
  if (result.triggers.includes('absent_14')) {
    const items = await adapter.getItems({ type: ['content'] })
    const cutoff = settings.lastOpenedAt ?? Date.now()
    const newItems = items.filter((i) => i.savedAt > cutoff)
    summary = { totalAdded: newItems.length }
    // 找增长最多的 cluster
    if (newItems.length > 0) {
      const counts: Record<string, number> = {}
      for (const i of newItems) {
        const c = i.cluster ?? '未分类'
        counts[c] = (counts[c] ?? 0) + 1
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
      if (top && top[1] >= 3) {
        summary.topCluster = top[0]
        summary.delta = top[1]
      }
    }
  }

  let updatedFired = fired
  for (const trigger of result.triggers) {
    const { title, message } =
      trigger === 'absent_14'
        ? RecallService.buildRecall14Message(summary)
        : RecallService.buildRecall30Message()
    await chrome.notifications.create(`recall_${trigger}_${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
      title,
      message,
    })
    updatedFired = RecallService.recordFired(updatedFired, trigger)
    console.log(`[Chord] recall fired: ${trigger} (${result.daysAbsent.toFixed(1)} days absent)`)
  }
  await setRecallFired(updatedFired)
}

// ─── Phase 5: Milestone 检测 ──────────────────────────────────

async function getMilestoneFired(): Promise<MilestoneFiredLog> {
  const data = await chrome.storage.local.get('chord_milestones_fired')
  return (data['chord_milestones_fired'] as MilestoneFiredLog | undefined) ?? {}
}
async function setMilestoneFired(log: MilestoneFiredLog): Promise<void> {
  await chrome.storage.local.set({ chord_milestones_fired: log })
}

/**
 * 在 item 数 / 处理数 / streak 任意变化后调用。
 * 自动检测是否跨越 milestone 阈值并发通知。
 */
async function checkMilestones(input: import('@chord/core').MilestoneInput) {
  try {
    const settings = await adapter.getSettings()
    const notif = settings.notifications ?? DEFAULT_NOTIFICATIONS
    if (!notif.milestone) return
    if (notif.muteUntil && notif.muteUntil > Date.now()) return

    const fired = await getMilestoneFired()
    const ms = MilestoneService.evaluate(input, fired)
    if (ms.length === 0) return

    let updatedFired = fired
    for (const m of ms) {
      await chrome.notifications.create(`milestone_${m.id}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
        title: m.title,
        message: m.message,
      })
      updatedFired = MilestoneService.recordFired(updatedFired, m.id)
      console.log(`[Chord] milestone fired: ${m.id}`)
    }
    await setMilestoneFired(updatedFired)
  } catch (e) {
    console.warn('[Chord] milestone check failed:', e)
  }
}

// 监听 storage 变化，检测 milestone（items_* 和 processed_*）
//
// P0-5 · SW 重启后第一次 onChanged 总吞 milestone 跨越
//   原 bug：MV3 SW 30s 空闲被回收 → lastMilestoneSnapshot=null 丢失。
//           复活后 onChange 触发 → seed snapshot=current 后 return，跨越被吞。
//   修法：从 chord_milestones_fired 反推 baseline = 已 fire 过的最大 milestone
//        99→100 期间 SW 死掉：hydrate 后 baseline=0（没 fire items_100），
//        下次 onChange prev=0 current=100 → checkMilestones 触发
let lastMilestoneSnapshot: { items: number; processed: number; streak: number } | null = null

async function hydrateMilestoneSnapshot() {
  if (lastMilestoneSnapshot) return
  try {
    const fired = await getMilestoneFired()
    const firedKeys = Object.keys(fired)
    const itemsMax = Math.max(0, ...firedKeys
      .filter((k) => k.startsWith('items_'))
      .map((k) => Number(k.slice(6)))
      .filter(Number.isFinite))
    const processedMax = fired['processed_100'] ? 100 : 0
    const streakMax = Math.max(0, ...firedKeys
      .filter((k) => k.startsWith('streak_'))
      .map((k) => Number(k.slice(7)))
      .filter(Number.isFinite))
    lastMilestoneSnapshot = { items: itemsMax, processed: processedMax, streak: streakMax }
  } catch (e) {
    console.warn('[Chord] hydrate milestone snapshot failed:', e)
    lastMilestoneSnapshot = { items: 0, processed: 0, streak: 0 }
  }
}

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== 'local') return
  if (!changes['chord_items'] && !changes['chord_settings']) return

  await hydrateMilestoneSnapshot()

  const items = await adapter.getItems({ type: ['content'] })
  const settings = await adapter.getSettings()
  const total = items.length
  const processed = items.filter((i) => i.status === 'kept' || i.status === 'released').length
  const streak = settings.streakCount ?? 0

  const prev = lastMilestoneSnapshot!
  lastMilestoneSnapshot = { items: total, processed, streak }

  if (prev.items !== total || prev.processed !== processed || prev.streak !== streak) {
    await checkMilestones({
      prevItemsTotal: prev.items,
      currentItemsTotal: total,
      prevProcessed: prev.processed,
      currentProcessed: processed,
      prevStreak: prev.streak,
      currentStreak: streak,
    })
  }
})

// ═══════════════ SaveIntent v2 · Sprint A.3 异步意图补救 ═══════════════

const INTENT_BATCH_ALARM = 'chord_classify_intents'

async function ensureIntentBatchAlarm() {
  const existing = await chrome.alarms.get(INTENT_BATCH_ALARM)
  if (existing) return
  // 每小时一次，首次延迟 15 分钟（让 install/startup 顺利完成）
  await chrome.alarms.create(INTENT_BATCH_ALARM, {
    delayInMinutes: 15,
    periodInMinutes: 60,
  })
}

/**
 * 异步批量补判 saveIntentSource='unknown' 的 item
 * 触发：每小时 alarm
 * 限制：每次最多 60 条（控制 AI 预算）
 *
 * 这是 Sprint A.3 "AI 同步调失败 fallback" 的兜底链路：
 * - saveItem 同步调超时（2s）→ status='unknown'
 * - 1 小时内 alarm 触发 → 批量调 AI 补判
 */
async function classifyUnknownIntentsAsync() {
  const settings = await adapter.getSettings()
  if (settings.aiEngine.mode !== 'ai') {
    // 用户没开 AI → 跳过（unknown 状态保留，下游降级处理）
    return
  }
  const engine = buildEngine(settings.aiEngine)
  if (!engine.classifyIntents) return

  const updated = await ItemService.classifyUnknownIntentsWithAI(adapter, engine, { limit: 60 })
  if (updated > 0) {
    console.log(`[Chord] intent batch补判: 更新 ${updated} 条 unknown item`)
  }
}

// ═══════════════ v1.1.4 · Experiment 闭环 (§5 "愿意试 7 天") ═══════════════

const EXPERIMENT_ALARM = 'chord_experiment_check'
const EXPERIMENT_STORAGE_KEY = 'chord_experiments'

/** chrome.storage adapter for ExperimentService */
const experimentStorage = {
  async get(key: string) {
    const data = await chrome.storage.local.get(key)
    return data[key] as Experiment[] | undefined
  },
  async set(key: string, value: Experiment[]) {
    await chrome.storage.local.set({ [key]: value })
  },
}

async function ensureExperimentAlarm() {
  const existing = await chrome.alarms.get(EXPERIMENT_ALARM)
  if (existing) return
  // 每天检查一次到期实验；首次延迟 1 分钟避免跟启动时其他 alarm 挤在一起
  await chrome.alarms.create(EXPERIMENT_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: 24 * 60,
  })
  console.log('[Chord] experiment alarm 已注册')
}

async function checkDueExperiments() {
  try {
    const now = Date.now()
    // 1. 长期未反馈自动 skip
    const raw = await ExperimentService.loadAll(experimentStorage)
    const skipped = ExperimentService.autoSkipStale(raw, now)
    if (skipped.some((e, i) => e.status !== raw[i]!.status)) {
      await ExperimentService.saveAll(experimentStorage, skipped)
    }

    // 2. 找到期未发通知的
    const due = ExperimentService.findDueExperiments(skipped, now)
    if (due.length === 0) return

    const settings = await adapter.getSettings()
    const notif = settings.notifications ?? DEFAULT_NOTIFICATIONS
    // 通知总开关关掉时不发（沿用 milestone/recall 语义）
    const notifEnabled = notif.milestone !== false && (!notif.muteUntil || notif.muteUntil <= now)

    let all = skipped
    for (const exp of due) {
      if (notifEnabled) {
        await chrome.notifications.create(`experiment_${exp.id}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
          title: '一周前你说想试试',
          message: `「${exp.experimentText.replace(/<[^>]+>/g, '').slice(0, 80)}」\n\n现在感觉怎么样？`,
          contextMessage: '点通知打开 Chord 也能补选',
          buttons: [
            { title: '✓ 有改变了' },
            { title: '× 没真做到' },
          ],
          requireInteraction: true,
          priority: 1,
        })
      }
      // 无论通知是否真发出，都标 due — 让打开 Chord 也能看到 banner
      all = all.map((e) => (e.id === exp.id ? ExperimentService.markNotified(e, now) : e))
      console.log(`[Chord] experiment due: ${exp.id}`)
    }
    await ExperimentService.saveAll(experimentStorage, all)
  } catch (e) {
    console.warn('[Chord] checkDueExperiments failed:', e)
  }
}

/** 从 notification button / Chord UI 内反馈 outcome, 共享一处逻辑 */
async function recordExperimentOutcome(id: string, outcome: ExperimentOutcome) {
  try {
    await ExperimentService.updateExperiment(experimentStorage, id, (e) =>
      ExperimentService.recordOutcome(e, outcome, Date.now()),
    )
    console.log(`[Chord] experiment ${id} outcome=${outcome}`)
  } catch (e) {
    console.warn('[Chord] recordExperimentOutcome failed:', e)
  }
}

// notification button click handler
chrome.notifications.onButtonClicked.addListener(async (notifId, buttonIdx) => {
  if (!notifId.startsWith('experiment_')) return
  const expId = notifId.slice('experiment_'.length)
  const outcome: ExperimentOutcome = buttonIdx === 0 ? 'changed' : 'not_done'
  await recordExperimentOutcome(expId, outcome)
  await chrome.notifications.clear(notifId)
})

// SW 启动时注册 alarm（onInstalled / onStartup 已有 hook, 这里挂到 alarm listener 边上）
chrome.runtime.onInstalled.addListener(() => { ensureExperimentAlarm() })
chrome.runtime.onStartup.addListener(() => { ensureExperimentAlarm() })
