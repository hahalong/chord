import type { StorageAdapter, UserSettings } from '@chord/types'
import { toDateString } from '../utils/date.js'

export async function checkAndUpdateStreak(
  adapter: StorageAdapter,
  settings: UserSettings,
): Promise<UserSettings> {
  const today = toDateString(Date.now())

  if (settings.lastActiveDate === today) {
    // 今天已经打卡，不重复计算
    return settings
  }

  const yesterday = toDateString(Date.now() - 86_400_000)
  const newStreak =
    settings.lastActiveDate === yesterday
      ? settings.streakCount + 1  // 连续
      : 1                          // 断了，重新开始

  const updated: UserSettings = {
    ...settings,
    streakCount: newStreak,
    lastActiveDate: today,
  }
  await adapter.putSettings({ streakCount: newStreak, lastActiveDate: today })
  return updated
}
