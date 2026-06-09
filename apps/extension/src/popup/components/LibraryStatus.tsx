import { useEffect } from 'preact/hooks'
import { signal } from '@preact/signals'
import type { UserSettings, Item } from '@chord/types'
import { ChromeStorageAdapter } from '../../storage/ChromeStorageAdapter.js'

const adapter = new ChromeStorageAdapter()

const pendingCount = signal(0)
const streak = signal(0)

export function LibraryStatus() {
  useEffect(() => {
    load()
    // 仅在 items / settings 变化时 reload（streak 在 settings 里）
    return adapter.onChange((key) => {
      if (key === 'chord_items' || key === 'chord_settings') load()
    })
  }, [])

  async function load() {
    const [items, settings] = await Promise.all([
      adapter.getItems({ status: ['pending'], type: ['content'] }) as Promise<Item[]>,
      adapter.getSettings() as Promise<UserSettings>,
    ])
    pendingCount.value = items.length
    streak.value = settings.streakCount
  }

  return (
    <div class="lib-status">
      <a class="lib-link" href={chrome.runtime.getURL('src/options/index.html#dashboard')} target="_blank">
        <span class="lib-count">{pendingCount.value}</span>
        <span class="lib-label">条待处理</span>
      </a>
      {streak.value > 0 && (
        <span class="streak-badge">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="color:var(--rose)"><use href="#icon-sakura"/></svg>
          连续 {streak.value} 天
        </span>
      )}
    </div>
  )
}
