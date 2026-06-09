import { describe, it, expect } from 'vitest'
import { importBookmarks } from './ItemService.js'
import type { StorageAdapter, Item, ChordEvent, Cluster, UserSettings, BatchOperation } from '@chord/types'
import { DEFAULT_SETTINGS } from '@chord/types'

class FastAdapter implements StorageAdapter {
  items: Item[] = []
  events: ChordEvent[] = []
  settings: UserSettings = { ...DEFAULT_SETTINGS, userId: 'u', deviceId: 'd' }
  clusters: Cluster[] = []

  async getItems() { return this.items }
  async getItem(id: string) { return this.items.find((i) => i.id === id) ?? null }
  async putItem(item: Item) {
    const idx = this.items.findIndex((i) => i.id === item.id)
    if (idx >= 0) this.items[idx] = item; else this.items.push(item)
  }
  async deleteItem(id: string) { this.items = this.items.filter((i) => i.id !== id) }
  async appendEvent(e: ChordEvent) { this.events.push(e) }
  async getEvents() { return this.events }
  async getSettings() { return this.settings }
  async putSettings(s: Partial<UserSettings>) { this.settings = { ...this.settings, ...s } }
  async getClusters() { return this.clusters }
  async putClusters(c: Cluster[]) { this.clusters = c }
  async batch(ops: BatchOperation[]) {
    for (const op of ops) {
      if (op.op === 'put_item') await this.putItem(op.item)
      else if (op.op === 'delete_item') await this.deleteItem(op.id)
    }
  }
}

const OPTS = { userId: 'u', deviceId: 'd' }

function makeBmNodes(n: number) {
  const domains = ['medium.com', 'dev.to', 'blog.example.com', 'css-tricks.com', 'smashingmagazine.com']
  const children = Array.from({ length: n }, (_, i) => ({
    id: String(i),
    title: `Article ${i}`,
    url: `https://${domains[i % domains.length]}/post/article-${i}`,
  }))
  return [{ id: 'root', title: 'Bookmarks', children }]
}

describe('Performance', () => {
  it('imports 1000 bookmarks in < 10 seconds', async () => {
    const adapter = new FastAdapter()
    const nodes = makeBmNodes(1000)
    const t0 = performance.now()
    const results = await importBookmarks(adapter, nodes as any, OPTS)
    const elapsed = performance.now() - t0

    console.log(`1000 bookmark import: ${elapsed.toFixed(0)}ms, added=${results.added}`)
    expect(results.added).toBe(1000)
    expect(elapsed).toBeLessThan(10_000)
  }, 15_000)
})
