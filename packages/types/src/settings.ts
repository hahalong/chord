export type StorageMode = 'local' | 'cloud'
export type ResurfaceFreq = 'daily' | 'weekly' | 'off'
export type AIEngineMode = 'offline' | 'ai'

/**
 * 「主动出现」系统设置（Phase 1 引入）
 * 详见 plan: 五层「主动出现」体系
 *
 * - badgeMode：扩展图标 badge 显示规则
 * - daily*：Layer 2 智能日常通知
 * - echoMoment / milestone / recall：Layer 3 / 3.5 / 4 的开关（实现后生效）
 * - muteUntil：紧急静音（一键暂停所有通知到某时刻）
 */
export type BadgeMode = 'number' | 'dot' | 'off'
export interface NotificationSettings {
  badgeMode: BadgeMode      // 默认 'number'
  daily: boolean             // 默认 true（与 resurfaceFreq != 'off' 等价）
  quietStart: number         // 0-23，默认 22（22:00 起静音）
  quietEnd: number           // 0-23，默认 8（08:00 结束静音）
  skipWeekend: boolean       // 默认 false
  echoMoment: boolean        // 默认 true（visit 触发，Phase 3 启用）
  milestone: boolean         // 默认 true（仪式时刻，Phase 5 启用）
  recall: boolean            // 默认 true（重新召回，Phase 4 启用）
  muteUntil?: number         // 临时全静音到这个时刻（timestamp），过期失效
}

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  badgeMode: 'number',
  daily: true,
  quietStart: 22,
  quietEnd: 8,
  skipWeekend: false,
  echoMoment: true,
  milestone: true,
  recall: true,
}
export type AIProvider =
  | 'chord_bundled'  // Chord 内置：编译时注入的开发者 token，用户无需配置
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'deepseek'
  | 'doubao'
  | 'kimi'
  | 'zhipu'
  | 'siliconflow'
  | 'qwen'
  | 'custom'

export interface AIEngineSettings {
  mode: AIEngineMode
  provider?: AIProvider
  /**
   * 当前活跃 provider 的 Key（运行时从 providerKeys 解析得来 + chord_bundled 时由 build-time token 注入）。
   * 这个字段不应该被持久化到 storage——putSettings 会主动剥掉。providerKeys 才是真理源。
   */
  apiKey?: string
  /**
   * 每个 provider 各自的 Key 字典。chord_bundled 不进这个字典——它的 Key 是 build-time 注入的。
   * 用户在 Settings 切换 provider 时，UI 显示和读取的都是这个字典里对应键的值。
   */
  providerKeys?: Partial<Record<AIProvider, string>>
  baseUrl?: string    // 自定义接口时使用
  model?: string      // 可手动填写覆盖默认值
}

export interface UserSettings {
  userId: string           // 匿名ID，首次启动时生成
  deviceId: string         // 设备ID，首次启动时生成
  storageMode: StorageMode
  resurfaceFreq: ResurfaceFreq
  resurfaceTime: string    // 'HH:mm' 格式，如 '09:00'
  lastResurfacedAt?: number
  aiEngine: AIEngineSettings
  domainPrefs: Record<string, 'content' | 'tool'>  // 用户对域名的分类偏好
  streakCount: number
  lastActiveDate?: string  // 'YYYY-MM-DD'，用于 streak 计算
  onboardingCompleted: boolean
  skinId: string           // 当前皮肤，默认 'g-pink'

  /**
   * 「放手」时是否也从 Chrome 书签中删除该条目。
   * 'ask'：首次询问用户，记住偏好后变成 'always' 或 'never'（默认）
   * 'always'：每次放手都删
   * 'never'：永不删，只从 Chord 移出
   * 详见 Chord_二向决策_实施方案.md §5
   */
  releaseAlsoDeletesBookmark: 'ask' | 'always' | 'never'

  /**
   * 主动出现系统设置。老用户没这个字段 → 应用 DEFAULT_NOTIFICATIONS
   * Phase 1: badgeMode + daily 生效
   * Phase 3+: echoMoment / milestone / recall 生效
   */
  notifications?: NotificationSettings

  /**
   * 跟踪 popup / options 最后一次被打开的时刻（重新召回判定）
   * 在 popup/options main.tsx mount 时写入
   */
  lastOpenedAt?: number
}

export const DEFAULT_SETTINGS: Omit<UserSettings, 'userId' | 'deviceId'> = {
  storageMode: 'local',
  resurfaceFreq: 'daily',
  resurfaceTime: '09:00',
  aiEngine: { mode: 'offline' },
  domainPrefs: {},
  streakCount: 0,
  onboardingCompleted: false,
  skinId: 'g-pink',
  releaseAlsoDeletesBookmark: 'ask',
  notifications: DEFAULT_NOTIFICATIONS,
}
