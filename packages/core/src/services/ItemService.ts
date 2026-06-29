import type { StorageAdapter, Item, SaveItemInput, Decision, ItemFilter, ReleaseReason } from '@chord/types'
import { nanoid } from '../utils/id.js'
import { extractDomain, getFaviconUrl } from '../utils/favicon.js'
import { emitEvent } from '../events/EventService.js'
import { detectIntentByRules, scoreIntents } from '../ai/SaveIntentClassifier.js'
import { scoreItem } from './EngagementService.js'
import { extractKeywords } from '../utils/keywords.js'
import type { AIEngine } from '../ai/AIEngine.js'

interface ProcessOptions {
  userId: string
  deviceId: string
  /**
   * v1 chip：「派上用场了？」选项。v2 已废弃（不再有 chip 流程），保留参数仅向后兼容。
   * 新代码不应该传 chip。
   * @deprecated
   */
  chip?: string
  /** v1 chip 自定义文本，同 chip 一起废弃 @deprecated */
  custom?: string
  decisionMs?: number
  /**
   * v2 放手原因（仅当 decision === 'release' 时有效）。
   * 由 ReleaseReasonDialog 用户选择 / ReleaseReasonPredictor 智能预填。
   * 详见 Chord_二向决策_实施方案.md §2
   */
  reason?: ReleaseReason
  /** 放手时的自由文本（reason === 'custom' 时有效）*/
  reasonCustom?: string
}

/** 批量放手单条输入 */
export interface BatchReleaseInput {
  itemId: string
  reason?: ReleaseReason
  reasonCustom?: string
}

export interface SaveItemOptions {
  userId: string
  deviceId: string
  /**
   * v2 Sprint A.3：AI 兜底引擎（可选）
   * SaveIntent 规则没命中时立即调 AI 补判，2s 超时 fallback 到 'unknown' 状态
   * 不传 engine = 跳过 AI 兜底（保留 v1 行为，等异步 alarm 补救）
   *
   * 注意：L1 cluster 分类不在这里做——批量更划算，统一走 ClusterService.recluster
   * （由 shouldRecluster 在「有 unclustered item」时触发，一次 AI 调用处理整批）
   */
  engine?: AIEngine
  /**
   * AI 兜底超时（毫秒），默认 2000
   */
  aiTimeoutMs?: number
}

export async function saveItem(
  adapter: StorageAdapter,
  input: SaveItemInput,
  opts: SaveItemOptions,
): Promise<{ status: 'added' | 'duplicate'; item: Item }> {
  const items = await adapter.getItems()
  const existing = items.find((i) => i.url === input.url)

  if (existing) {
    return { status: 'duplicate', item: existing }
  }

  const domain = extractDomain(input.url)
  const now = Date.now()

  // Sprint B.1：多标签打分（同时保留 v1 detectIntentByRules 兼容）
  const intentSignals = scoreIntents({ url: input.url, title: input.title, domain })
  let intent: ReturnType<typeof detectIntentByRules> = intentSignals[0]?.intent ?? null
  let source: 'rule' | 'ai' | 'unknown' = intent ? 'rule' : 'unknown'

  // Sprint A.3：规则没命中时立即 AI 兜底（2s 超时硬上限）
  if (!intent && opts.engine?.classifyIntents) {
    try {
      const timeout = opts.aiTimeoutMs ?? 2000
      const aiResult = await Promise.race([
        opts.engine.classifyIntents([{
          id: 'saveTime',
          title: input.title,
          domain,
          excerpt: input.excerpt,
        }]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI intent timeout')), timeout)),
      ])
      if (aiResult[0]?.intent) {
        intent = aiResult[0].intent
        source = 'ai'
      }
    } catch {
      // 超时或失败 → 保持 unknown，等异步 alarm 兜底补救
      // 不阻塞保存路径
    }
  }

  // savedAt 优先用调用方传入的「原收藏时间」（Chrome 书签 dateAdded）；
  // 当 dateAdded 是 0 / null / undefined / 负数 / 未来时间（Chrome 同步异常等）时 fallback 到 now
  const isValidSavedAt = typeof input.savedAt === 'number' && input.savedAt > 0 && input.savedAt <= now + 86400000
  const savedAt = isValidSavedAt ? input.savedAt! : now

  const item: Item = {
    id: nanoid(),
    url: input.url,
    title: input.title || domain,
    favicon: input.favicon ?? getFaviconUrl(input.url),
    savedAt,                                  // 用户原始收藏时间（sanitized）
    firstSeenAt: input.firstSeenAt ?? now,   // Chord 看到时间（用于 scoreItem 速度分）
    sourceDomain: domain,
    type: input.type ?? 'content',
    status: 'pending',
    wakeCount: 0,
    source: input.source,
    userNote: input.userNote,
    excerpt: input.excerpt,
    saveIntent: intent ?? undefined,
    saveIntentSource: source,
    // Sprint B.1：写入多标签 saveIntents
    saveIntents: intentSignals.length > 0
      ? intentSignals
      : intent
        ? [{ intent, confidence: source === 'ai' ? 0.7 : 1.0, source }]
        : undefined,
    // cluster 字段在这里不设——交给 ClusterService.recluster 批处理（详见 shouldRecluster
    // 中的「unclustered 兜底」触发条件）
  }

  await adapter.putItem(item)
  await emitEvent(adapter, opts.userId, opts.deviceId, 'item_saved', {
    itemId: item.id,
  })

  return { status: 'added', item }
}

export async function processItem(
  adapter: StorageAdapter,
  id: string,
  decision: Decision,
  opts: ProcessOptions,
): Promise<Item> {
  const item = await adapter.getItem(id)
  if (!item) throw new Error(`Item not found: ${id}`)

  // P0-4 · v2 二向决策 · 'used' Decision 已撤销
  const statusMap: Record<Decision, Item['status']> = {
    keep: 'kept',
    release: 'released',
  }

  const withDecision: Item = {
    ...item,
    status: statusMap[decision],
    processedAt: Date.now(),
    usageChip: opts.chip,
    usageCustom: opts.custom,
    // v2 放手原因（仅 release 时）
    ...(decision === 'release'
      ? {
          releaseReason: opts.reason,
          releaseReasonCustom: opts.reason === 'custom' ? opts.reasonCustom : undefined,
          releaseReasonKeywords:
            opts.reason === 'custom' && opts.reasonCustom
              ? extractKeywords(opts.reasonCustom)
              : undefined,
        }
      : {}),
  }
  // 实时更新参与度
  const updated: Item = { ...withDecision, engagementScore: scoreItem(withDecision).score }

  await adapter.putItem(updated)
  await emitEvent(adapter, opts.userId, opts.deviceId, 'item_processed', {
    itemId: id,
    decision,
    decisionMs: opts.decisionMs,
    wakeCount: item.wakeCount,
    ...(decision === 'release' && opts.reason ? { reason: opts.reason } : {}),
  })

  if (opts.chip) {
    await emitEvent(adapter, opts.userId, opts.deviceId, 'chip_selected', {
      itemId: id,
      chipValue: opts.chip,
    })
  }

  return updated
}

/**
 * 批量放手（v2 新增）。
 * 输入是 [{ itemId, reason?, reasonCustom? }]，每条可以有独立 reason。
 * 单条 reason 不传时留空（用户跳过原因）。
 *
 * 返回成功放手的 item 数。失败的 item（如不存在）被跳过，不抛错。
 *
 * 注意：本函数不处理 chrome.bookmarks.remove——那是 sw 层的职责。
 * 本函数只负责 Chord storage 层面的状态变更。
 */
export async function batchRelease(
  adapter: StorageAdapter,
  inputs: BatchReleaseInput[],
  opts: { userId: string; deviceId: string },
): Promise<{ releasedCount: number; itemIds: string[] }> {
  const releasedIds: string[] = []
  for (const input of inputs) {
    try {
      await processItem(adapter, input.itemId, 'release', {
        ...opts,
        reason: input.reason,
        reasonCustom: input.reasonCustom,
      })
      releasedIds.push(input.itemId)
    } catch {
      // 跳过不存在的 item，不阻塞整批
    }
  }
  return { releasedCount: releasedIds.length, itemIds: releasedIds }
}

export async function markWoken(
  adapter: StorageAdapter,
  id: string,
  opts: { userId: string; deviceId: string },
): Promise<Item> {
  const item = await adapter.getItem(id)
  if (!item) throw new Error(`Item not found: ${id}`)

  const updated: Item = { ...item, wakeCount: item.wakeCount + 1 }
  await adapter.putItem(updated)
  await emitEvent(adapter, opts.userId, opts.deviceId, 'item_woken', {
    itemId: id,
    wakeCount: updated.wakeCount,
  })
  return updated
}

export async function addPrivateNote(
  adapter: StorageAdapter,
  id: string,
  note: string,
  opts: { userId: string; deviceId: string },
): Promise<Item> {
  const item = await adapter.getItem(id)
  if (!item) throw new Error(`Item not found: ${id}`)

  const withNote: Item = { ...item, privateNote: note || undefined }
  // 加笔记会影响参与度（按字数加分），同步更新
  const updated: Item = { ...withNote, engagementScore: scoreItem(withNote).score }
  await adapter.putItem(updated)
  await emitEvent(adapter, opts.userId, opts.deviceId, 'note_added', {
    itemId: id,
    noteLength: note.length, // 只记字数，不记内容
  })
  return updated
}

// 批量导入书签（chrome.bookmarks 导出的树结构）
export interface BookmarkNode {
  id: string
  title: string
  url?: string
  dateAdded?: number   // Chrome 书签首次创建时间（毫秒）
  children?: BookmarkNode[]
}

export async function importBookmarks(
  adapter: StorageAdapter,
  nodes: BookmarkNode[],
  opts: { userId: string; deviceId: string },
): Promise<{ added: number; duplicate: number }> {
  const flat = flattenBookmarks(nodes)
  let added = 0
  let duplicate = 0

  for (const bm of flat) {
    if (!bm.url) continue
    try {
      const result = await saveItem(
        adapter,
        {
          url: bm.url,
          title: bm.title,
          source: 'bookmark',
          // 默认以用户原始收藏时间为准，拿不到再 fallback Date.now()（在 saveItem 里）
          savedAt: bm.dateAdded,
        },
        opts,
      )
      if (result.status === 'added') added++
      else duplicate++
    } catch {
      // 跳过无效 URL
    }
  }

  return { added, duplicate }
}

function flattenBookmarks(nodes: BookmarkNode[]): BookmarkNode[] {
  const result: BookmarkNode[] = []
  for (const node of nodes) {
    if (node.url) result.push(node)
    if (node.children) result.push(...flattenBookmarks(node.children))
  }
  return result
}

export async function getItems(
  adapter: StorageAdapter,
  filter?: ItemFilter,
): Promise<Item[]> {
  return adapter.getItems(filter)
}

/**
 * AI 兜底意图分类：给 saveIntentSource='unknown' 的 item 用 AI 批量补判。
 * 调用方：每次 recluster 后顺手调用一次；返回更新条数。
 * 安全：engine 没实现 classifyIntents 时直接返回 0，不报错。
 */
export async function classifyUnknownIntentsWithAI(
  adapter: StorageAdapter,
  engine: AIEngine,
  opts?: { limit?: number },
): Promise<number> {
  if (!engine.classifyIntents) return 0
  const limit = opts?.limit ?? 60   // 每次最多处理 60 条，控制 AI 调用预算

  const all = await adapter.getItems({ type: ['content'] })
  const candidates = all
    .filter((i) => i.saveIntentSource === 'unknown' || !i.saveIntent)
    .slice(0, limit)
  if (candidates.length === 0) return 0

  const inputs = candidates.map((i) => ({
    id: i.id,
    title: i.title,
    domain: i.sourceDomain,
    excerpt: i.excerpt,
  }))

  const results = await engine.classifyIntents(inputs)
  let updated = 0
  for (const r of results) {
    const item = await adapter.getItem(r.id)
    if (!item) continue
    await adapter.putItem({
      ...item,
      saveIntent: r.intent,
      saveIntentSource: 'ai',
    })
    updated++
  }
  return updated
}
