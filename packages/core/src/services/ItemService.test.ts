import { describe, it, expect, beforeEach } from 'vitest'
import { saveItem, processItem, addPrivateNote, importBookmarks, batchRelease } from './ItemService.js'
import type { StorageAdapter, Item, ChordEvent, Cluster, ClusterUserIntent, UserSettings, BatchOperation } from '@chord/types'
import { DEFAULT_SETTINGS } from '@chord/types'

// ─── In-memory StorageAdapter ────────────────────────────────

class MemoryAdapter implements StorageAdapter {
  items: Item[] = []
  events: ChordEvent[] = []
  settings: UserSettings = {
    ...DEFAULT_SETTINGS,
    userId: 'test-user',
    deviceId: 'test-device',
  }
  clusters: Cluster[] = []
  clusterUserIntents: ClusterUserIntent[] = []

  async getItems() { return this.items }
  async getItem(id: string) { return this.items.find((i) => i.id === id) ?? null }
  async putItem(item: Item) {
    const idx = this.items.findIndex((i) => i.id === item.id)
    if (idx >= 0) this.items[idx] = item
    else this.items.push(item)
  }
  async deleteItem(id: string) { this.items = this.items.filter((i) => i.id !== id) }
  async appendEvent(e: ChordEvent) { this.events.push(e) }
  async getEvents() { return this.events }
  async getSettings() { return this.settings }
  async putSettings(s: Partial<UserSettings>) { this.settings = { ...this.settings, ...s } }
  async getClusters() { return this.clusters }
  async putClusters(c: Cluster[]) { this.clusters = c }
  async getClusterUserIntents() { return this.clusterUserIntents }
  async putClusterUserIntents(i: ClusterUserIntent[]) { this.clusterUserIntents = i }
  async batch(ops: BatchOperation[]) {
    for (const op of ops) {
      if (op.op === 'put_item') await this.putItem(op.item)
      else if (op.op === 'delete_item') await this.deleteItem(op.id)
    }
  }
}

const OPTS = { userId: 'test-user', deviceId: 'test-device' }

// ─── saveItem ────────────────────────────────────────────────

describe('ItemService.saveItem', () => {
  let adapter: MemoryAdapter

  beforeEach(() => { adapter = new MemoryAdapter() })

  it('saves a new item and returns status=added', async () => {
    const r = await saveItem(adapter, { url: 'https://example.com/blog/post', title: 'Post', source: 'saved' }, OPTS)
    expect(r.status).toBe('added')
    expect(r.item.url).toBe('https://example.com/blog/post')
    expect(r.item.status).toBe('pending')
    expect(r.item.wakeCount).toBe(0)
    expect(adapter.items).toHaveLength(1)
  })

  it('deduplicates by URL, returns status=duplicate', async () => {
    await saveItem(adapter, { url: 'https://example.com/blog/post', title: 'Post', source: 'saved' }, OPTS)
    const r = await saveItem(adapter, { url: 'https://example.com/blog/post', title: 'Same URL', source: 'bookmark' }, OPTS)
    expect(r.status).toBe('duplicate')
    expect(adapter.items).toHaveLength(1)
  })

  it('emits item_saved event', async () => {
    await saveItem(adapter, { url: 'https://example.com', title: 'Test', source: 'saved' }, OPTS)
    expect(adapter.events.some((e) => e.event === 'item_saved')).toBe(true)
  })

  it('uses input.type if provided', async () => {
    const r = await saveItem(adapter, { url: 'https://gmail.com', title: 'Gmail', source: 'bookmark_auto', type: 'tool' }, OPTS)
    expect(r.item.type).toBe('tool')
  })

  it('defaults type to content when not provided', async () => {
    const r = await saveItem(adapter, { url: 'https://example.com/article', title: 'Article', source: 'saved' }, OPTS)
    expect(r.item.type).toBe('content')
  })

  it('extracts sourceDomain from URL (strips www prefix)', async () => {
    const r = await saveItem(adapter, { url: 'https://www.medium.com/topic/post', title: 'Article', source: 'saved' }, OPTS)
    expect(r.item.sourceDomain).toBe('medium.com')
  })

  it('uses URL hostname as title if title is empty', async () => {
    const r = await saveItem(adapter, { url: 'https://example.com/page', title: '', source: 'saved' }, OPTS)
    expect(r.item.title).toBe('example.com')
  })

  it('honors input.savedAt when provided (preserve original bookmark time)', async () => {
    const yearAgo = Date.now() - 365 * 86_400_000
    const r = await saveItem(
      adapter,
      { url: 'https://example.com/old', title: '老书签', source: 'bookmark', savedAt: yearAgo },
      OPTS,
    )
    expect(r.item.savedAt).toBe(yearAgo)
  })

  it('falls back to Date.now() when savedAt is not provided', async () => {
    const before = Date.now()
    const r = await saveItem(adapter, { url: 'https://example.com/new', title: 'fresh', source: 'saved' }, OPTS)
    expect(r.item.savedAt).toBeGreaterThanOrEqual(before)
    expect(r.item.savedAt).toBeLessThanOrEqual(Date.now())
  })

  it('cluster 字段不在 saveItem 设置——由 ClusterService.recluster 批处理（unclustered 触发）', async () => {
    const r = await saveItem(adapter, { url: 'https://example.com/p', title: 'X', source: 'saved' }, OPTS)
    expect(r.item.cluster).toBeUndefined()
  })
})

// ─── processItem ─────────────────────────────────────────────

describe('ItemService.processItem', () => {
  let adapter: MemoryAdapter
  let itemId: string

  beforeEach(async () => {
    adapter = new MemoryAdapter()
    const r = await saveItem(adapter, { url: 'https://example.com/post', title: 'Test', source: 'saved' }, OPTS)
    itemId = r.item.id
  })

  it('keep → status becomes kept', async () => {
    const item = await processItem(adapter, itemId, 'keep', OPTS)
    expect(item.status).toBe('kept')
    expect(item.processedAt).toBeDefined()
  })

  it('used → status becomes used', async () => {
    const item = await processItem(adapter, itemId, 'used', OPTS)
    expect(item.status).toBe('used')
  })

  it('release → status becomes released', async () => {
    const item = await processItem(adapter, itemId, 'release', OPTS)
    expect(item.status).toBe('released')
  })

  it('emits item_processed event', async () => {
    await processItem(adapter, itemId, 'keep', OPTS)
    expect(adapter.events.some((e) => e.event === 'item_processed')).toBe(true)
  })

  it('saves chip and custom when provided', async () => {
    const item = await processItem(adapter, itemId, 'used', {
      ...OPTS,
      chip: '启发思路',
      custom: '很有用',
    })
    expect(item.usageChip).toBe('启发思路')
    expect(item.usageCustom).toBe('很有用')
  })

  it('throws when item not found', async () => {
    await expect(processItem(adapter, 'nonexistent', 'keep', OPTS)).rejects.toThrow()
  })

  // ─── v2 二向决策：放手原因（reason）─────
  it('release with reason writes releaseReason field', async () => {
    const item = await processItem(adapter, itemId, 'release', { ...OPTS, reason: 'not_interested' })
    expect(item.status).toBe('released')
    expect(item.releaseReason).toBe('not_interested')
    expect(item.releaseReasonCustom).toBeUndefined()
    expect(item.releaseReasonKeywords).toBeUndefined()
  })

  it('release with custom reason extracts keywords from text', async () => {
    const item = await processItem(adapter, itemId, 'release', {
      ...OPTS,
      reason: 'custom',
      reasonCustom: '感觉这个领域我没动力学下去了',
    })
    expect(item.releaseReason).toBe('custom')
    expect(item.releaseReasonCustom).toBe('感觉这个领域我没动力学下去了')
    expect(item.releaseReasonKeywords?.length).toBeGreaterThan(0)
    // 至少包含 '领域' 或 '动力'
    expect(item.releaseReasonKeywords?.some((k) => k.includes('领域') || k.includes('动力'))).toBe(true)
  })

  it('release without reason leaves releaseReason undefined', async () => {
    const item = await processItem(adapter, itemId, 'release', OPTS)
    expect(item.status).toBe('released')
    expect(item.releaseReason).toBeUndefined()
  })

  it('keep with reason: reason field NOT written (only release uses it)', async () => {
    const item = await processItem(adapter, itemId, 'keep', { ...OPTS, reason: 'not_interested' })
    expect(item.releaseReason).toBeUndefined()
  })

  it('release event includes reason in properties when present', async () => {
    await processItem(adapter, itemId, 'release', { ...OPTS, reason: 'no_time' })
    const ev = adapter.events.find((e) => e.event === 'item_processed' && e.properties['decision'] === 'release')
    expect(ev?.properties['reason']).toBe('no_time')
  })
})

// ─── batchRelease ──────────────────────────────────────────

describe('ItemService.batchRelease', () => {
  let adapter: MemoryAdapter
  let ids: string[]

  beforeEach(async () => {
    adapter = new MemoryAdapter()
    ids = []
    for (let i = 0; i < 5; i++) {
      const r = await saveItem(adapter, { url: `https://example.com/${i}`, title: `Item ${i}`, source: 'saved' }, OPTS)
      ids.push(r.item.id)
    }
  })

  it('releases all items in batch with respective reasons', async () => {
    const r = await batchRelease(adapter, [
      { itemId: ids[0]!, reason: 'used' },
      { itemId: ids[1]!, reason: 'not_interested' },
      { itemId: ids[2]!, reason: 'misjudged' },
    ], OPTS)
    expect(r.releasedCount).toBe(3)
    expect(r.itemIds).toEqual([ids[0], ids[1], ids[2]])

    const i0 = await adapter.getItem(ids[0]!)
    const i1 = await adapter.getItem(ids[1]!)
    expect(i0?.status).toBe('released')
    expect(i0?.releaseReason).toBe('used')
    expect(i1?.releaseReason).toBe('not_interested')

    // Unreleased items unchanged
    const i3 = await adapter.getItem(ids[3]!)
    expect(i3?.status).toBe('pending')
  })

  it('skips nonexistent items without throwing', async () => {
    const r = await batchRelease(adapter, [
      { itemId: 'fake-id-1', reason: 'used' },
      { itemId: ids[0]!, reason: 'used' },
      { itemId: 'fake-id-2', reason: 'used' },
    ], OPTS)
    expect(r.releasedCount).toBe(1)
    expect(r.itemIds).toEqual([ids[0]])
  })

  it('handles items without reason (user skipped)', async () => {
    const r = await batchRelease(adapter, [
      { itemId: ids[0]! },     // no reason
      { itemId: ids[1]! },     // no reason
    ], OPTS)
    expect(r.releasedCount).toBe(2)
    const i = await adapter.getItem(ids[0]!)
    expect(i?.status).toBe('released')
    expect(i?.releaseReason).toBeUndefined()
  })
})

// ─── addPrivateNote ──────────────────────────────────────────

describe('ItemService.addPrivateNote', () => {
  it('saves note to item, emits note_added event', async () => {
    const adapter = new MemoryAdapter()
    const { item } = await saveItem(adapter, { url: 'https://example.com', title: 'T', source: 'saved' }, OPTS)
    const updated = await addPrivateNote(adapter, item.id, '这是私人笔记', OPTS)
    expect(updated.privateNote).toBe('这是私人笔记')
    expect(adapter.events.some((e) => e.event === 'note_added')).toBe(true)
    // event should only contain noteLength, not the content
    const noteEvent = adapter.events.find((e) => e.event === 'note_added')
    expect(noteEvent?.properties['noteLength']).toBe(6) // '这是私人笔记'.length === 6
    expect(JSON.stringify(noteEvent?.properties)).not.toContain('私人笔记')
  })
})

// ─── importBookmarks ─────────────────────────────────────────

describe('ItemService.importBookmarks', () => {
  it('imports flat bookmark list', async () => {
    const adapter = new MemoryAdapter()
    const nodes = [
      { id: '1', title: 'Bookmark Bar', children: [
        { id: '2', title: 'Article', url: 'https://example.com/blog/post1' },
        { id: '3', title: 'Tool', url: 'https://gmail.com' },
      ]},
    ]
    const results = await importBookmarks(adapter, nodes as any, OPTS)
    expect(results.added).toBe(2)
    expect(adapter.items).toHaveLength(2)
  })

  it('handles nested bookmark folders', async () => {
    const adapter = new MemoryAdapter()
    const nodes = [
      { id: '1', title: 'Root', children: [
        { id: '2', title: 'Folder A', children: [
          { id: '3', title: 'Page', url: 'https://a.com/post/1' },
          { id: '4', title: 'Page2', url: 'https://b.com/article/2' },
        ]},
        { id: '5', title: 'Folder B', children: [
          { id: '6', title: 'Page3', url: 'https://c.com/blog/3' },
        ]},
      ]},
    ]
    const results = await importBookmarks(adapter, nodes as any, OPTS)
    expect(results.added).toBe(3)
  })

  it('skips duplicates during import', async () => {
    const adapter = new MemoryAdapter()
    await saveItem(adapter, { url: 'https://example.com/post', title: 'Existing', source: 'saved' }, OPTS)
    const nodes = [
      { id: '1', title: 'Root', children: [
        { id: '2', title: 'Same', url: 'https://example.com/post' },
        { id: '3', title: 'New', url: 'https://new-site.com/blog/article' },
      ]},
    ]
    const results = await importBookmarks(adapter, nodes as any, OPTS)
    expect(results.added).toBe(1)
    expect(results.duplicate).toBe(1)
  })

  it('skips bookmark folders (no url)', async () => {
    const adapter = new MemoryAdapter()
    const nodes = [
      { id: '1', title: 'Folder Only', children: [] },
    ]
    const results = await importBookmarks(adapter, nodes as any, OPTS)
    expect(results.added).toBe(0)
  })
})
