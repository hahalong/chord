import { describe, it, expect, beforeEach } from 'vitest'
import { migrateUsedToKept } from './Migration.js'
import type { StorageAdapter, Item, ChordEvent, Cluster, ClusterUserIntent, UserSettings, BatchOperation } from '@chord/types'
import { DEFAULT_SETTINGS } from '@chord/types'

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
  async putItems(items: Item[]) { this.items = items }
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

function mkItem(id: string, status: Item['status']): Item {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Item ${id}`,
    favicon: '',
    savedAt: Date.now() - 86400000,
    sourceDomain: 'example.com',
    type: 'content',
    status,
    wakeCount: 0,
    source: 'bookmark',
  }
}

describe('migrateUsedToKept', () => {
  let adapter: MemoryAdapter

  beforeEach(() => {
    adapter = new MemoryAdapter()
  })

  it('migrates all used items to kept + sets migratedFromUsed=true', async () => {
    adapter.items = [
      mkItem('a', 'used'),
      mkItem('b', 'used'),
      mkItem('c', 'used'),
      mkItem('d', 'kept'),
      mkItem('e', 'pending'),
      mkItem('f', 'released'),
    ]

    const result = await migrateUsedToKept(adapter)

    expect(result.migratedCount).toBe(3)
    expect(result.totalItems).toBe(6)

    // 3 个 used 全部变成 kept + 标记
    const a = await adapter.getItem('a')
    const b = await adapter.getItem('b')
    const c = await adapter.getItem('c')
    expect(a?.status).toBe('kept')
    expect(b?.status).toBe('kept')
    expect(c?.status).toBe('kept')
    expect(a?.migratedFromUsed).toBe(true)
    expect(b?.migratedFromUsed).toBe(true)
    expect(c?.migratedFromUsed).toBe(true)

    // 其他状态不动
    const d = await adapter.getItem('d')
    const e = await adapter.getItem('e')
    const f = await adapter.getItem('f')
    expect(d?.status).toBe('kept')
    expect(d?.migratedFromUsed).toBeUndefined()
    expect(e?.status).toBe('pending')
    expect(e?.migratedFromUsed).toBeUndefined()
    expect(f?.status).toBe('released')
    expect(f?.migratedFromUsed).toBeUndefined()
  })

  it('is idempotent (second call is a no-op)', async () => {
    adapter.items = [mkItem('a', 'used'), mkItem('b', 'kept')]

    const first = await migrateUsedToKept(adapter)
    expect(first.migratedCount).toBe(1)

    const second = await migrateUsedToKept(adapter)
    expect(second.migratedCount).toBe(0)        // 没有 used 了，啥都不做

    // a 状态保持 kept + migratedFromUsed=true，没有被二次覆盖
    const a = await adapter.getItem('a')
    expect(a?.status).toBe('kept')
    expect(a?.migratedFromUsed).toBe(true)
  })

  it('preserves all other item fields untouched', async () => {
    const original: Item = {
      ...mkItem('x', 'used'),
      processedAt: 1234567890,
      wakeCount: 5,
      usageChip: '启发思路',
      usageCustom: '当时记下的',
      privateNote: '我的笔记',
      cluster: 'AI 工程',
      engagementScore: 75,
    }
    adapter.items = [original]

    await migrateUsedToKept(adapter)
    const after = await adapter.getItem('x')

    expect(after?.status).toBe('kept')
    expect(after?.migratedFromUsed).toBe(true)
    // 所有其他字段保留
    expect(after?.processedAt).toBe(1234567890)
    expect(after?.wakeCount).toBe(5)
    expect(after?.usageChip).toBe('启发思路')
    expect(after?.usageCustom).toBe('当时记下的')
    expect(after?.privateNote).toBe('我的笔记')
    expect(after?.cluster).toBe('AI 工程')
    expect(after?.engagementScore).toBe(75)
  })

  it('returns zero counts for empty storage', async () => {
    const result = await migrateUsedToKept(adapter)
    expect(result.migratedCount).toBe(0)
    expect(result.totalItems).toBe(0)
  })

  it('handles storage with only non-used items', async () => {
    adapter.items = [mkItem('a', 'kept'), mkItem('b', 'pending'), mkItem('c', 'released')]
    const result = await migrateUsedToKept(adapter)
    expect(result.migratedCount).toBe(0)
    expect(result.totalItems).toBe(3)
    // 没有任何 item 被打 migratedFromUsed
    for (const i of adapter.items) {
      expect(i.migratedFromUsed).toBeUndefined()
    }
  })
})
