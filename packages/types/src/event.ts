export type EventType =
  | 'item_saved'
  | 'item_processed'
  | 'item_woken'
  | 'chip_selected'
  | 'note_added'       // properties 只含 noteLength，不含内容
  | 'cluster_updated'
  | 'session_start'
  | 'session_end'
  | 'settings_changed'

export interface EventProperties {
  itemId?: string
  decision?: 'keep' | 'used' | 'release'
  decisionMs?: number   // 决策耗时
  wakeCount?: number
  chipValue?: string
  noteLength?: number   // 不记录内容，只记字数
  clustersCount?: number
  settingKey?: string
  [key: string]: unknown
}

export interface ChordEvent {
  id: string
  userId: string        // 匿名ID，本地生成一次
  timestamp: number
  event: EventType
  properties: EventProperties
  deviceId: string      // 标识来自哪台设备，用于云同步
}
