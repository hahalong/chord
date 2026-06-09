import { useEffect } from 'preact/hooks'
import { signal } from '@preact/signals'
import type { Item, UserSettings } from '@chord/types'
import { ChromeStorageAdapter } from '../../storage/ChromeStorageAdapter.js'
import { ClusterService, buildEngine, ClusterBucketService } from '@chord/core'
import { ChordIcon } from '../../components/ChordIcon.js'
import { Favicon } from '../../components/Favicon.js'

const adapter = new ChromeStorageAdapter()
const items = signal<Item[]>([])
const settings = signal<UserSettings | null>(null)
const loading = signal(true)
const viewMode = signal<'list' | 'cluster'>('cluster')
const totalAll = signal(0)
const processedThisWeek = signal(0)
// chord_recluster_status.lastError —— sw.ts/Terrain catch 到 AI 失败时写入；持续展示直到下次成功
const reclusterError = signal<string | null>(null)

function loadReclusterStatus() {
  chrome.storage.local.get('chord_recluster_status', (data) => {
    const s = data['chord_recluster_status'] as { lastError?: string } | undefined
    reclusterError.value = s?.lastError ?? null
  })
}

export function Dashboard() {
  useEffect(() => {
    load()
    loadReclusterStatus()
    // 只在 items 变化时 reload；忽略 settings/migration 等其他 storage key 的变化，避免迁移时反复触发 load()
    const offItems = adapter.onChange((key) => { if (key === 'chord_items') load() })
    // 订阅 recluster 状态变化（sw 后台跑成功/失败时）
    const onStorage = (changes: { [k: string]: chrome.storage.StorageChange }) => {
      if (changes['chord_recluster_status']) loadReclusterStatus()
    }
    chrome.storage.onChanged.addListener(onStorage)
    return () => {
      offItems()
      chrome.storage.onChanged.removeListener(onStorage)
    }
  }, [])

  async function load() {
    loading.value = true
    // Dashboard 不再阻塞在 cluster 上——cluster 由 Terrain 页/SW 后台跑
    // 这里只读 items + settings + 渲染节奏；用现成的 item.cluster 字段做分组（可能是旧 cluster 名，但用户能看到内容）
    try {
      const [all, s, allContent] = await Promise.all([
        adapter.getItems({ status: ['pending', 'kept'], type: ['content'], orderBy: 'savedAt', orderDir: 'asc' }),
        adapter.getSettings(),
        adapter.getItems({ type: ['content'] }),
      ])

      items.value = all

      const weekAgo = Date.now() - 7 * 86_400_000
      totalAll.value = allContent.length
      processedThisWeek.value = allContent.filter(i =>
        (i.status === 'used' || i.status === 'released') && (i.processedAt ?? 0) > weekAgo
      ).length

      settings.value = s

      // 如果 cluster 需要刷新，后台 fire-and-forget 跑——不阻塞 Dashboard 渲染
      // 完成后 items 字段会更新，Dashboard 通过 onChange 监听 chord_items 自动 reload
      if (all.length >= 15) {
        ClusterService.shouldRecluster(adapter).then((needs) => {
          if (needs) ClusterService.recluster(adapter, buildEngine(s.aiEngine)).catch((e) => {
            console.warn('[Chord] background recluster failed:', e)
          })
        }).catch(() => {})
      }
    } catch (e) {
      console.error('[Chord] Dashboard.load failed:', e)
    } finally {
      loading.value = false
    }
  }

  const pending = items.value
  const count = pending.length
  const streak = settings.value?.streakCount ?? 0

  // Cluster grouping —— 共享桶契约，Process 用同款逻辑过滤
  const clusterMap = ClusterBucketService.groupByCluster(pending)
  const clusters = Array.from(clusterMap.entries()).sort((a, b) => b[1].length - a[1].length)

  return (
    <div class="waitroom">
      {/* AI 调用失败 banner —— sw.ts 写入 chord_recluster_status.lastError 时显示 */}
      {reclusterError.value && (
        <div style="grid-column:1/-1;background:#FDF0EF;border:1px solid #D9706A;border-radius:8px;padding:12px 14px;color:#9A3A35;margin-bottom:16px">
          <div style="font-weight:600;margin-bottom:4px">⚠️ AI 分类调用失败，主题分组用的是旧数据</div>
          <div style="font-size:13px;line-height:1.6">
            {reclusterError.value}<br/>
            常见原因：<strong>API Key 没配 / Key 失效 / 网络问题</strong>。
            去 <a href="#settings" style="color:#D9706A;font-weight:600">Settings</a> 检查 AI 配置后，
            到 <a href="#terrain" style="color:#D9706A;font-weight:600">Terrain</a> 点「重新生成」重试。
          </div>
        </div>
      )}

      {/* Left: pulse zone */}
      <div class="wr-pulse-zone">
        <div class="wr-ring wr-ring-3" />
        <div class="wr-ring wr-ring-2" />
        <div class="wr-ring wr-ring-1" />
        <div class="wr-core">
          <div class="wr-core-num">{count}</div>
          <div class="wr-core-label">条待回响</div>
        </div>
        <div class="wr-pulse-caption">都还在，不急</div>
      </div>

      {/* Right panel */}
      <div class="wr-right">
        <div class="wr-top">
          <div>
            <div class="wr-title">候响室</div>
            <div class="wr-sub">书房共 {totalAll.value} 条 · 本周处理了 {processedThisWeek.value} 条</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            {streak > 0 && (
              <div class="wr-streak">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="color:var(--rose)"><use href="#icon-sakura"/></svg>
                连续 {streak} 天
              </div>
            )}
            <div class="wr-view-toggle">
              <button
                class={`wr-toggle-btn ${viewMode.value === 'list' ? 'wt-active' : ''}`}
                onClick={() => { viewMode.value = 'list' }}
              >列表</button>
              <button
                class={`wr-toggle-btn ${viewMode.value === 'cluster' ? 'wt-active' : ''}`}
                onClick={() => { viewMode.value = 'cluster' }}
              >聚类</button>
            </div>
          </div>
        </div>

        {/* Queue */}
        <div class="wr-list">
          {loading.value && <div class="wr-loading">加载中…</div>}

          {!loading.value && count === 0 && (
            <div class="wr-empty">
              <p style="display:inline-flex;align-items:center;gap:6px">书房已清空，今天做得很好 <ChordIcon name="sakura" size={14} color="var(--rose)" /></p>
            </div>
          )}

          {!loading.value && count > 0 && viewMode.value === 'list' && (
            <>
              <div class="wr-list-hdr">今日待回响</div>
              {pending.map((item) => (
                <QueueItem key={item.id} item={item} />
              ))}
            </>
          )}

          {!loading.value && count > 0 && viewMode.value === 'cluster' && (
            <>
              <div class="wr-list-hdr">按主题分组</div>
              <div class="cluster-grid">
                {clusters.map(([clusterName, clusterItems]) => (
                  <ClusterGroup key={clusterName} name={clusterName} items={clusterItems} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function QueueItem({ item }: { item: Item }) {
  const age = Date.now() - item.savedAt
  const days = Math.floor(age / 86400000)
  const ageCls = days < 30 ? 'age-fresh' : days < 90 ? 'age-old' : days < 180 ? 'age-stale' : 'age-fossil'
  const ageLabel =
    days < 1   ? '今天'
    : days < 30 ? `${days}天前`
    : days < 365 ? `${Math.floor(days / 30)}月前`
    : `${Math.floor(days / 365)}年前`

  return (
    <a class="wr-item" href={`#process?id=${item.id}`}>
      <div class="wr-item-favicon">
        <Favicon src={item.favicon} size={16} fallbackScale={0.875} />
      </div>
      <div class="wr-item-body">
        <div class="wr-item-title">{item.title}</div>
        <div class="wr-item-meta">{item.cluster ? `${item.cluster} · ` : ''}{item.sourceDomain}</div>
      </div>
      <span class={`wr-age-badge ${ageCls}`} title={`等了 ${days} 天`}>{ageLabel}</span>
    </a>
  )
}

function ClusterGroup({ name, items }: { name: string; items: Item[] }) {
  const clusterParam = encodeURIComponent(name)
  const oldest = Math.max(...items.map(i => Date.now() - i.savedAt))
  const oldestDays = Math.floor(oldest / 86400000)
  const urgencyCls = oldestDays < 30 ? 'age-fresh' : oldestDays < 90 ? 'age-old' : oldestDays < 180 ? 'age-stale' : 'age-fossil'

  return (
    <div class="cluster-group">
      <div class="cluster-group-hdr">
        <div class="cg-left">
          <span class="cg-name">{name}</span>
          <span class={`wr-age-badge ${urgencyCls}`} style="font-size:9px">{items.length} 条</span>
        </div>
        <a class="cg-scan-btn" href={`#process?cluster=${clusterParam}`}>扫一遍 →</a>
      </div>
      {items.slice(0, 3).map((item) => (
        <a key={item.id} class="wr-item cg-item" href={`#process?id=${item.id}`}>
          <div class="wr-item-body">
            <div class="wr-item-title">{item.title}</div>
            <div class="wr-item-meta">{item.sourceDomain}</div>
          </div>
          <AgeLabel savedAt={item.savedAt} />
        </a>
      ))}
      {items.length > 3 && (
        <a class="cg-more" href={`#process?cluster=${clusterParam}`}>还有 {items.length - 3} 条 →</a>
      )}
    </div>
  )
}

function AgeLabel({ savedAt }: { savedAt: number }) {
  const days = Math.floor((Date.now() - savedAt) / 86400000)
  const cls = days < 30 ? 'age-fresh' : days < 90 ? 'age-old' : days < 180 ? 'age-stale' : 'age-fossil'
  const label = days < 1 ? '今天' : days < 30 ? `${days}天` : days < 365 ? `${Math.floor(days/30)}月` : `${Math.floor(days/365)}年`
  return <span class={`wr-age-badge ${cls}`} title={`等了 ${days} 天`}>{label}</span>
}

// 模块级 signal：rhythm_days 缓存。chrome.storage.onChanged 实时刷新。
const rhythmDays = signal<Record<string, number>>({})

function loadRhythmDays() {
  chrome.storage.local.get('rhythm_days', (data) => {
    rhythmDays.value = (data['rhythm_days'] as Record<string, number> | undefined) ?? {}
  })
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function WeekRhythm() {
  useEffect(() => {
    loadRhythmDays()
    const listener = (changes: { [k: string]: chrome.storage.StorageChange }) => {
      if (changes['rhythm_days']) loadRhythmDays()
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  const dayLabels = ['一', '二', '三', '四', '五', '六', '日']
  const now = new Date()
  const todayDow = now.getDay()  // 0=Sun
  const todayIdx = todayDow === 0 ? 6 : todayDow - 1  // Mon=0, Sun=6

  // 计算本周一的日期，再据此推每天的 ISO key
  const monday = new Date(now)
  monday.setDate(now.getDate() - todayIdx)
  const weekKeys = dayLabels.map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return isoDateLocal(d)
  })

  return (
    <div class="wr-week">
      <div class="wr-week-label">本周</div>
      <div class="wr-dots">
        {dayLabels.map((d, i) => {
          const isToday = i === todayIdx
          const count = rhythmDays.value[weekKeys[i]!] ?? 0
          const isDone = !isToday && count > 0
          return (
            <div
              key={d}
              class={`wr-dot ${isToday ? 'wr-dot-today' : isDone ? 'wr-dot-done' : ''}`}
              title={count > 0 ? `处理了 ${count} 条` : '这天没处理'}
            >
              <div class="wr-dot-pip" />
              <div class="wr-dot-day">{d}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
