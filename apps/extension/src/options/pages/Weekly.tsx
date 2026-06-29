// 周回顾页面 #weekly
// 把本周的数据集中起来：节奏 + 数字 + 本周触发的 Finding + 待清理 + Journey Recap
// 设计目标：每周一次的「与自己对话」仪式，5 分钟读完就能做下一步动作

import { useEffect } from 'preact/hooks'
import { signal } from '@preact/signals'
import type { Item, Finding, JourneyMoment } from '@chord/types'
import { ChromeStorageAdapter } from '../../storage/ChromeStorageAdapter.js'
import { AnalyticsService, EngagementService } from '@chord/core'
import { ChordIcon } from '../../components/ChordIcon.js'

const adapter = new ChromeStorageAdapter()

const loading = signal(true)
const weekStats = signal<{ saved: number; processed: number; released: number; kept: number; avgEngagement: number } | null>(null)
const overdueItems = signal<Item[]>([])
const findings = signal<Finding[]>([])
const moments = signal<JourneyMoment[]>([])
const rhythmDays = signal<Record<string, number>>({})

const DAY = 86_400_000

function isoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfThisWeek(): number {
  const now = new Date()
  const dow = now.getDay()  // 0=Sun
  const todayIdx = dow === 0 ? 6 : dow - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - todayIdx)
  monday.setHours(0, 0, 0, 0)
  return monday.getTime()
}

export function Weekly() {
  useEffect(() => {
    load()
  }, [])

  async function load() {
    loading.value = true
    const items = await adapter.getItems({ type: ['content'] })
    const visitCounts = await ChromeStorageAdapter.getVisitCounts(
      items.map((i) => ({ id: i.id, url: i.url })),
    )
    const weekStart = startOfThisWeek()
    const now = Date.now()

    // 本周新增
    const savedThisWeek = items.filter((i) => i.savedAt >= weekStart).length
    // 本周处理（按 processedAt 时间窗口）
    const processedThisWeek = items.filter((i) => i.processedAt != null && i.processedAt >= weekStart)
    // P0-4 · v2 二向决策没有 'used'；统计改成 kept
    const released = processedThisWeek.filter((i) => i.status === 'released').length
    const kept = processedThisWeek.filter((i) => i.status === 'kept').length

    // 本周参与度平均分（基于本周处理过的 item）
    const scores = processedThisWeek.map((i) => i.engagementScore ?? EngagementService.scoreItem(i).score)
    const avgEngagement = scores.length > 0 ? scores.reduce((s, n) => s + n, 0) / scores.length : 0

    weekStats.value = {
      saved: savedThisWeek,
      processed: processedThisWeek.length,
      released,
      kept,
      avgEngagement,
    }

    // 超期内容：>180 天 + pending + 仍 type=content
    overdueItems.value = items
      .filter((i) => i.status === 'pending' && now - i.savedAt > 180 * DAY)
      .sort((a, b) => a.savedAt - b.savedAt)  // 最老的在前
      .slice(0, 12)

    // Findings：复用 AnalyticsService（同一份洞察，周回顾里展示）
    findings.value = await AnalyticsService.computeInsights(adapter, visitCounts)

    // Journey moments
    moments.value = (await AnalyticsService.buildJourneyLog(adapter)).slice(0, 6)

    // 节奏 dots
    const data = await chrome.storage.local.get('rhythm_days')
    rhythmDays.value = (data['rhythm_days'] as Record<string, number> | undefined) ?? {}

    loading.value = false
  }

  if (loading.value) return <div class="weekly-loading">生成本周回顾…</div>

  const stats = weekStats.value
  const dayLabels = ['一', '二', '三', '四', '五', '六', '日']
  const now = new Date()
  const todayDow = now.getDay()
  const todayIdx = todayDow === 0 ? 6 : todayDow - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - todayIdx)
  monday.setHours(0, 0, 0, 0)
  const weekKeys = dayLabels.map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return isoDateLocal(d)
  })

  // 周末（周日，todayIdx=6）展示「这周收尾」的语境
  const isWeekend = todayIdx >= 5

  return (
    <div class="weekly-page">
      <div class="weekly-hdr">
        <h1 class="weekly-title">{isWeekend ? '这一周，结一下' : '这一周，到目前为止'}</h1>
        <p class="weekly-sub">每周一次的与自己对话，看看真实在做什么</p>
      </div>

      {/* ── 本周节奏 dots ── */}
      <section class="wk-section">
        <h2 class="wk-section-title">本周节奏</h2>
        <div class="wk-rhythm">
          {dayLabels.map((d, i) => {
            const count = rhythmDays.value[weekKeys[i]!] ?? 0
            const isToday = i === todayIdx
            const isFuture = i > todayIdx
            return (
              <div key={d} class={`wk-day ${isToday ? 'wk-day-today' : ''} ${isFuture ? 'wk-day-future' : ''}`}>
                <div class={`wk-dot ${count > 0 ? 'wk-dot-done' : ''}`} title={count > 0 ? `处理了 ${count} 条` : '这天没处理'}>
                  {count > 0 && <span class="wk-dot-num">{count}</span>}
                </div>
                <span class="wk-day-label">{d}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── 本周数字 ── */}
      {stats && (
        <section class="wk-section">
          <h2 class="wk-section-title">本周做了什么</h2>
          <div class="wk-stats">
            <div class="wk-stat">
              <span class="wk-stat-num">{stats.saved}</span>
              <span class="wk-stat-label">新保存</span>
            </div>
            <div class="wk-stat">
              <span class="wk-stat-num">{stats.processed}</span>
              <span class="wk-stat-label">已处理</span>
            </div>
            <div class="wk-stat">
              <span class="wk-stat-num">{stats.kept}</span>
              <span class="wk-stat-label">留下来</span>
            </div>
            <div class="wk-stat">
              <span class="wk-stat-num">{stats.released}</span>
              <span class="wk-stat-label">放手</span>
            </div>
            <div class="wk-stat">
              <span class="wk-stat-num">{Math.round(stats.avgEngagement)}</span>
              <span class="wk-stat-label">平均参与度</span>
            </div>
          </div>
        </section>
      )}

      {/* ── 本周触发的 Findings（最多 3 条，最相关）── */}
      {findings.value.length > 0 && (
        <section class="wk-section">
          <h2 class="wk-section-title">值得注意的</h2>
          <div class="wk-findings">
            {findings.value.slice(0, 3).map((f, i) => (
              <a key={i} class="wk-finding" href={`#${(f.ctaTarget ?? 'profile').replace(/^#/, '')}`}>
                <div class="wk-finding-eyebrow">{f.eyebrow}</div>
                <p class="wk-finding-claim">{f.claim}</p>
                <p class="wk-finding-evidence">{f.evidence}</p>
              </a>
            ))}
            <a class="wk-findings-more" href="#profile">看全部洞察 →</a>
          </div>
        </section>
      )}

      {/* ── 超期清理 ── */}
      {overdueItems.value.length > 0 && (
        <section class="wk-section">
          <h2 class="wk-section-title">该清理什么</h2>
          <p class="wk-section-sub">这些等了超过 6 个月，没有过任何决定。也许它们该被放手。</p>
          <div class="wk-overdue">
            {overdueItems.value.map((it) => {
              const days = Math.floor((Date.now() - it.savedAt) / DAY)
              const months = Math.floor(days / 30)
              const years = Math.floor(days / 365)
              const ageLabel = years > 0 ? `${years} 年前` : `${months} 个月前`
              return (
                <a key={it.id} class="wk-overdue-item" href={`#process?id=${it.id}`}>
                  <div class="wk-overdue-main">
                    <div class="wk-overdue-title">{it.title}</div>
                    <div class="wk-overdue-meta">{it.sourceDomain} · {ageLabel}</div>
                  </div>
                  <span class="wk-overdue-age">{ageLabel}</span>
                </a>
              )
            })}
            {overdueItems.value.length === 12 && (
              <a class="wk-overdue-more" href="#dashboard?filter=overdue">还有更多 →</a>
            )}
          </div>
        </section>
      )}

      {/* ── Journey Recap moments ── */}
      {moments.value.length > 0 && (
        <section class="wk-section wk-section-journey">
          <h2 class="wk-section-title">这段时间的瞬间</h2>
          <div class="wk-moments">
            {moments.value.map((m, i) => (
              <div key={i} class={`wk-moment wk-moment-${m.type}`}>
                <div class="wk-moment-icon">
                  {/* P0-4 · v2 没 used，sweet moment 用 keep 图标 */}
                  <ChordIcon name={m.type === 'sweet' ? 'keep' : 'sakura'} size={16} color={m.type === 'sweet' ? 'var(--lav)' : 'var(--rose)'} />
                </div>
                <div class="wk-moment-body">
                  <p class="wk-moment-desc">{m.description}</p>
                  {m.userNote && <p class="wk-moment-note">「{m.userNote}」</p>}
                  {m.cluster && <span class="wk-moment-cluster">{m.cluster}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {findings.value.length === 0 && overdueItems.value.length === 0 && moments.value.length === 0 && stats?.processed === 0 && (
        <div class="weekly-empty">
          <p>这周还没有动作。回到候响室处理几条 →</p>
          <a class="weekly-empty-cta" href="#dashboard">进入候响室</a>
        </div>
      )}
    </div>
  )
}
