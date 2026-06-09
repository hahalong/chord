import type { StorageAdapter, ChordEvent, EventType, EventProperties } from '@chord/types'
import { nanoid } from '../utils/id.js'

export async function emitEvent(
  adapter: StorageAdapter,
  userId: string,
  deviceId: string,
  event: EventType,
  properties: EventProperties = {},
): Promise<void> {
  const e: ChordEvent = {
    id: nanoid(),
    userId,
    deviceId,
    timestamp: Date.now(),
    event,
    properties,
  }
  await adapter.appendEvent(e)
}

// 从事件日志重放，重建 items 最终状态（用于云同步合并）
export function replayEvents(events: ChordEvent[]): Map<string, Record<string, unknown>> {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp)
  const itemMap = new Map<string, Record<string, unknown>>()

  for (const e of sorted) {
    if (e.event === 'item_saved' && e.properties.itemId) {
      // item_saved 时 item 数据应存在 properties 里（由 ItemService 负责）
    }
    if (e.event === 'item_processed' && e.properties.itemId) {
      const item = itemMap.get(e.properties.itemId) ?? {}
      const decision = e.properties.decision
      item['status'] = decision === 'keep' ? 'kept' : decision === 'used' ? 'used' : 'released'
      item['processedAt'] = e.timestamp
      itemMap.set(e.properties.itemId, item)
    }
  }

  return itemMap
}
