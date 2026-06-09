import type { Item, ItemFilter, SaveItemInput, Decision } from './item.js'
import type { ChordEvent } from './event.js'
import type { Cluster, ClusterUserIntent } from './cluster.js'
import type { UserSettings } from './settings.js'

export type BatchOperation =
  | { op: 'put_item'; item: Item }
  | { op: 'delete_item'; id: string }
  | { op: 'put_settings'; settings: Partial<UserSettings> }
  | { op: 'put_clusters'; clusters: Cluster[] }

export interface StorageAdapter {
  // Items CRUD
  getItems(filter?: ItemFilter): Promise<Item[]>
  getItem(id: string): Promise<Item | null>
  putItem(item: Item): Promise<void>
  deleteItem(id: string): Promise<void>

  // Events（只追加，永不修改）
  appendEvent(event: ChordEvent): Promise<void>
  getEvents(since?: number): Promise<ChordEvent[]>

  // Settings
  getSettings(): Promise<UserSettings>
  putSettings(settings: Partial<UserSettings>): Promise<void>

  // Clusters
  getClusters(): Promise<Cluster[]>
  putClusters(clusters: Cluster[]): Promise<void>

  // Cluster user intents（用户主动声明的行动方向，独立于 cluster 重建生命周期）
  getClusterUserIntents(): Promise<ClusterUserIntent[]>
  putClusterUserIntents(intents: ClusterUserIntent[]): Promise<void>

  // 原子批量写入（用于事件溯源重放时的原子写入）
  batch(operations: BatchOperation[]): Promise<void>

  // 可观察性（可选实现，供响应式 UI 使用）
  onChange?: (callback: (key: string) => void) => () => void
}

export interface StorageSnapshot {
  items: Item[]
  settings: UserSettings
  clusters: Cluster[]
}

// Re-export for convenience
export type { Item, ItemFilter, SaveItemInput, Decision, ChordEvent, Cluster, UserSettings }
