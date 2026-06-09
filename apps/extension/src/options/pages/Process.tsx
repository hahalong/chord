import { useEffect, useRef } from 'preact/hooks'
import { signal, computed } from '@preact/signals'
import type { Item, ReleaseReason, UserSettings } from '@chord/types'
import { ChromeStorageAdapter } from '../../storage/ChromeStorageAdapter.js'
import { ItemService, ReleaseReasonPredictor, ClusterBucketService, UNCLUSTERED_BUCKET } from '@chord/core'
import { ChordIcon } from '../../components/ChordIcon.js'
import { ReleaseReasonDialog } from '../../components/ReleaseReasonDialog.js'
import { BookmarkDeleteConfirmDialog } from '../../components/BookmarkDeleteConfirmDialog.js'
import { BatchReleaseDialog, type BatchReleaseItem } from '../../components/BatchReleaseDialog.js'
import { Favicon } from '../../components/Favicon.js'

const adapter = new ChromeStorageAdapter()

// v2 二向决策：keep | release（去掉了 used）
type Decision = 'keep' | 'release'

// UNCLUSTERED_BUCKET 从 @chord/core 引入——和 Dashboard / sw 共用同一份契约

const allItems = signal<Item[]>([])
const currentIdx = signal(0)
const loading = signal(true)
const decided = signal<Decision | null>(null)
const deciding = signal<Decision | null>(null)
const showNote = signal(false)
const noteText = signal('')
const related = signal<Item[]>([])
const streakCount = signal(0)
const batchCluster = signal<string | null>(null)
const selectedIds = signal<Set<string>>(new Set())

// v2 dialog state
const showReasonDialog = signal(false)
const showBookmarkConfirm = signal(false)
const showBatchDialog = signal(false)
const pendingReason = signal<{ reason?: ReleaseReason; reasonCustom?: string } | null>(null)
const pendingBatchInputs = signal<{ itemId: string; reason?: ReleaseReason; reasonCustom?: string }[] | null>(null)
const visitCounts = signal<Map<string, number>>(new Map())

const item = computed(() => allItems.value[currentIdx.value] ?? null)

export function Process() {
  const sakuraCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    load()
    const onHashChange = () => { if (window.location.hash.startsWith('#process')) load() }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  async function load() {
    loading.value = true
    const hash = window.location.hash
    const params = new URLSearchParams(hash.split('?')[1] ?? '')
    const id = params.get('id')
    const cluster = params.get('cluster')

    const [all, settings] = await Promise.all([
      adapter.getItems({ status: ['pending', 'kept'], type: ['content'], orderBy: 'savedAt', orderDir: 'asc' }),
      adapter.getSettings(),
    ])

    streakCount.value = settings.streakCount

    const clusterName = cluster ? decodeURIComponent(cluster) : null
    batchCluster.value = clusterName

    // 共享 bucket 契约：UNCLUSTERED_BUCKET 表示"cluster 字段为空"的虚拟桶
    // 详见 packages/core/src/services/ClusterBucketService.ts
    const filtered = clusterName
      ? ClusterBucketService.filterByClusterBucket(all, clusterName)
      : all

    allItems.value = filtered

    if (id) {
      const idx = filtered.findIndex(i => i.id === id)
      currentIdx.value = idx >= 0 ? idx : 0
    } else {
      currentIdx.value = 0
    }

    decided.value = null
    showNote.value = false
    noteText.value = ''
    selectedIds.value = new Set()

    // 异步取 visitCounts 用于预填 reason
    ChromeStorageAdapter.getVisitCounts(filtered.map(i => ({ id: i.id, url: i.url })))
      .then(vc => { visitCounts.value = vc })
      .catch(() => { visitCounts.value = new Map() })

    loading.value = false
    loadRelated(filtered[currentIdx.value])
  }

  function loadRelated(it: Item | undefined) {
    if (!it?.cluster) { related.value = []; return }
    adapter.getItems({ status: ['pending', 'kept'], type: ['content'] }).then(all => {
      related.value = all.filter(i => i.id !== it.id && i.cluster === it.cluster).slice(0, 3)
    })
  }

  function goTo(idx: number) {
    if (idx < 0 || idx >= allItems.value.length) return
    currentIdx.value = idx
    decided.value = null
    showNote.value = false
    noteText.value = ''
    loadRelated(allItems.value[idx])
    const id = allItems.value[idx]?.id
    if (id) {
      const clusterSuffix = batchCluster.value ? `&cluster=${encodeURIComponent(batchCluster.value)}` : ''
      history.replaceState(null, '', `#process?id=${id}${clusterSuffix}`)
    }
  }

  function triggerFloatText(text: string, el: HTMLButtonElement) {
    const rect = el.getBoundingClientRect()
    const div = document.createElement('div')
    div.className = 'proc-float-text'
    div.textContent = text
    div.style.left = `${rect.left + rect.width / 2}px`
    div.style.top = `${rect.top - 4}px`
    document.body.appendChild(div)
    setTimeout(() => div.remove(), 700)
  }

  async function handleKeep(btnEl?: HTMLButtonElement) {
    if (!item.value || decided.value || deciding.value) return
    deciding.value = 'keep'
    if (btnEl) {
      btnEl.classList.add('anim-keep')
      triggerFloatText('已保留', btnEl)
    }
    setTimeout(() => { decided.value = 'keep'; deciding.value = null }, 380)

    const settings = await adapter.getSettings()
    await ItemService.processItem(adapter, item.value.id, 'keep', {
      userId: settings.userId,
      deviceId: settings.deviceId,
    })
  }

  function handleReleaseClick() {
    if (!item.value || decided.value || deciding.value) return
    showReasonDialog.value = true
  }

  async function onReasonConfirm(reason: ReleaseReason | undefined, reasonCustom?: string) {
    showReasonDialog.value = false
    pendingReason.value = { reason, reasonCustom }
    // 检查 settings
    const settings = await adapter.getSettings()
    const pref = settings.releaseAlsoDeletesBookmark ?? 'ask'
    if (pref === 'ask') {
      showBookmarkConfirm.value = true
    } else {
      await commitRelease(pref === 'always')
    }
  }

  function onReasonCancel() {
    showReasonDialog.value = false
    pendingReason.value = null
  }

  async function onBookmarkChoice(deleteBookmark: boolean, rememberAsAlways: boolean) {
    showBookmarkConfirm.value = false
    if (rememberAsAlways) {
      await adapter.putSettings({
        releaseAlsoDeletesBookmark: deleteBookmark ? 'always' : 'never',
      })
    }
    await commitRelease(deleteBookmark)
  }

  async function commitRelease(deleteBookmark: boolean) {
    if (!item.value) return
    const btnEl = document.querySelector('.proc-release') as HTMLButtonElement | null
    if (btnEl) triggerFloatText('已放手', btnEl)
    if (sakuraCanvasRef.current) runSakuraCanvas(sakuraCanvasRef.current)

    setTimeout(() => { decided.value = 'release'; deciding.value = null }, 380)

    const settings = await adapter.getSettings()
    const p = pendingReason.value
    await ItemService.processItem(adapter, item.value.id, 'release', {
      userId: settings.userId,
      deviceId: settings.deviceId,
      reason: p?.reason,
      reasonCustom: p?.reasonCustom,
    })

    // 如果选了删 Chrome 书签，通过 sw 删（sw 有 chrome.bookmarks 权限上下文）
    if (deleteBookmark) {
      chrome.runtime.sendMessage({
        type: 'DELETE_BOOKMARK',
        url: item.value.url,
      })
    }

    pendingReason.value = null
  }

  async function saveNote() {
    if (!item.value || !noteText.value.trim()) return
    const settings = await adapter.getSettings()
    await ItemService.addPrivateNote(adapter, item.value.id, noteText.value.trim(), {
      userId: settings.userId,
      deviceId: settings.deviceId,
    })
    showNote.value = false
  }

  function goNext() {
    const remaining = allItems.value.filter(i => i.id !== item.value?.id)
    allItems.value = remaining
    currentIdx.value = Math.min(currentIdx.value, remaining.length - 1)
    decided.value = null
    showNote.value = false
    noteText.value = ''
    if (remaining.length > 0) loadRelated(remaining[currentIdx.value])
  }

  // ── 批量决策 ──
  async function batchKeep() {
    const ids = Array.from(selectedIds.value)
    if (ids.length === 0) return
    const settings = await adapter.getSettings()
    await Promise.all(ids.map(id =>
      ItemService.processItem(adapter, id, 'keep', { userId: settings.userId, deviceId: settings.deviceId })
    ))
    allItems.value = allItems.value.filter(i => !ids.includes(i.id))
    selectedIds.value = new Set()
  }

  function batchReleaseClick() {
    const ids = Array.from(selectedIds.value)
    if (ids.length === 0) return
    showBatchDialog.value = true
  }

  async function onBatchConfirm(inputs: { itemId: string; reason?: ReleaseReason; reasonCustom?: string }[]) {
    showBatchDialog.value = false
    pendingBatchInputs.value = inputs
    // 询问是否删 Chrome 书签（按 settings 决定）
    const settings = await adapter.getSettings()
    const pref = settings.releaseAlsoDeletesBookmark ?? 'ask'
    if (pref === 'ask') {
      showBookmarkConfirm.value = true
    } else {
      await commitBatchRelease(pref === 'always')
    }
  }

  function onBatchCancel() {
    showBatchDialog.value = false
    pendingBatchInputs.value = null
  }

  async function commitBatchRelease(deleteBookmarks: boolean) {
    if (!pendingBatchInputs.value) return
    const inputs = pendingBatchInputs.value
    const settings = await adapter.getSettings()
    const result = await ItemService.batchRelease(adapter, inputs, {
      userId: settings.userId,
      deviceId: settings.deviceId,
    })
    // 删 Chrome 书签
    if (deleteBookmarks) {
      const urls = inputs
        .map(input => allItems.value.find(i => i.id === input.itemId)?.url)
        .filter((u): u is string => !!u)
      if (urls.length > 0) {
        chrome.runtime.sendMessage({ type: 'DELETE_BOOKMARKS_BATCH', urls })
      }
    }
    allItems.value = allItems.value.filter(i => !result.itemIds.includes(i.id))
    selectedIds.value = new Set()
    pendingBatchInputs.value = null
  }

  // ── 批量放手 → 书签确认 flow ──
  async function onBatchBookmarkChoice(deleteBookmarks: boolean, rememberAsAlways: boolean) {
    showBookmarkConfirm.value = false
    if (rememberAsAlways) {
      await adapter.putSettings({
        releaseAlsoDeletesBookmark: deleteBookmarks ? 'always' : 'never',
      })
    }
    if (pendingBatchInputs.value) {
      await commitBatchRelease(deleteBookmarks)
    } else {
      await commitRelease(deleteBookmarks)
    }
  }

  if (loading.value) return <div class="proc-loading">加载中…</div>

  // ── Batch mode: multi-select list ──────────────────────────────
  if (batchCluster.value !== null) {
    const cluster = batchCluster.value
    const total = allItems.value.length
    const selectedCount = selectedIds.value.size
    const allSelected = selectedCount === total && total > 0

    function toggleItem(id: string) {
      const next = new Set(selectedIds.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      selectedIds.value = next
    }

    function toggleAll() {
      if (selectedIds.value.size === total) selectedIds.value = new Set()
      else selectedIds.value = new Set(allItems.value.map(i => i.id))
    }

    if (total === 0) {
      return (
        <div class="proc-empty">
          <div style="margin-bottom:12px"><ChordIcon name="sakura" size={48} color="var(--rose-md)" /></div>
          <p style="font-size:16px;color:var(--text-md);margin-bottom:16px">「{cluster}」这一批处理完了</p>
          <a href="#dashboard" class="proc-back">← 返回候响室</a>
        </div>
      )
    }

    return (
      <div class="batch-view">
        <div class="batch-page-hdr">
          <div>
            <h2 class="batch-page-title">批量处理</h2>
            <p class="batch-page-sub">「{cluster}」· {total} 条待处理</p>
          </div>
          <a href="#dashboard" class="batch-exit-btn">退出 ×</a>
        </div>

        <div class="batch-card">
          <div class="batch-select-bar">
            <div class="batch-check-all" onClick={toggleAll}>
              <span class="batch-cb">
                {allSelected
                  ? <svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#D9706A"/><path d="M4 8L7 11L12 5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  : selectedCount > 0
                    ? <svg width="16" height="16" viewBox="0 0 16 16"><rect x="0.75" y="0.75" width="14.5" height="14.5" rx="3.25" fill="#D9706A" stroke="#D9706A" stroke-width="1.5"/><path d="M4.5 8H11.5" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 16 16"><rect x="0.75" y="0.75" width="14.5" height="14.5" rx="3.25" stroke="#E8D8D6" stroke-width="1.5" fill="none"/></svg>
                }
              </span>
              <span class="batch-check-lbl">
                {selectedCount > 0 ? `已选 ${selectedCount} / ${total} 条` : '全选'}
              </span>
            </div>
            {selectedCount === 0 && (
              <span class="batch-hint">勾选条目后统一操作 · 点击标题查看详情</span>
            )}
          </div>

          <div class="batch-list">
            {allItems.value.map((it) => {
              const days = Math.floor((Date.now() - it.savedAt) / 86400000)
              const ageCls = days < 30 ? 'age-fresh' : days < 90 ? 'age-old' : days < 180 ? 'age-stale' : 'age-fossil'
              const ageLabel = days < 1 ? '今天' : days < 30 ? `${days}天前` : days < 365 ? `${Math.floor(days / 30)}月前` : `${Math.floor(days / 365)}年前`
              const sel = selectedIds.value.has(it.id)
              return (
                <div key={it.id} class={`batch-item ${sel ? 'batch-item-sel' : ''}`}>
                  <span class="batch-item-cb" onClick={() => toggleItem(it.id)}>
                    {sel
                      ? <svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#D9706A"/><path d="M4 8L7 11L12 5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 16 16"><rect x="0.75" y="0.75" width="14.5" height="14.5" rx="3.25" stroke="#E8D8D6" stroke-width="1.5" fill="none"/></svg>
                    }
                  </span>
                  <a class="batch-item-link" href={it.url} target="_blank" rel="noopener noreferrer">
                    <span class="batch-item-fav">
                      <Favicon src={it.favicon} size={14} />
                    </span>
                    <div class="batch-item-body">
                      <div class="batch-item-title">{it.title}</div>
                      <div class="batch-item-meta">{it.cluster ? `${it.cluster} · ` : ''}{it.sourceDomain}</div>
                    </div>
                    <span class={`wr-age-badge ${ageCls}`}>{ageLabel}</span>
                  </a>
                </div>
              )
            })}
          </div>

          {/* Sticky action bar — v2 只有两个按钮 */}
          {selectedCount > 0 && (
            <div class="batch-action-bar">
              <span class="batch-action-lbl">对 {selectedCount} 条执行：</span>
              <div class="batch-action-btns">
                <button class="bat-btn bat-keep" onClick={batchKeep}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="color:var(--lav)"><use href="#icon-keep"/></svg>
                  留下来
                </button>
                <button class="bat-btn bat-release" onClick={batchReleaseClick}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="color:var(--rose)"><use href="#icon-sakura"/></svg>
                  放手…
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── 批量放手 dialog ── */}
        {showBatchDialog.value && (
          <BatchReleaseDialog
            items={Array.from(selectedIds.value).map((id) => {
              const it = allItems.value.find(i => i.id === id)!
              // 同 cluster 已被释放过的次数（粗略：本批已选 ids 不算，只看 storage 历史）
              return {
                item: it,
                predictedReason: ReleaseReasonPredictor.predictReason(it, {
                  visitCount: visitCounts.value.get(it.id) ?? 0,
                }),
              } as BatchReleaseItem
            })}
            onConfirm={onBatchConfirm}
            onCancel={onBatchCancel}
          />
        )}

        {showBookmarkConfirm.value && (
          <BookmarkDeleteConfirmDialog
            onAlwaysDelete={() => onBatchBookmarkChoice(true, true)}
            onNeverDelete={() => onBatchBookmarkChoice(false, true)}
          />
        )}
      </div>
    )
  }

  // ── Single-item mode ────────────────────────────────────────────
  if (!item.value) {
    return (
      <div class="proc-empty">
        <div style="margin-bottom:12px"><ChordIcon name="sakura" size={48} color="var(--rose-md)" /></div>
        <p style="font-size:16px;color:var(--text-md);margin-bottom:16px">今天已经处理完了，很好！</p>
        <a href="#dashboard" class="proc-back">← 返回候响室</a>
      </div>
    )
  }

  const it = item.value
  const total = allItems.value.length
  const days = Math.floor((Date.now() - it.savedAt) / 86400000)
  const ageDesc =
    days < 1 ? '今天'
    : days < 30 ? `${days} 天前`
    : days < 365 ? `${Math.floor(days / 30)} 个月前`
    : `${Math.floor(days / 365)} 年前`

  const defaultQ = `你保存这篇文章已经 ${ageDesc}——它现在对你还有意义吗？`
  const predictedReason = ReleaseReasonPredictor.predictReason(it, {
    visitCount: visitCounts.value.get(it.id) ?? 0,
  })

  return (
    <div class="process-view">
      <div class="process-card" style="position:relative">
        <canvas
          ref={sakuraCanvasRef}
          width="500"
          height="500"
          style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;display:none;z-index:10"
        />
        <div class="process-bar" />

        <div class="process-hdr">
          <div class="process-badge">
            {streakCount.value > 0 ? `今日回响 · 第 ${streakCount.value} 天` : '今日回响'}
          </div>
          <div class="process-nav">
            <span>{total} 条中第 {currentIdx.value + 1} 条</span>
            <button onClick={() => goTo(currentIdx.value - 1)} disabled={currentIdx.value === 0}>←</button>
            <button onClick={() => goTo(currentIdx.value + 1)} disabled={currentIdx.value >= total - 1}>→</button>
          </div>
        </div>

        <div class="process-content">
          <div class="process-source">
            <div class="process-source-icon">
              <Favicon src={it.favicon} size={14} />
            </div>
            <span class="process-source-text">{it.sourceDomain} · {ageDesc}保存</span>
          </div>

          <a class="process-title-link" href={it.url} target="_blank" rel="noopener noreferrer">
            <h1 class="process-title">{it.title} <span class="process-title-ext">↗</span></h1>
          </a>

          {it.excerpt && (
            <p class="process-excerpt">{it.excerpt.slice(0, 160)}</p>
          )}

          {it.userNote && (
            <div class="process-note">「{it.userNote}」</div>
          )}

          <div class="process-question">
            <div class="process-q-eyebrow">回响在问你</div>
            <div class="process-q-text">{it.aiQuestion ?? defaultQ}</div>
          </div>

          {!decided.value ? (
            <div class="process-actions process-actions-2">
              <button class="proc-act proc-keep" onClick={(e) => handleKeep(e.currentTarget as HTMLButtonElement)}>
                <svg class="proc-act-icon" width="20" height="20" viewBox="0 0 16 16" fill="none" style="color:var(--lav)">
                  <use href="#icon-keep" />
                </svg>
                留下来<br /><span class="proc-act-sub">还想留着</span>
              </button>
              <button class="proc-act proc-release" onClick={handleReleaseClick}>
                <svg class="proc-act-icon" width="20" height="20" viewBox="0 0 16 16" fill="none" style="color:var(--rose)">
                  <use href="#icon-sakura" />
                </svg>
                放手<br /><span class="proc-act-sub">不再需要</span>
              </button>
            </div>
          ) : (
            <div class="proc-decided-area">
              <p class="proc-decided-label">
                {decided.value === 'keep' && (
                  <><ChordIcon name="keep" size={14} color="var(--lav)" /><span>已保留，下次还会再响起</span></>
                )}
                {decided.value === 'release' && (
                  <><ChordIcon name="sakura" size={14} color="var(--rose)" /><span>已放手，书房轻了一点</span></>
                )}
              </p>

              {!showNote.value ? (
                <button class="proc-note-btn" onClick={() => { showNote.value = true }}>
                  ＋ 写一句私人注释
                </button>
              ) : (
                <div class="proc-note-area">
                  <textarea
                    class="proc-note-input"
                    placeholder="只有你自己能看到"
                    rows={2}
                    value={noteText.value}
                    onInput={(e) => { noteText.value = (e.target as HTMLTextAreaElement).value }}
                  />
                  <div class="proc-note-btns">
                    <button class="proc-note-save" onClick={saveNote}>保存</button>
                    <button class="proc-note-cancel" onClick={() => { showNote.value = false }}>取消</button>
                  </div>
                </div>
              )}

              {total > 0 && (
                <button class="proc-next-btn" onClick={goNext}>下一条 →</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <aside class="process-side">
        <div class="side-card">
          <div class="side-card-title">内容信息</div>
          <div class="context-row">
            <span class="context-key">保存时间</span>
            <span class="context-val">{new Date(it.savedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
          <div class="context-row">
            <span class="context-key">来源</span>
            <span class="context-val">{it.sourceDomain}</span>
          </div>
          {it.cluster && (
            <div class="context-row">
              <span class="context-key">主题聚类</span>
              <span class="context-val" style="color:var(--lav)">{it.cluster}</span>
            </div>
          )}
          <div class="context-row">
            <span class="context-key">回响次数</span>
            <span class="context-val">第 {it.wakeCount + 1} 次</span>
          </div>
        </div>

        {related.value.length > 0 && (
          <div class="side-card">
            <div class="side-card-title">同主题内容</div>
            {related.value.map(r => (
              <div key={r.id} class="related-item">
                <div class="related-dot" />
                <div class="related-text">{r.title}</div>
              </div>
            ))}
          </div>
        )}

        {it.cluster && (
          <div class="side-card side-insight">
            <div class="side-card-title">洞察提示</div>
            <p class="side-insight-text">
              你在「{it.cluster}」下收藏了多篇内容。今天处理这一条，就是在厘清哪些是真实兴趣。
            </p>
          </div>
        )}
      </aside>

      {/* ── v2 二向决策 dialogs ── */}
      {showReasonDialog.value && it && (
        <ReleaseReasonDialog
          itemTitle={it.title}
          predictedReason={predictedReason}
          onConfirm={onReasonConfirm}
          onCancel={onReasonCancel}
        />
      )}

      {showBookmarkConfirm.value && !pendingBatchInputs.value && (
        <BookmarkDeleteConfirmDialog
          onAlwaysDelete={() => onBookmarkChoice(true, true)}
          onNeverDelete={() => onBookmarkChoice(false, true)}
        />
      )}
    </div>
  )
}

// ─── Sakura Canvas ────────────────────────────────────────────────────────────

const SAKURA_COLORS = ['#FFB7C5','#FFC8D4','#FFD6E0','#F9A8B8','#FADADD','#FFE4EC','#fff','#F5E0E8']

interface Petal {
  x: number; y: number; vx: number; vy: number; alpha: number
  rot: number; rotV: number; size: number; color: string; wobble: number
}

function runSakuraCanvas(canvas: HTMLCanvasElement) {
  canvas.style.display = 'block'
  const ctx = canvas.getContext('2d')!
  const cx = canvas.width / 2, cy = canvas.height / 2
  const petals: Petal[] = []

  for (let i = 0; i < 45; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 1.5 + Math.random() * 3
    petals.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      alpha: 1,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.15,
      size: 4 + Math.random() * 5,
      color: SAKURA_COLORS[Math.floor(Math.random() * SAKURA_COLORS.length)] ?? '#FFB7C5',
      wobble: Math.random() * Math.PI * 2,
    })
  }

  let frame = 0
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const p of petals) {
      p.x += p.vx + Math.sin(p.wobble) * 0.4
      p.y += p.vy
      p.vy += 0.12
      p.wobble += 0.07
      p.rot += p.rotV
      p.alpha -= 0.012
      if (p.alpha <= 0) continue
      ctx.save()
      ctx.globalAlpha = p.alpha
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      drawPetal(ctx, p.size, p.color)
      ctx.restore()
    }
    frame++
    if (frame < 80) requestAnimationFrame(tick)
    else canvas.style.display = 'none'
  }
  requestAnimationFrame(tick)
}

function drawPetal(ctx: CanvasRenderingContext2D, r: number, color: string) {
  ctx.fillStyle = color
  for (let i = 0; i < 5; i++) {
    ctx.save()
    ctx.rotate((i / 5) * Math.PI * 2)
    ctx.beginPath()
    ctx.ellipse(0, -r * 0.6, r * 0.35, r * 0.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = '#FFF9A0'
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2)
  ctx.fill()
}

