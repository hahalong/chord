// Chord 静默升级后的「新版本可用」横幅
// SW 在 onInstalled(reason='update') 时写入 chord_extension_updated
// 这个组件订阅 storage 变化，旧 JS 也能感知到「我已经过时了」并提示用户刷新

import { useEffect } from 'preact/hooks'
import { signal } from '@preact/signals'

interface UpdateInfo {
  from: string
  to: string
  at: number
  dismissed: boolean
}

const updateInfo = signal<UpdateInfo | null>(null)

function load() {
  chrome.storage.local.get('chord_extension_updated', (data) => {
    const info = data['chord_extension_updated'] as UpdateInfo | undefined
    updateInfo.value = info && !info.dismissed ? info : null
  })
}

export function NewVersionBanner() {
  useEffect(() => {
    load()
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }) => {
      if (changes['chord_extension_updated']) load()
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  const info = updateInfo.value
  if (!info) return null

  async function dismiss() {
    await chrome.storage.local.set({
      chord_extension_updated: { ...info, dismissed: true },
    })
  }

  async function refresh() {
    await dismiss()
    location.reload()
  }

  return (
    <div class="new-version-banner">
      <div class="nvb-text">
        <strong>Chord 已更新</strong>（{info.from} → {info.to}）·
        刷新当前页面就能用上新版功能
      </div>
      <div class="nvb-actions">
        <button class="nvb-refresh" onClick={refresh}>立即刷新</button>
        <button class="nvb-close" onClick={dismiss} title="稍后再说">×</button>
      </div>
    </div>
  )
}
