import { useEffect, useRef } from 'preact/hooks'
import { signal } from '@preact/signals'
import type { Item, ReleaseReason, UserSettings } from '@chord/types'
import { ReleaseReasonDialog } from '../../components/ReleaseReasonDialog.js'
import { BookmarkDeleteConfirmDialog } from '../../components/BookmarkDeleteConfirmDialog.js'
import { Favicon } from '../../components/Favicon.js'

// v2 二向决策：留下来 / 放手（去掉了「用过了」）
type Decision = 'keep' | 'release'

const item = signal<Item | null>(null)
const loading = signal(true)
// 修法 A · aiQuestion 拆懒加载：item 立刻显示，question 单独 skeleton
const questionLoading = signal(false)
const decided = signal<Decision | null>(null)
const showReasonDialog = signal(false)
const showBookmarkConfirm = signal(false)
// 临时保存用户在 ReleaseReasonDialog 选的 reason，等用户在 BookmarkDeleteConfirmDialog 决定后一起 commit
const pendingReason = signal<{ reason?: ReleaseReason; reasonCustom?: string } | null>(null)
const pendingCount = signal(0)
const totalCount = signal(0)

// 注意：storage key 是 'chord_items'（见 ChromeStorageAdapter 的 STORAGE_KEY_ITEMS）
// 老代码读 'items' 一直返回 0——这是 CR-024 修的 bug
function fetchCounts() {
  chrome.storage.local.get(['chord_items'], (data) => {
    const items = (data['chord_items'] as Array<{ status: string; type: string }> | undefined) ?? []
    const content = items.filter((i) => i.type === 'content')
    totalCount.value = content.length
    pendingCount.value = content.filter((i) => i.status === 'pending' || i.status === 'kept').length
  })
}

export function DailyResuface() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    fetchCounts()
    chrome.runtime.sendMessage({ type: 'GET_TODAY_ITEM' }, (res: Item | null) => {
      item.value = res
      loading.value = false
      // 修法 A · 无缓存 aiQuestion → 异步拉，单独 skeleton
      if (res && !res.aiQuestion) {
        questionLoading.value = true
        chrome.runtime.sendMessage(
          { type: 'ENSURE_AI_QUESTION', itemId: res.id },
          (resp: { question: string | null }) => {
            if (item.value && item.value.id === res.id && resp?.question) {
              item.value = { ...item.value, aiQuestion: resp.question }
            }
            questionLoading.value = false
          },
        )
      }
    })
  }, [])

  function handleKeep() {
    if (!item.value || decided.value) return
    decided.value = 'keep'
    animateKeep()
    chrome.runtime.sendMessage({
      type: 'PROCESS_ITEM',
      itemId: item.value.id,
      decision: 'keep',
    })
  }

  function handleReleaseClick() {
    // 点放手按钮 → 弹原因 dialog
    if (!item.value || decided.value) return
    showReasonDialog.value = true
  }

  async function onReasonConfirm(reason: ReleaseReason | undefined, reasonCustom?: string) {
    showReasonDialog.value = false
    pendingReason.value = { reason, reasonCustom }
    // 检查 settings 决定是否问书签
    const data = await chrome.storage.local.get('chord_settings')
    const settings = data['chord_settings'] as UserSettings | undefined
    const pref = settings?.releaseAlsoDeletesBookmark ?? 'ask'
    if (pref === 'ask') {
      showBookmarkConfirm.value = true
    } else {
      // 直接执行
      commitRelease(pref === 'always')
    }
  }

  function onReasonCancel() {
    showReasonDialog.value = false
    pendingReason.value = null
  }

  async function onBookmarkChoice(deleteBookmark: boolean, rememberAsAlways: boolean) {
    showBookmarkConfirm.value = false
    // 写偏好（如果 rememberAsAlways 为 true）
    if (rememberAsAlways) {
      const data = await chrome.storage.local.get('chord_settings')
      const settings = (data['chord_settings'] as UserSettings | undefined) ?? null
      if (settings) {
        await chrome.storage.local.set({
          chord_settings: {
            ...settings,
            releaseAlsoDeletesBookmark: deleteBookmark ? 'always' : 'never',
          },
        })
      }
    }
    commitRelease(deleteBookmark)
  }

  function commitRelease(deleteBookmark: boolean) {
    if (!item.value) return
    decided.value = 'release'
    animateSakura()
    fetchCounts()
    const p = pendingReason.value
    chrome.runtime.sendMessage({
      type: 'PROCESS_ITEM',
      itemId: item.value.id,
      decision: 'release',
      reason: p?.reason,
      reasonCustom: p?.reasonCustom,
      deleteBookmark,
    })
    pendingReason.value = null
  }

  function loadNextItem() {
    decided.value = null
    showReasonDialog.value = false
    showBookmarkConfirm.value = false
    pendingReason.value = null
    loading.value = true
    chrome.runtime.sendMessage({ type: 'GET_TODAY_ITEM' }, (res: Item | null) => {
      item.value = res
      loading.value = false
      fetchCounts()
      // 修法 A · 同 useEffect，下一条也走懒加载 aiQuestion
      if (res && !res.aiQuestion) {
        questionLoading.value = true
        chrome.runtime.sendMessage(
          { type: 'ENSURE_AI_QUESTION', itemId: res.id },
          (resp: { question: string | null }) => {
            if (item.value && item.value.id === res.id && resp?.question) {
              item.value = { ...item.value, aiQuestion: resp.question }
            }
            questionLoading.value = false
          },
        )
      }
    })
  }

  function animateKeep() {
    const btn = document.getElementById('btn-keep')
    if (!btn) return
    btn.classList.add('anim-keep')
    showFloatText(btn, '已保留', 'var(--lav)')
    setTimeout(() => btn.classList.remove('anim-keep'), 700)
  }

  function animateSakura() {
    const canvas = canvasRef.current
    if (!canvas) return
    const btn = document.getElementById('btn-release')
    if (btn) showFloatText(btn, '再见', 'var(--rose)')
    runSakuraCanvas(canvas)
  }

  if (loading.value) {
    return (
      <div class="resuface-card loading">
        <div class="skeleton" style="width:60%;height:12px;margin-bottom:8px" />
        <div class="skeleton" style="width:100%;height:48px" />
      </div>
    )
  }

  if (!item.value) {
    return (
      <div class="resuface-card empty">
        <p class="empty-msg">书房还空着，先保存些内容吧</p>
      </div>
    )
  }

  const it = item.value

  return (
    <div class="resuface-card">
      <canvas ref={canvasRef} class="sakura-canvas" width="320" height="320" />

      {/* Eyebrow */}
      <div class="item-eyebrow">今日回响 · {formatAge(it.savedAt)}</div>

      {/* Source */}
      <div class="item-meta">
        <Favicon src={it.favicon} size={14} class="item-favicon" />
        <span class="item-domain">{it.sourceDomain}</span>
      </div>

      <a class="item-title-link" href={it.url} target="_blank" rel="noopener noreferrer">
        <h2 class="item-title">{it.title}</h2>
      </a>

      {/* 修法 A · question 区单独懒加载：有问句显问句；正在拉显 skeleton；都没就显 excerpt */}
      {it.aiQuestion ? (
        <p class="item-question">{it.aiQuestion}</p>
      ) : questionLoading.value ? (
        <div class="item-question-skeleton">
          <div class="skeleton" style="width:90%;height:10px;margin-bottom:5px" />
          <div class="skeleton" style="width:70%;height:10px" />
        </div>
      ) : (
        it.excerpt && <p class="item-excerpt">{it.excerpt.slice(0, 100)}</p>
      )}

      {/* Cluster tag */}
      {it.cluster && (
        <div class="item-tags">
          <span class="item-tag">{it.cluster}</span>
        </div>
      )}

      {!decided.value && (
        <div class="action-row action-row-2">
          <button id="btn-keep" class="act-btn keep-btn" onClick={handleKeep}>
            <svg class="chord-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" style="color:var(--lav)"><use href="#icon-keep"/></svg>
            留下来
          </button>
          <button id="btn-release" class="act-btn release-btn" onClick={handleReleaseClick}>
            <svg class="chord-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" style="color:var(--rose)"><use href="#icon-sakura"/></svg>
            放手
          </button>
        </div>
      )}

      {decided.value === 'release' && (
        <div class="release-confirm">
          <svg width="44" height="44" viewBox="0 0 16 16" fill="none" style="color:var(--rose)"><use href="#icon-sakura"/></svg>
          <p class="release-msg">放手了。<br/>书房轻了一点点。</p>
          <p class="release-next">还有 {Math.max(0, pendingCount.value - 1)} 条在等你</p>
          <button class="release-next-btn" onClick={loadNextItem}>看下一条 →</button>
        </div>
      )}

      {decided.value === 'keep' && (
        <p class="decided-hint">已保留，下次还会再响起</p>
      )}

      {/* ──── v2 二向决策 dialogs ──── */}
      {showReasonDialog.value && it && (
        <ReleaseReasonDialog
          itemTitle={it.title}
          predictedReason={null /* popup 没有 visitCount 上下文，不预填；Process 页面会预填 */}
          onConfirm={onReasonConfirm}
          onCancel={onReasonCancel}
        />
      )}

      {showBookmarkConfirm.value && (
        <BookmarkDeleteConfirmDialog
          onAlwaysDelete={() => onBookmarkChoice(true, true)}
          onNeverDelete={() => onBookmarkChoice(false, true)}
        />
      )}
    </div>
  )
}

export { pendingCount, totalCount }

// ─── Sakura Canvas ───────────────────────────────────────────

const SAKURA_COLORS = ['#FFB7C5','#FFC8D4','#FFD6E0','#F9A8B8','#FADADD','#FFE4EC','#fff','#F5E0E8']

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

interface Petal {
  x: number; y: number; vx: number; vy: number; alpha: number
  rot: number; rotV: number; size: number; color: string; wobble: number
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

function showFloatText(anchor: HTMLElement, text: string, color: string) {
  const rect = anchor.getBoundingClientRect()
  const el = document.createElement('span')
  el.textContent = text
  el.style.cssText = `
    position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top}px;
    transform:translate(-50%,0);font-size:12px;color:${color};
    font-family:'DM Sans',sans-serif;pointer-events:none;z-index:9999;
    opacity:1;transition:opacity 620ms cubic-bezier(.22,1,.36,1),transform 620ms cubic-bezier(.22,1,.36,1);
  `
  document.body.appendChild(el)
  requestAnimationFrame(() => {
    el.style.opacity = '0'
    el.style.transform = 'translate(-50%,-34px) scale(1.05)'
  })
  setTimeout(() => el.remove(), 640)
}

function formatAge(ts: number) {
  const days = Math.floor((Date.now() - ts) / 86400000)
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  if (days < 365) return `${Math.floor(days / 30)} 个月前`
  return `${Math.floor(days / 365)} 年前`
}
