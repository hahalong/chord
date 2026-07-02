// 全局后台 recluster 进度条
// 订阅 chord_recluster_status storage key，running 时展示在页面顶部
// 用户可以关闭（但不影响后台继续跑）

import { useEffect } from 'preact/hooks'
import { signal, computed } from '@preact/signals'

interface ReclusterStatus {
  running: boolean
  startedAt?: number
  totalItems?: number
  estimatedSeconds?: number
  lastError?: string
  lastCompletedAt?: number
}

const status = signal<ReclusterStatus | null>(null)
const dismissed = signal(false)
const tick = signal(0)   // 每秒 tick 一次让 ETA 重算

function loadStatus() {
  chrome.storage.local.get('chord_recluster_status', (data) => {
    const s = data['chord_recluster_status'] as ReclusterStatus | undefined
    // v3.1.29 · stale 自动清理（不再等 SW 重启）
    //   bug 背景：clearStaleReclusterStatus 只在 SW 启动时跑。Chrome 一直不关 → SW 一直活着 → stale status 永远显示
    //   修：UI 读到 status 时也检查 elapsed > 3× eta 就直接清，并不显示
    if (s?.running && s.startedAt) {
      const elapsed = Date.now() - s.startedAt
      const timeout = (s.estimatedSeconds ?? 60) * 3 * 1000
      if (elapsed > timeout) {
        console.log(`[Chord] ReclusterStatusBar: detected stale status (elapsed ${Math.round(elapsed / 1000)}s > 3×eta ${Math.round(timeout / 1000)}s) — clearing`)
        chrome.storage.local.remove('chord_recluster_status')
        status.value = null
        return
      }
    }
    status.value = s ?? null
    if (s?.running) dismissed.value = false  // 新一轮开始就重置 dismissed
  })
}

export function ReclusterStatusBar() {
  useEffect(() => {
    loadStatus()
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }) => {
      if (changes['chord_recluster_status']) loadStatus()
    }
    chrome.storage.onChanged.addListener(listener)
    const ticker = setInterval(() => { tick.value++ }, 1000)
    return () => {
      chrome.storage.onChanged.removeListener(listener)
      clearInterval(ticker)
    }
  }, [])

  // tick.value 被引用以触发 computed 重算 ETA
  const elapsed = computed(() => {
    void tick.value
    if (!status.value?.startedAt) return 0
    return Math.floor((Date.now() - status.value.startedAt) / 1000)
  })

  const s = status.value
  if (!s) return null

  // running 且未被关闭
  if (s.running && !dismissed.value) {
    const total = s.estimatedSeconds ?? 30
    const passed = elapsed.value
    const remaining = Math.max(0, total - passed)
    // 进度条到 90% 后慢慢爬（避免到 100% 还在跑给人虚假感）
    const rawPct = total > 0 ? Math.min(100, (passed / total) * 100) : 0
    const pct = rawPct >= 90 ? 90 + (rawPct - 90) * 0.3 : rawPct

    return (
      <div class="recluster-status-bar recluster-running">
        <div class="rsb-icon">
          <span class="rsb-dot" /><span class="rsb-dot" /><span class="rsb-dot" />
        </div>
        <div class="rsb-text">
          <div class="rsb-title">正在用 AI 分析你的 {s.totalItems ?? '?'} 条收藏</div>
          <div class="rsb-meta">
            {remaining > 0 ? `预计还需 ${remaining} 秒` : '即将完成…'}
            <span class="rsb-hint"> · 你可以继续浏览，完成后会自动更新</span>
          </div>
        </div>
        <div class="rsb-progress">
          <div class="rsb-progress-fill" style={`width:${pct.toFixed(1)}%`} />
        </div>
        <button class="rsb-close" onClick={() => { dismissed.value = true }} title="收起">×</button>
      </div>
    )
  }

  // 完成不久 + 没错误 → 显示「分类已更新」短暂提示（5 秒）
  if (!s.running && s.lastCompletedAt && !s.lastError) {
    void tick.value
    const sinceDone = Math.floor((Date.now() - s.lastCompletedAt) / 1000)
    if (sinceDone < 5 && !dismissed.value) {
      return (
        <div class="recluster-status-bar recluster-done">
          <div class="rsb-text">
            <div class="rsb-title">✓ 分类已更新</div>
          </div>
          <button class="rsb-close" onClick={() => { dismissed.value = true }} title="收起">×</button>
        </div>
      )
    }
  }

  // 有错误 → 显示
  // v1.1.1 · 删 "已 fallback 到本地算法" 误导文案 (v0.1.3 起禁用静默 fallback, 文案撒谎)
  //   实际行为: AI 失败 → 旧分类保留 + lastError 写进 status, 不会自动用 tfidf
  //   加重试按钮: 智谱 500 多是瞬时故障, 重试通常就好
  // v1.1.4 · 改单行紧凑条——原两行大 banner 把整页布局压下来, 跟 Dashboard 页内错误卡双重轰炸
  //   详细原因 + Settings/Terrain 引导链接由页内错误卡承担, 顶部条只做一句轻提醒
  if (!s.running && s.lastError && !dismissed.value) {
    const friendly = /Failed to fetch|NetworkError/i.test(s.lastError)
      ? '网络请求没通'
      : /HTTP \d+|API error/.test(s.lastError)
        ? 'AI 服务暂时无响应'
        : s.lastError.slice(0, 40)
    return (
      <div class="recluster-status-bar recluster-error recluster-compact">
        <span class="rsb-inline-text">
          ⚠️ AI 分类失败 · {friendly} · 旧分类保留中
        </span>
        <button
          class="rsb-retry"
          onClick={() => {
            chrome.runtime.sendMessage({ type: 'RECLUSTER_NOW' }).catch(() => {})
            dismissed.value = true
          }}
          title="重试"
        >重试</button>
        <button class="rsb-close" onClick={() => { dismissed.value = true }} title="收起">×</button>
      </div>
    )
  }

  return null
}
