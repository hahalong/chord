import type {
  StorageAdapter, Item, ItemFilter, ChordEvent,
  Cluster, ClusterUserIntent, UserSettings, BatchOperation,
} from '@chord/types'
import { DEFAULT_SETTINGS } from '@chord/types'
import { generateUserId, generateDeviceId } from '@chord/core'
import { openDB, type IDBPDatabase } from 'idb'

const STORAGE_KEY_ITEMS = 'chord_items'
const STORAGE_KEY_SETTINGS = 'chord_settings'
const STORAGE_KEY_CLUSTERS = 'chord_clusters'
const STORAGE_KEY_CLUSTER_USER_INTENTS = 'chord_cluster_user_intents'
const STORAGE_KEY_BUNDLED_MIGRATED = 'chord_bundled_migrated'
const DB_NAME = 'chord_events'
const DB_VERSION = 1
const STORE_EVENTS = 'events'

// 编译时注入的 Chord 内置 AI token（开发者在 .env.local 配 VITE_CHORD_BUNDLED_AI_KEY）
// 没配 = 空字符串 → chord_bundled provider 失效，扩展退回到现有行为（用户自配 Key 或离线 TF-IDF）
const BUNDLED_AI_KEY = (import.meta.env['VITE_CHORD_BUNDLED_AI_KEY'] as string | undefined ?? '').trim()
const BUNDLED_AI_AVAILABLE = BUNDLED_AI_KEY.length > 0

// ─── apiKey 解析与持久化策略 ────────────────────────────────────
// providerKeys 是真理源：每个 provider 各存一份 Key，互不串号。
// apiKey 是「当前 provider 的有效 Key」的运行时计算结果：
//   - chord_bundled → BUNDLED_AI_KEY（build-time 注入，永不入 storage）
//   - 其他 provider → providerKeys[provider]
// putSettings 会主动剥掉 aiEngine.apiKey，确保 storage 里永远没有 dev token。

function resolveApiKey(ai: UserSettings['aiEngine']): string | undefined {
  if (ai.provider === 'chord_bundled') return BUNDLED_AI_KEY || undefined
  const provider = ai.provider
  if (!provider) return undefined
  return ai.providerKeys?.[provider]
}

function stripComputedApiKey(ai: UserSettings['aiEngine']): UserSettings['aiEngine'] {
  // 移除 apiKey 字段；providerKeys 保留
  const { apiKey: _drop, ...rest } = ai
  return rest as UserSettings['aiEngine']
}

export class ChromeStorageAdapter implements StorageAdapter {
  private db: IDBPDatabase | null = null

  // ─── Items ───────────────────────────────────────────────

  async getItems(filter?: ItemFilter): Promise<Item[]> {
    const { [STORAGE_KEY_ITEMS]: items = [] } =
      await chrome.storage.local.get(STORAGE_KEY_ITEMS) as { chord_items?: Item[] }
    return applyFilter(items, filter)
  }

  async getItem(id: string): Promise<Item | null> {
    const items = await this.getItems()
    return items.find((i) => i.id === id) ?? null
  }

  async putItem(item: Item): Promise<void> {
    const { [STORAGE_KEY_ITEMS]: items = [] } =
      await chrome.storage.local.get(STORAGE_KEY_ITEMS) as { chord_items?: Item[] }
    const idx = items.findIndex((i) => i.id === item.id)
    if (idx >= 0) items[idx] = item
    else items.push(item)
    await chrome.storage.local.set({ [STORAGE_KEY_ITEMS]: items })
  }

  async deleteItem(id: string): Promise<void> {
    const { [STORAGE_KEY_ITEMS]: items = [] } =
      await chrome.storage.local.get(STORAGE_KEY_ITEMS) as { chord_items?: Item[] }
    const filtered = items.filter((i) => i.id !== id)
    await chrome.storage.local.set({ [STORAGE_KEY_ITEMS]: filtered })
  }

  // ─── Events（存 IndexedDB，无上限）──────────────────────

  private async openDB(): Promise<IDBPDatabase> {
    if (this.db) return this.db
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_EVENTS, { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp')
      },
    })
    return this.db
  }

  async appendEvent(event: ChordEvent): Promise<void> {
    const db = await this.openDB()
    await db.put(STORE_EVENTS, event)
  }

  async getEvents(since?: number): Promise<ChordEvent[]> {
    const db = await this.openDB()
    if (since == null) {
      return db.getAll(STORE_EVENTS)
    }
    const range = IDBKeyRange.lowerBound(since, true)
    return db.getAllFromIndex(STORE_EVENTS, 'timestamp', range)
  }

  // ─── Settings ─────────────────────────────────────────────

  async getSettings(): Promise<UserSettings> {
    const data = await chrome.storage.local.get([STORAGE_KEY_SETTINGS, STORAGE_KEY_BUNDLED_MIGRATED]) as {
      chord_settings?: Partial<UserSettings>
      chord_bundled_migrated?: boolean
    }
    const stored = data[STORAGE_KEY_SETTINGS]
    const alreadyMigrated = data[STORAGE_KEY_BUNDLED_MIGRATED] === true

    if (stored?.userId) {
      let merged = { ...DEFAULT_SETTINGS, ...stored } as UserSettings
      const ai = merged.aiEngine

      // ─── 迁移 A: 老的单字段 apiKey → providerKeys 字典 ───────────────
      // 关键：apiKey 等于 BUNDLED_AI_KEY 时跳过迁移——
      // 那不是用户的 Key，是 CR-015 时代误持久化的 dev token，应该被清掉
      if (
        ai.apiKey &&
        ai.apiKey !== BUNDLED_AI_KEY &&
        !ai.providerKeys &&
        ai.provider &&
        ai.provider !== 'chord_bundled'
      ) {
        merged.aiEngine = {
          ...ai,
          providerKeys: { [ai.provider]: ai.apiKey },
        }
        await chrome.storage.local.set({
          [STORAGE_KEY_SETTINGS]: { ...stored, aiEngine: stripComputedApiKey(merged.aiEngine) },
        })
      }

      // ─── 清理 cleanup: 把误存到 providerKeys 里的 dev token 全部抹掉 ─────
      // 修复历史 bug：CR-015 把 BUNDLED token 当成 user apiKey 持久化，CR-016 又把它迁移成 providerKeys[provider]
      // 任何 provider 的 Key 如果碰巧等于 BUNDLED_AI_KEY，那一定是 dev token 串进去的，必须清掉
      // 同时：如果当前选中的 provider 就是被清空 Key 的那个，把它切回 chord_bundled——
      // 否则用户会 stuck 在「X provider + 无 Key」状态，AI 不工作
      if (BUNDLED_AI_KEY && merged.aiEngine.providerKeys) {
        let cleaned = false
        let currentProviderWasCleaned = false
        const currentProvider = merged.aiEngine.provider
        const newKeys: NonNullable<typeof merged.aiEngine.providerKeys> = { ...merged.aiEngine.providerKeys }
        for (const k of Object.keys(newKeys) as Array<keyof typeof newKeys>) {
          if (newKeys[k] === BUNDLED_AI_KEY) {
            delete newKeys[k]
            cleaned = true
            if (k === currentProvider) currentProviderWasCleaned = true
          }
        }
        if (cleaned) {
          merged.aiEngine = { ...merged.aiEngine, providerKeys: newKeys }
          // 当前 provider 的 Key 被清了 → 切回 chord_bundled，否则用户没法用 AI
          if (currentProviderWasCleaned && BUNDLED_AI_AVAILABLE) {
            merged.aiEngine = { ...merged.aiEngine, mode: 'ai', provider: 'chord_bundled' }
          }
          await chrome.storage.local.set({
            [STORAGE_KEY_SETTINGS]: { ...stored, aiEngine: stripComputedApiKey(merged.aiEngine) },
          })
        }
      }

      // ─── 迁移 B: BUNDLED 可用且当前 offline 且没配过任何 Key → 升级到 chord_bundled ──
      // 仅迁一次：用户后续手动切回 offline 也尊重
      const hasAnyUserKey = merged.aiEngine.providerKeys && Object.values(merged.aiEngine.providerKeys).some((k) => k && k.length > 0)
      if (
        BUNDLED_AI_AVAILABLE &&
        merged.aiEngine.mode === 'offline' &&
        !hasAnyUserKey &&
        !alreadyMigrated
      ) {
        merged.aiEngine = { ...merged.aiEngine, mode: 'ai', provider: 'chord_bundled' }
        await chrome.storage.local.set({
          [STORAGE_KEY_SETTINGS]: { ...stored, aiEngine: stripComputedApiKey(merged.aiEngine) },
          [STORAGE_KEY_BUNDLED_MIGRATED]: true,
        })
      }

      // ─── 不变式：返回时 apiKey 永远 = 当前 provider 的有效 Key ───
      merged.aiEngine = { ...merged.aiEngine, apiKey: resolveApiKey(merged.aiEngine) }
      return merged
    }

    // ─── 首次启动 ───────────────────────────────────────
    const baseAiEngine = BUNDLED_AI_AVAILABLE
      ? { mode: 'ai' as const, provider: 'chord_bundled' as const }
      : DEFAULT_SETTINGS.aiEngine
    const fresh: UserSettings = {
      ...DEFAULT_SETTINGS,
      userId: generateUserId(),
      deviceId: generateDeviceId(),
      aiEngine: baseAiEngine,
    }
    await chrome.storage.local.set({
      [STORAGE_KEY_SETTINGS]: fresh,
      [STORAGE_KEY_BUNDLED_MIGRATED]: BUNDLED_AI_AVAILABLE,
    })
    return { ...fresh, aiEngine: { ...fresh.aiEngine, apiKey: resolveApiKey(fresh.aiEngine) } }
  }

  async putSettings(settings: Partial<UserSettings>): Promise<void> {
    const current = await this.getSettings()
    const merged = { ...current, ...settings }
    // 持久化时剥掉运行时计算的 apiKey 字段——providerKeys 才是真理源，chord_bundled 永不入 storage
    if (merged.aiEngine) {
      merged.aiEngine = stripComputedApiKey(merged.aiEngine)
    }
    await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: merged })
  }


  // ─── Clusters ─────────────────────────────────────────────

  async getClusters(): Promise<Cluster[]> {
    const { [STORAGE_KEY_CLUSTERS]: clusters = [] } =
      await chrome.storage.local.get(STORAGE_KEY_CLUSTERS) as { chord_clusters?: Cluster[] }
    return clusters
  }

  async putClusters(clusters: Cluster[]): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY_CLUSTERS]: clusters })
  }

  // ─── Cluster User Intents（用户主动声明的行动方向）─────────

  async getClusterUserIntents(): Promise<ClusterUserIntent[]> {
    const { [STORAGE_KEY_CLUSTER_USER_INTENTS]: intents = [] } =
      await chrome.storage.local.get(STORAGE_KEY_CLUSTER_USER_INTENTS) as { chord_cluster_user_intents?: ClusterUserIntent[] }
    return intents
  }

  async putClusterUserIntents(intents: ClusterUserIntent[]): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY_CLUSTER_USER_INTENTS]: intents })
  }

  // ─── Batch ────────────────────────────────────────────────

  async batch(operations: BatchOperation[]): Promise<void> {
    for (const op of operations) {
      if (op.op === 'put_item') await this.putItem(op.item)
      else if (op.op === 'delete_item') await this.deleteItem(op.id)
      else if (op.op === 'put_settings') await this.putSettings(op.settings)
      else if (op.op === 'put_clusters') await this.putClusters(op.clusters)
    }
  }

  // ─── onChange（响应式 UI）──────────────────────────────────

  onChange(callback: (key: string) => void): () => void {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      Object.keys(changes).forEach(callback)
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }

  // ─── 历史访问频次（需要 history 权限）───────────────────────

  // 返回某 URL 最近 90 天的访问次数（0 表示未访问或权限不足）
  static async getVisitCount(url: string, dayRange = 90): Promise<number> {
    try {
      const startTime = Date.now() - dayRange * 86_400_000
      const visits = await chrome.history.getVisits({ url })
      return visits.filter((v) => v.visitTime != null && v.visitTime >= startTime).length
    } catch {
      return 0
    }
  }

  // 批量获取一批 items 的访问次数，返回 id → count 映射
  static async getVisitCounts(items: { id: string; url: string }[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>()
    await Promise.all(
      items.map(async (item) => {
        counts.set(item.id, await ChromeStorageAdapter.getVisitCount(item.url))
      }),
    )
    return counts
  }

  // 返回某 URL 在 Chrome 历史里**最早一次访问**的 timestamp（毫秒）
  // 用途：saveItem 时取 min(bookmark.dateAdded, earliestVisit) 作为「原收藏时间」
  //   —— 比单看 dateAdded 更准（书签可能是新加的但用户其实多年前就看过这页）
  // 拿不到（权限不足 / 该 URL 从未访问 / 历史被清）时返回 null
  static async getEarliestVisit(url: string): Promise<number | null> {
    try {
      const visits = await chrome.history.getVisits({ url })
      if (!visits.length) return null
      let earliest = Infinity
      for (const v of visits) {
        if (typeof v.visitTime === 'number' && v.visitTime > 0 && v.visitTime < earliest) {
          earliest = v.visitTime
        }
      }
      return earliest === Infinity ? null : earliest
    } catch {
      return null
    }
  }

  // 批量版：返回 url → earliest visit 映射
  static async getEarliestVisits(urls: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    await Promise.all(
      urls.map(async (url) => {
        const t = await ChromeStorageAdapter.getEarliestVisit(url)
        if (t !== null) map.set(url, t)
      }),
    )
    return map
  }

  /**
   * v2 二向决策：根据 URL 在 Chrome 书签中删除对应条目（如果存在）。
   * 用户在「放手」时如果选择"也删 Chrome 书签"，sw 会调这个。
   *
   * 实现：先 chrome.bookmarks.search 找匹配 URL 的 nodes，然后逐个 remove。
   * 一个 URL 可能对应多个 bookmark（用户在不同文件夹里收藏过），全删。
   *
   * 返回删除的数量。失败时返回 0，不抛错（避免阻塞放手流程）。
   */
  static async removeBookmarkByUrl(url: string): Promise<number> {
    try {
      const matched = await chrome.bookmarks.search({ url })
      let removed = 0
      for (const node of matched) {
        try {
          await chrome.bookmarks.remove(node.id)
          removed++
        } catch (e) {
          console.warn(`[Chord] failed to remove bookmark ${node.id}:`, e)
        }
      }
      return removed
    } catch (e) {
      console.warn(`[Chord] bookmark search failed for ${url}:`, e)
      return 0
    }
  }

  /** 批量删除多个 URL 的 Chrome 书签 */
  static async removeBookmarksByUrls(urls: string[]): Promise<number> {
    let total = 0
    for (const url of urls) {
      total += await ChromeStorageAdapter.removeBookmarkByUrl(url)
    }
    return total
  }
}

// ─── Filter helper ────────────────────────────────────────

function applyFilter(items: Item[], filter?: ItemFilter): Item[] {
  if (!filter) return items
  let result = items

  if (filter.status?.length) {
    result = result.filter((i) => filter.status!.includes(i.status))
  }
  if (filter.type?.length) {
    result = result.filter((i) => filter.type!.includes(i.type))
  }
  if (filter.cluster) {
    result = result.filter((i) => i.cluster === filter.cluster)
  }
  if (filter.since != null) {
    result = result.filter((i) => i.savedAt >= filter.since!)
  }

  // 排序
  const by = filter.orderBy ?? 'savedAt'
  const dir = filter.orderDir ?? 'desc'
  result = [...result].sort((a, b) => {
    const va = (a[by] ?? 0) as number
    const vb = (b[by] ?? 0) as number
    return dir === 'desc' ? vb - va : va - vb
  })

  if (filter.limit != null) {
    result = result.slice(0, filter.limit)
  }

  return result
}
