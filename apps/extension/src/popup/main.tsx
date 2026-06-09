import { render } from 'preact'
import { DailyResuface } from './components/DailyResuface.js'
import { LibraryStatus } from './components/LibraryStatus.js'
import { applySkin } from '../skin.js'

// Apply saved skin immediately (sync read from chrome.storage.local is not available,
// so we do an async read and apply; default g-pink is already in CSS :root)
// storage key 是 chord_settings（ChromeStorageAdapter 约定），不是 settings
chrome.storage.local.get('chord_settings').then((data) => {
  const settings = data['chord_settings'] as { skinId?: string; [k: string]: unknown } | undefined
  const skinId = settings?.skinId ?? 'g-pink'
  applySkin(skinId)

  // 主动出现 Phase 1：写 lastOpenedAt，供 Layer 4 重新召回判定
  chrome.storage.local.set({
    chord_settings: { ...(settings ?? {}), lastOpenedAt: Date.now() },
  })
})

function App() {
  return (
    <div class="popup">
      {/* Top gradient bar */}
      <div class="grad-bar" />

      {/* Header */}
      <header class="popup-header">
        <div class="logo-wrap">
          <svg viewBox="0 0 120 100" fill="none" width="28" height="28">
            <path d="M82 18 Q28 18 28 50 Q28 82 82 82" stroke="#D9706A" stroke-width="5" stroke-linecap="round"/>
            <path d="M82 34 Q44 34 44 50 Q44 66 82 66" stroke="#D9706A" stroke-width="2.5" stroke-linecap="round" opacity="0.4"/>
            <circle cx="87" cy="50" r="4" fill="#D9706A"/>
            <circle cx="99" cy="50" r="2.8" fill="#D9706A" opacity="0.65"/>
            <circle cx="109" cy="50" r="1.8" fill="#D9706A" opacity="0.35"/>
          </svg>
          <div class="logo-text-group">
            <span class="logo-text">回响</span>
            <span class="logo-sub">你的书房</span>
          </div>
        </div>
        <LibraryStatus />
      </header>

      {/* Daily resuface card */}
      <main class="popup-main">
        <DailyResuface />

        {/* 引导入口 —— 紧贴留下来/放手下方，揭示里面有哪些 tab */}
        <a
          class="explore-cta"
          href={chrome.runtime.getURL('src/options/index.html#dashboard')}
          target="_blank"
        >
          <div class="explore-cta-main">
            <span class="explore-cta-title">打开完整书房</span>
            <span class="explore-cta-arrow">→</span>
          </div>
          <div class="explore-cta-sub">候响室 · 隐性自我 · 兴趣地形 · 周回顾</div>
        </a>
      </main>

      <style>{CSS}</style>
    </div>
  )
}

const CSS = `
.popup { display:flex;flex-direction:column;width:320px;min-height:480px;background:var(--bg); }
.grad-bar { height:3px;background:var(--grad); }
.popup-header { display:flex;align-items:center;justify-content:space-between;padding:10px 14px 8px; }
.logo-wrap { display:flex;align-items:center;gap:6px; }
.logo-text-group { display:flex;flex-direction:column;gap:0; }
.logo-text { font-family:'DM Serif Display',serif;font-size:16px;color:var(--text);line-height:1.1; }
.logo-sub { font-size:10px;color:var(--text-lt);letter-spacing:0.03em; }
.popup-main { flex:1;padding:8px 14px 4px; }

/* Lib status */
.lib-status { display:flex;align-items:center;gap:8px; }
.lib-link { display:flex;align-items:baseline;gap:4px;text-decoration:none;color:var(--text); }
.lib-count { font-family:'DM Mono',monospace;font-size:18px;font-weight:700;color:var(--rose); }
.lib-label { font-size:11px;color:var(--text-lt); }
.streak-badge { display:flex;align-items:center;gap:3px;font-size:11px;color:var(--text-md);background:var(--rose-lt);padding:2px 7px;border-radius:20px; }

/* Resuface card */
.resuface-card { position:relative;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px;overflow:hidden; }
.resuface-card.loading,.resuface-card.empty { min-height:180px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px; }
.empty-msg { font-size:13px;color:var(--text-lt);text-align:center; }
.sakura-canvas { position:absolute;inset:0;pointer-events:none;display:none;z-index:10; }
.item-eyebrow { font-size:10px;color:var(--text-lt);letter-spacing:0.04em;margin-bottom:5px; }
.item-meta { display:flex;align-items:center;gap:5px;margin-bottom:6px; }
.item-favicon { width:14px;height:14px;border-radius:3px;object-fit:contain; }
.item-domain { font-size:11px;color:var(--text-lt); }
.item-dot { font-size:11px;color:var(--border2); }
.item-age { font-size:11px;color:var(--text-lt); }
.item-title-link { display:block;text-decoration:none;margin-bottom:6px; }
.item-title-link:hover .item-title { color:var(--rose); }
.item-title { font-size:14px;font-weight:500;line-height:1.4;color:var(--text);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;transition:color 150ms; }
.item-excerpt { font-size:12px;color:var(--text-lt);line-height:1.5;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden; }
.item-question { font-family:'Source Serif 4',serif;font-style:italic;font-size:13px;line-height:1.6;color:var(--text-md);margin-bottom:12px;padding-left:10px;border-left:2px solid var(--rose-md); }
/* 修法 A · question 懒加载时的 skeleton：保留左侧 border 色条，让占位也有"问句要来了"的提示 */
.item-question-skeleton { margin-bottom:12px;padding-left:10px;border-left:2px solid var(--rose-md); }
.item-tags { display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px; }
.item-tag { font-size:10px;color:var(--lav);background:var(--lav-lt);padding:2px 8px;border-radius:10px; }

/* Action buttons */
.action-row { display:flex;gap:7px;margin-top:4px; }
.act-btn { flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:8px 4px;border-radius:9px;border:1.5px solid var(--border2);background:var(--card);color:var(--text-md);font-size:12px;font-family:inherit;cursor:pointer;transition:border-color 200ms,color 200ms,background 200ms; }
.act-btn:hover { border-color:var(--text-md); }
.keep-btn:hover { border-color:var(--lav);color:var(--lav);background:var(--lav-lt); }
.used-btn:hover { border-color:#5AB870;color:#5AB870;background:#F0FAF2; }
.release-btn:hover { border-color:var(--rose);color:var(--rose);background:var(--rose-lt); }
.chord-icon { flex-shrink:0; }

/* Animations */
@keyframes pin-stamp {
  0%   { transform:scale(1) translateY(0); }
  28%  { transform:scale(1.12) translateY(-5px); }
  55%  { transform:scale(0.95) translateY(2px); }
  75%  { transform:scale(1.04) translateY(-1px); }
  100% { transform:scale(1) translateY(0); }
}
@keyframes used-tick {
  0%   { transform:scale(1) rotate(0deg); }
  20%  { transform:scale(1.10) rotate(-5deg); }
  45%  { transform:scale(1.13) rotate(4deg); }
  68%  { transform:scale(1.05) rotate(-1.5deg); }
  100% { transform:scale(1) rotate(0deg); }
}
.anim-keep { animation:pin-stamp 600ms ease forwards;border-color:var(--lav)!important;color:var(--lav)!important;background:var(--lav-lt)!important; }
.anim-used { animation:used-tick 600ms ease forwards;border-color:#5AB870!important;color:#5AB870!important;background:#F0FAF2!important; }

/* Ripple */
.chord-ripple { position:absolute;inset:0;border-radius:inherit;border:1.5px solid #5AB870;opacity:.65;animation:ripple-expand 600ms ease forwards; }
@keyframes ripple-expand { from{transform:scale(1);opacity:.65} to{transform:scale(3.8);opacity:0} }
.act-btn { position:relative;overflow:hidden; }

/* Release confirm */
.release-confirm { display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 0 8px; }
.release-msg { font-size:13px;color:var(--text-md);text-align:center;line-height:1.6; }
.release-next { font-size:11px;color:var(--text-lt); }
.release-next-btn { padding:5px 16px;border-radius:20px;border:1px solid var(--rose-md);background:var(--rose-lt);color:var(--rose);font-size:12px;font-family:inherit;cursor:pointer;transition:background 150ms; }
.release-next-btn:hover { background:var(--rose-md);color:#fff; }

/* Decided hint */
.decided-hint { font-size:11px;color:var(--text-lt);margin-top:8px;text-align:center; }

/* Chips */
.chips-area { margin-top:10px;padding-top:10px;border-top:1px solid var(--border); }
.chips-label { font-size:11px;color:var(--text-lt);margin-bottom:6px; }
.chips-row { display:flex;flex-wrap:wrap;gap:5px; }
.chip { padding:4px 9px;border-radius:20px;border:1px solid var(--border2);background:var(--bg);color:var(--text-md);font-size:11px;font-family:inherit;cursor:pointer;transition:all 150ms; }
.chip:hover { border-color:var(--rose-md);color:var(--rose); }
.chip-active { border-color:var(--rose);background:var(--rose-lt);color:var(--rose); }
.custom-input { margin-top:6px;width:100%;border:1px solid var(--border2);border-radius:7px;padding:6px 9px;font-size:12px;font-family:inherit;color:var(--text);background:var(--bg);outline:none; }
.custom-input:focus { border-color:var(--rose-md); }

/* Skeleton */
.skeleton { background:var(--border);border-radius:4px;animation:shimmer 1.4s infinite; }
@keyframes shimmer { 0%{opacity:.5} 50%{opacity:1} 100%{opacity:.5} }

/* Quick save */
.quick-save { flex:1; }
.save-btn { width:100%;padding:8px;border-radius:9px;border:1.5px solid var(--border2);background:var(--bg);color:var(--text-md);font-size:12px;font-family:inherit;cursor:pointer;transition:all 200ms; }
.save-btn:hover:not(:disabled) { border-color:var(--rose-md);color:var(--rose); }
.save-btn--saved { border-color:#5AB870;color:#5AB870;background:#F0FAF2; }
.save-btn--duplicate,.save-btn--error { border-color:var(--border2);color:var(--text-lt); }
.open-link { font-size:11px;color:var(--text-lt);text-decoration:none;white-space:nowrap; }
.open-link:hover { color:var(--rose); }

/* 引导入口 —— 紧贴 DailyResuface 卡片下方，比保存按钮更显眼，揭示里面有哪些 tab */
.explore-cta { display:block;margin:10px auto 0;padding:9px 14px 8px;background:linear-gradient(135deg,var(--rose-lt) 0%,var(--lav-lt) 100%);border:1px solid var(--rose-md);border-radius:10px;text-decoration:none;transition:all 180ms;position:relative;overflow:hidden;text-align:center; }
.explore-cta::before { content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--grad); }
.explore-cta:hover { transform:translateY(-1px);box-shadow:0 6px 14px rgba(217,112,106,.18);border-color:var(--rose); }
.explore-cta-main { display:inline-flex;align-items:center;justify-content:center;gap:6px;margin-bottom:2px; }
.explore-cta-title { font-family:'DM Serif Display','Noto Sans SC',serif;font-size:13.5px;color:var(--text);font-weight:500;letter-spacing:0.01em; }
.explore-cta-arrow { font-family:'DM Mono',monospace;font-size:13px;color:var(--rose);transition:transform 200ms; }
.explore-cta:hover .explore-cta-arrow { transform:translateX(3px); }
.explore-cta-sub { font-size:10px;color:var(--text-md);letter-spacing:0.02em;font-family:'DM Mono',monospace;line-height:1.4; }

/* ──── ReleaseReasonDialog (v2) ──── */
.rrd-overlay,.bdcd-overlay,.brd-overlay { position:fixed;inset:0;background:rgba(42,21,32,.4);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px; }
.rrd-dialog { background:var(--card);border-radius:14px;padding:18px 18px 14px;max-width:320px;width:100%;box-shadow:0 12px 40px rgba(100,40,60,.25); }
.rrd-eyebrow { font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-lt);margin-bottom:4px; }
.rrd-title { font-family:'DM Serif Display','Noto Sans SC',serif;font-size:17px;color:var(--text);margin:0 0 4px; }
.rrd-subtitle { font-size:11px;color:var(--text-md);margin-bottom:6px;font-style:italic;font-family:'Source Serif 4',serif; }
.rrd-hint { margin-bottom:8px; }
.rrd-grid { display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:8px 0; }
.rrd-chip { background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px 4px;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;font-family:inherit;transition:all 120ms; }
.rrd-chip:hover { border-color:var(--rose-md);background:var(--rose-lt); }
.rrd-chip-active { border-color:var(--rose);background:var(--rose-lt);box-shadow:0 0 0 1px var(--rose-md); }
.rrd-chip-emoji { font-size:18px;line-height:1; }
.rrd-chip-label { font-size:10px;color:var(--text-md);text-align:center;line-height:1.25; }
.rrd-custom-wrap { margin:8px 0; }
.rrd-custom-input { width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:inherit;color:var(--text);background:#fff; }
.rrd-custom-input:focus { outline:none;border-color:var(--rose); }
.rrd-actions { display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid var(--border); }
.rrd-actions-right { display:flex;gap:6px; }
.rrd-skip,.rrd-cancel { background:none;border:none;font-family:inherit;font-size:11px;color:var(--text-lt);cursor:pointer;padding:4px 6px; }
.rrd-skip:hover,.rrd-cancel:hover { color:var(--rose); }
.rrd-confirm { background:var(--rose);color:#fff;border:none;font-family:inherit;font-size:12px;padding:6px 14px;border-radius:100px;cursor:pointer;font-weight:500; }
.rrd-confirm:hover { background:#C45F58; }
.rrd-confirm:disabled { background:var(--border2);cursor:not-allowed; }

/* ──── BookmarkDeleteConfirmDialog ──── */
.bdcd-dialog { background:var(--card);border-radius:14px;padding:20px 20px 16px;max-width:340px;width:100%;box-shadow:0 12px 40px rgba(100,40,60,.25); }
.bdcd-eyebrow { font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-lt);margin-bottom:4px; }
.bdcd-title { font-family:'DM Serif Display','Noto Sans SC',serif;font-size:16px;color:var(--text);margin:0 0 8px; }
.bdcd-body { font-size:12px;color:var(--text-md);line-height:1.55;margin-bottom:14px; }
.bdcd-options { display:flex;flex-direction:column;gap:8px;margin-bottom:8px; }
.bdcd-opt { background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 12px;cursor:pointer;text-align:left;font-family:inherit;transition:all 120ms; }
.bdcd-opt:hover { border-color:var(--rose-md);background:var(--rose-lt); }
.bdcd-opt-strong { border-color:var(--rose);background:linear-gradient(135deg,var(--rose-lt),#fff); }
.bdcd-opt-title { font-size:13px;color:var(--text);font-weight:500;margin-bottom:2px; }
.bdcd-opt-sub { font-size:11px;color:var(--text-lt); }
.bdcd-once { background:none;border:none;font-family:inherit;font-size:10px;color:var(--text-lt);cursor:pointer;padding:4px;margin-top:4px;width:100%;text-align:center; }
.bdcd-once:hover { color:var(--text-md); }
`

render(<App />, document.getElementById('app')!)
