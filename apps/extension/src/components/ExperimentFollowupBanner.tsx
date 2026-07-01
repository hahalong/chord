// v1.1.4 · 隐性自我 §5 "愿意试 7 天" 闭环 · 顶部补看 banner
//
// 用户当时没看到通知（关了浏览器 / 关了通知权限）时，打开任意 options 页都能补选
// 通知 button + banner button 共用 SW 里的 RECORD_EXPERIMENT_OUTCOME handler

import { useEffect } from 'preact/hooks'
import { signal } from '@preact/signals'
import type { Experiment, ExperimentOutcome } from '@chord/types'

const STORAGE_KEY = 'chord_experiments'
const experiments = signal<Experiment[]>([])
const dismissedIds = signal<Set<string>>(new Set())

function loadPending() {
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    const all = (data[STORAGE_KEY] as Experiment[] | undefined) ?? []
    experiments.value = all.filter((e) => e.status === 'due')
  })
}

async function recordOutcome(id: string, outcome: ExperimentOutcome) {
  try {
    await chrome.runtime.sendMessage({ type: 'RECORD_EXPERIMENT_OUTCOME', id, outcome })
  } catch {
    // sendMessage 偶发 no receiver 忽略
  }
  loadPending()
}

export function ExperimentFollowupBanner() {
  useEffect(() => {
    loadPending()
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }) => {
      if (changes[STORAGE_KEY]) loadPending()
    }
    chrome.storage.onChanged.addListener(listener)
    return () => { chrome.storage.onChanged.removeListener(listener) }
  }, [])

  const visible = experiments.value.filter((e) => !dismissedIds.value.has(e.id))
  if (visible.length === 0) return null

  // 一次只显示最早那条（避免多个同时刷屏；剩下的下次再看）
  const exp = visible[0]!
  const daysSince = Math.floor((Date.now() - exp.startedAt) / 86_400_000)
  const cleanText = exp.experimentText.replace(/<[^>]+>/g, '').slice(0, 80)

  return (
    <div class="exp-banner" role="region" aria-label="实验回访">
      <div class="exp-banner-icon">🌱</div>
      <div class="exp-banner-body">
        <div class="exp-banner-title">
          {daysSince} 天前你说想试试——现在感觉怎么样？
        </div>
        <div class="exp-banner-quote">「{cleanText}」</div>
      </div>
      <div class="exp-banner-actions">
        <button
          class="exp-btn exp-btn-changed"
          onClick={() => recordOutcome(exp.id, 'changed')}
          title="有效果 · 感觉到变化了"
        >✓ 有改变</button>
        <button
          class="exp-btn exp-btn-partial"
          onClick={() => recordOutcome(exp.id, 'partial')}
          title="一半吧 · 有做但效果不确定"
        >一般</button>
        <button
          class="exp-btn exp-btn-not-done"
          onClick={() => recordOutcome(exp.id, 'not_done')}
          title="老实说没做到"
        >× 没真做</button>
        <button
          class="exp-btn exp-btn-later"
          onClick={() => {
            const next = new Set(dismissedIds.value)
            next.add(exp.id)
            dismissedIds.value = next
          }}
          title="现在不想选，一会儿再问"
        >晚点</button>
      </div>
    </div>
  )
}
