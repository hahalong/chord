export const SHARED_CSS = `
/* Layout */
/* CR-031：用 --foot-bg 而非 --bg。--bg 在所有 skin 里都是接近白的浅色，皮肤切换看不出来；
   --foot-bg 是带饱和度的"皮肤代表色"，切换时整体视觉对比明显 */
.options-layout { display:flex;flex-direction:column;min-height:100vh;background:var(--foot-bg); }

/* ─── 新版本可用横幅（CR-025）─── */
.new-version-banner { display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 24px;background:linear-gradient(90deg, #FFF7E6, #FFE9B3);border-bottom:1px solid #F5C453;animation:nvb-slide-in 300ms ease; }
.nvb-text { flex:1;font-size:13px;color:#7A5C20;line-height:1.5; }
.nvb-text strong { color:#5C4310; }
.nvb-actions { display:flex;align-items:center;gap:8px;flex-shrink:0; }
.nvb-refresh { padding:6px 14px;border-radius:8px;border:none;background:#D9706A;color:#fff;font-size:12px;font-family:inherit;cursor:pointer;font-weight:500; }
.nvb-refresh:hover { background:#C4615C; }
.nvb-close { background:none;border:none;font-size:18px;line-height:1;color:#7A5C20;cursor:pointer;padding:4px 8px; }
.nvb-close:hover { color:#5C4310; }
@keyframes nvb-slide-in { from { opacity:0; transform:translateY(-100%); } to { opacity:1; transform:translateY(0); } }

/* ─── 全局后台 recluster 进度条（贴在顶栏上方）─── */
.recluster-status-bar { position:relative;display:flex;align-items:center;gap:14px;padding:10px 24px 12px;background:linear-gradient(90deg,var(--rose-lt),var(--lav-lt));border-bottom:1px solid var(--rose-md);animation:rsb-slide-in 300ms ease; }
.recluster-running { background:linear-gradient(90deg,#FFFCFA,var(--rose-lt),var(--lav-lt),#FFFCFA);background-size:200% 100%;animation:rsb-slide-in 300ms ease, rsb-shimmer 3s ease-in-out infinite; }
.recluster-done { background:linear-gradient(90deg,#F0FAF2,#E8F5E9);border-bottom-color:#B8EDCA; }
.recluster-error { background:linear-gradient(90deg,#FDF0EF,#FAE0DE);border-bottom-color:var(--rose); }
.rsb-icon { display:flex;gap:4px;flex-shrink:0;color:var(--rose); }
.rsb-dot { width:5px;height:5px;border-radius:50%;background:currentColor;animation:rsb-pulse 1.2s ease-in-out infinite; }
.rsb-dot:nth-child(2) { animation-delay:0.2s; }
.rsb-dot:nth-child(3) { animation-delay:0.4s; }
.rsb-text { flex:1;min-width:0; }
.rsb-title { font-size:13px;font-weight:500;color:var(--text); }
.rsb-meta { font-size:11px;color:var(--text-md);margin-top:2px; }
.rsb-hint { color:var(--text-lt); }
.rsb-progress { position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--border);overflow:hidden; }
.rsb-progress-fill { height:100%;background:linear-gradient(90deg,var(--rose),var(--lav));transition:width 400ms ease; }
.rsb-close { background:none;border:none;font-size:20px;line-height:1;color:var(--text-lt);cursor:pointer;padding:4px 10px;flex-shrink:0; }
.rsb-close:hover { color:var(--text); }
@keyframes rsb-slide-in { from { opacity:0; transform:translateY(-100%); } to { opacity:1; transform:translateY(0); } }
@keyframes rsb-shimmer { 0%,100% { background-position:0% 50%; } 50% { background-position:100% 50%; } }
@keyframes rsb-pulse { 0%,100% { opacity:0.3 } 50% { opacity:1 } }
.opt-topbar { height:52px;border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 32px;gap:32px;background:var(--card); }
.opt-topbar::before { content:'';display:block;position:absolute;top:0;left:0;right:0;height:3px;background:var(--grad); }
.opt-topbar { position:relative; }
.opt-logo { display:flex;align-items:center;gap:8px; }
.opt-logo-text { font-family:'DM Serif Display',serif;font-size:18px;color:var(--text); }
.opt-nav { display:flex;gap:4px; }
.opt-nav-item { padding:6px 14px;border-radius:8px;text-decoration:none;font-size:14px;color:var(--text-md);transition:all 150ms; }
.opt-nav-item:hover { background:var(--rose-lt);color:var(--rose); }
.opt-nav-active { background:var(--rose-lt);color:var(--rose); }
.opt-content { flex:1;width:100%;padding:18px 32px 28px; }

/* ── Dashboard / Waitroom ── */
.waitroom { display:flex;align-items:flex-start;filter:drop-shadow(0 8px 40px rgba(100,40,60,.1)); }
.wr-pulse-zone { width:220px;flex-shrink:0;background:var(--foot-bg);border:1px solid var(--border);border-right:1px solid #EDD5D3;border-radius:22px 0 0 22px;display:flex;align-items:center;justify-content:center;position:sticky;top:20px;height:calc(100vh - 40px);align-self:flex-start; }
@keyframes wr-pulse { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:var(--op)} 50%{transform:translate(-50%,-50%) scale(1.07);opacity:calc(var(--op)*.5)} }
.wr-ring { position:absolute;top:50%;left:50%;border-radius:50%;border:1px solid var(--rose);animation:wr-pulse 3s ease-in-out infinite; }
.wr-ring-1 { width:90px;height:90px;--op:.55;animation-delay:0s; }
.wr-ring-2 { width:132px;height:132px;--op:.3;animation-delay:.6s; }
.wr-ring-3 { width:174px;height:174px;--op:.15;animation-delay:1.2s; }
.wr-core { position:relative;z-index:2;width:74px;height:74px;background:#fff;border-radius:50%;border:1.5px solid #ECC8C6;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(217,112,106,.18); }
.wr-core-num { font-family:'DM Serif Display',serif;font-size:28px;color:var(--rose);line-height:1; }
.wr-core-label { font-size:9px;color:var(--text-lt);margin-top:3px;letter-spacing:.04em; }
.wr-pulse-caption { position:absolute;top:calc(50% + 110px);left:50%;transform:translateX(-50%);font-family:'Source Serif 4',serif;font-style:italic;font-size:12px;color:var(--text-lt);white-space:nowrap; }
.wr-right { flex:1;display:flex;flex-direction:column;overflow:hidden;background:var(--card);border:1px solid var(--border);border-left:none;border-radius:0 22px 22px 0;min-height:calc(100vh - 40px); }
.wr-top { padding:20px 24px 14px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between; }
.wr-title { font-family:'DM Serif Display',serif;font-size:19px;font-weight:400;color:var(--text);margin-bottom:3px; }
.wr-sub { font-size:11px;color:var(--text-lt); }
.wr-streak { display:flex;align-items:center;gap:5px;background:var(--rose-lt);border:1px solid #ECC8C6;padding:4px 12px;border-radius:100px;font-size:10px;font-weight:600;color:var(--rose);white-space:nowrap; }
.wr-view-toggle { display:flex;border:1px solid var(--border2);border-radius:8px;overflow:hidden; }
.wr-toggle-btn { padding:4px 10px;font-size:11px;font-family:inherit;border:none;background:transparent;color:var(--text-lt);cursor:pointer;transition:all 120ms; }
.wr-toggle-btn:hover { color:var(--rose); }
.wt-active { background:var(--rose-lt);color:var(--rose); }
.wr-week { padding:12px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0; }
.wr-week-label { font-size:10px;color:var(--text-lt);margin-right:12px;white-space:nowrap; }
.wr-dots { display:flex;gap:6px;align-items:center; }
.wr-dot { width:26px;height:26px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:1.5px solid var(--border);background:var(--bg); }
.wr-dot-done { background:var(--rose-lt);border-color:#ECC8C6; }
.wr-dot-done .wr-dot-pip { background:var(--rose); }
.wr-dot-today { background:var(--rose);border-color:var(--rose); }
.wr-dot-today .wr-dot-pip { background:#fff; }
.wr-dot-today .wr-dot-day { color:#fff; }
.wr-dot-day { font-size:7px;color:var(--text-lt);line-height:1; }
.wr-dot-pip { width:5px;height:5px;border-radius:50%;background:var(--border2); }
.wr-list { flex:1; }
.wr-list-hdr { padding:10px 24px 6px;font-size:10px;font-weight:600;color:var(--text-lt);letter-spacing:.09em;text-transform:uppercase; }
.wr-item { display:flex;align-items:center;gap:12px;padding:10px 18px 10px 24px;border-top:1px solid var(--border);cursor:pointer;transition:background .15s;text-decoration:none;color:var(--text); }
.wr-item:hover { background:var(--rose-lt); }
.wr-item-favicon { width:16px;height:16px;flex-shrink:0;display:flex;align-items:center;justify-content:center; }
.wr-item-body { flex:1;min-width:0; }
.wr-item-title { font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px; }
.wr-item-meta { font-size:10px;color:var(--text-lt); }
.wr-age-badge { font-size:9px;font-family:'DM Mono',monospace;padding:3px 8px;border-radius:6px;flex-shrink:0;font-weight:500; }
.age-fresh { background:#EDFAF2;color:#3A8040; }
.age-old   { background:var(--lav-lt);color:var(--lav); }
.age-stale { background:#FFF3E0;color:#C8840A; }
.age-fossil{ background:var(--rose-lt);color:var(--rose); }
.wr-loading,.wr-empty { padding:32px 24px;text-align:center;font-size:13px;color:var(--text-lt); }
/* 主题网格（响应式，min 260px auto-fit） */
.cluster-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;padding:10px 24px 14px; }

/* 每个主题一张卡 */
.cluster-group { display:flex;flex-direction:column;background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;transition:box-shadow 200ms,transform 200ms;min-height:220px; }
.cluster-group:hover { box-shadow:0 4px 16px rgba(217,112,106,0.10);transform:translateY(-2px); }

.cluster-group-hdr { display:flex;align-items:center;justify-content:space-between;padding:12px 14px 10px;background:var(--rose-lt);border-bottom:1px solid var(--border); }
.cg-left { display:flex;align-items:center;gap:8px;min-width:0;flex:1; }
.cg-name { font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.cg-scan-btn { font-size:11px;color:var(--rose);text-decoration:none;padding:4px 10px;border-radius:20px;border:1px solid var(--rose-md);background:var(--card);transition:all 150ms;flex-shrink:0; }
.cg-scan-btn:hover { background:var(--rose);color:#fff; }

/* 卡内 item：紧凑两行版（标题 + 域名）*/
.cg-item { padding:8px 14px;border-top:1px solid var(--border);background:var(--card);text-decoration:none;display:flex;align-items:center;gap:8px;transition:background 150ms; }
.cg-item:first-of-type { border-top:none; }
.cg-item:hover { background:var(--rose-lt); }
.cg-item .wr-item-body { flex:1;min-width:0; }
.cg-item .wr-item-title { font-size:12px;line-height:1.4;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.cg-item .wr-item-meta { font-size:10px;color:var(--text-lt);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }

.cg-more { display:block;padding:8px 14px;font-size:11px;color:var(--rose);text-decoration:none;text-align:center;background:var(--rose-lt);margin-top:auto;border-top:1px solid var(--border); }
.cg-more:hover { background:var(--rose);color:#fff; }

/* ── Process page ── */
.proc-loading,.proc-empty { text-align:center;padding:80px 0;color:var(--text-lt);font-size:14px; }
.proc-back { display:inline-block;margin-top:16px;color:var(--rose);text-decoration:none;font-size:14px; }
/* Batch process view */
.batch-view { display:flex;flex-direction:column;gap:18px; }
.batch-page-hdr { display:flex;align-items:flex-end;justify-content:space-between;padding:0 2px; }
.batch-page-title { font-family:'DM Serif Display',serif;font-size:22px;font-weight:400;color:var(--text);margin-bottom:4px; }
.batch-page-sub { font-size:13px;color:var(--text-lt); }
.batch-exit-btn { font-size:12px;color:var(--text-lt);text-decoration:none;border:1.5px solid var(--border2);padding:5px 14px;border-radius:20px;transition:all 150ms; }
.batch-exit-btn:hover { color:var(--rose);border-color:var(--rose-md); }
.batch-card { background:var(--card);border:1px solid var(--border);border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(100,40,60,.06); }
.batch-select-bar { display:flex;align-items:center;gap:14px;padding:13px 20px;border-bottom:1px solid var(--border);background:var(--bg); }
.batch-check-all { display:flex;align-items:center;gap:7px;cursor:pointer; }
.batch-cb { display:flex;align-items:center;flex-shrink:0; }
.batch-check-lbl { font-size:13px;color:var(--text-md);font-weight:500; }
.batch-hint { font-size:12px;color:var(--text-lt); }
.batch-list { max-height:440px;overflow-y:auto; }
.batch-item { display:flex;align-items:center;gap:0;padding:0 20px;border-bottom:1px solid var(--border);transition:background 100ms; }
.batch-item:last-child { border-bottom:none; }
.batch-item:hover { background:var(--bg); }
.batch-item-sel { background:var(--rose-lt)!important; }
.batch-item-sel:hover { background:var(--rose-lt)!important; }
.batch-item-cb { flex-shrink:0;display:flex;align-items:center;padding:11px 12px 11px 0;cursor:pointer; }
.batch-item-cb:hover svg rect { stroke:#D9706A; }
.batch-item-link { flex:1;display:flex;align-items:center;gap:10px;padding:11px 0;text-decoration:none;color:inherit;min-width:0;cursor:pointer; }
.batch-item-link:hover .batch-item-title { color:var(--rose); }
.batch-item-fav { flex-shrink:0;width:18px;display:flex;align-items:center;justify-content:center; }
.batch-item-body { flex:1;min-width:0; }
.batch-item-title { font-size:13px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px;transition:color 150ms; }
.batch-item-meta { font-size:11px;color:var(--text-lt); }
.batch-action-bar { display:flex;align-items:center;gap:16px;padding:13px 20px;border-top:1px solid var(--border);background:var(--foot-bg); }
.batch-action-lbl { font-size:12px;color:var(--text-md);flex-shrink:0;font-weight:500; }
.batch-action-btns { display:flex;gap:7px; }
.bat-btn { display:flex;align-items:center;gap:5px;padding:6px 14px;border-radius:9px;border:1.5px solid var(--border2);background:var(--card);color:var(--text-md);font-size:12px;font-family:inherit;cursor:pointer;transition:all 150ms; }
.bat-keep:hover { border-color:var(--lav);color:var(--lav);background:var(--lav-lt); }
.bat-used:hover { border-color:#5AB870;color:#5AB870;background:#F0FAF2; }
.bat-release:hover { border-color:var(--rose);color:var(--rose);background:var(--rose-lt); }
.process-view { display:flex;gap:24px;align-items:flex-start; }
.process-card { flex:1;max-width:760px;background:var(--card);border-radius:20px;overflow:hidden;border:1px solid var(--border);box-shadow:0 8px 40px rgba(100,40,60,.1); }
.process-bar { height:3px;background:var(--grad); }
.process-hdr { padding:16px 22px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between; }
.process-badge { background:var(--rose-lt);border:1px solid #ECC8C6;border-radius:6px;padding:4px 12px;font-size:11px;color:var(--rose);font-weight:600; }
.process-nav { display:flex;align-items:center;gap:7px;font-size:11px;color:var(--text-lt);font-family:'DM Mono',monospace; }
.process-nav button { background:var(--bg);border:1.5px solid var(--border2);border-radius:6px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;color:var(--text-md);transition:all .15s;font-family:inherit; }
.process-nav button:hover:not(:disabled) { border-color:var(--rose);color:var(--rose); }
.process-nav button:disabled { opacity:.35;cursor:default; }
.process-content { padding:22px 26px; }
.process-source { display:flex;align-items:center;gap:8px;margin-bottom:14px; }
.process-source-icon { width:20px;height:20px;border-radius:5px;background:var(--rose-lt);flex-shrink:0;display:flex;align-items:center;justify-content:center; }
.process-source-text { font-size:11px;color:var(--text-lt); }
.process-title-link { display:block;text-decoration:none;margin-bottom:10px; }
.process-title-link:hover .process-title { color:var(--rose); }
.process-title { font-size:17px;font-weight:600;color:var(--text);line-height:1.35;transition:color 150ms; }
.process-title-ext { font-size:13px;font-weight:400;color:var(--text-lt);opacity:0;transition:opacity 150ms; }
.process-title-link:hover .process-title-ext { opacity:1; }
.process-excerpt { font-size:13px;color:var(--text-lt);line-height:1.6;margin-bottom:14px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden; }
.process-note { background:var(--rose-lt);border-left:3px solid var(--rose);border-radius:0 8px 8px 0;padding:9px 13px;font-family:'Source Serif 4',serif;font-style:italic;font-size:13px;color:var(--text-md);line-height:1.55;margin-bottom:18px; }
.process-question { background:var(--bg);border-radius:13px;padding:16px 18px;border:1.5px dashed #ECC8C6;margin-bottom:22px; }
.process-q-eyebrow { font-size:10px;color:var(--rose);font-weight:600;letter-spacing:.08em;margin-bottom:8px; }
.process-q-text { font-family:'Source Serif 4',serif;font-style:italic;font-size:16px;color:var(--text);line-height:1.5; }
.process-actions { display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px; }
.proc-act { border-radius:12px;padding:13px 6px;text-align:center;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;border:1.5px solid;transition:all .2s; }
.proc-act-icon { display:block;margin:0 auto 5px; }
.proc-act-sub { font-size:10px;font-weight:400;opacity:.7;display:block;margin-top:3px; }
.proc-keep { border-color:var(--lav);color:var(--lav);background:var(--lav-lt); }
.proc-keep:hover { background:#DDDDF4; }
.proc-used { border-color:#5AB870;color:#2E7040;background:#EDFAF2; }
.proc-used:hover { background:#D9F4E4; }
.proc-release { border-color:var(--rose);color:var(--rose);background:var(--rose-lt); }
.proc-release:hover { background:var(--rose);color:#fff;box-shadow:0 6px 24px rgba(217,112,106,.35); }
.proc-decided-area { margin-top:16px;display:flex;flex-direction:column;gap:10px;align-items:flex-start; }
.proc-decided-label { font-size:14px;color:var(--text-md); }
.proc-note-btn { background:none;border:1px dashed var(--border2);border-radius:8px;padding:6px 13px;font-size:12px;color:var(--text-lt);cursor:pointer;font-family:inherit; }
.proc-note-btn:hover { border-color:var(--rose-md);color:var(--rose); }
.proc-note-area { width:100%; }
.proc-note-input { width:100%;border:1px solid var(--border2);border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit;color:var(--text);background:var(--bg);resize:none;outline:none; }
.proc-note-input:focus { border-color:var(--rose-md); }
.proc-note-btns { display:flex;gap:8px;margin-top:6px; }
.proc-note-save { padding:5px 13px;border-radius:7px;background:var(--rose);color:#fff;border:none;font-size:12px;cursor:pointer;font-family:inherit; }
.proc-note-cancel { padding:5px 13px;border-radius:7px;background:var(--bg);color:var(--text-lt);border:1px solid var(--border2);font-size:12px;cursor:pointer;font-family:inherit; }
.proc-next-btn { font-size:13px;color:var(--rose);background:none;border:none;cursor:pointer;font-family:inherit;padding:0; }
.proc-next-btn:hover { text-decoration:underline; }
.proc-next-skip { color:var(--text-lt); }
.proc-next-skip:hover { color:var(--text-md); }

/* Chips (Process variant — 比 Popup 略大) */
.chips-area { margin-top:14px;padding-top:14px;border-top:1px solid var(--border); }
.chips-area-process { margin-top:16px;padding-top:16px; }
.chips-label { font-size:12px;color:var(--text-md);margin-bottom:8px; }
.chips-area-process .chips-label { font-size:13px;color:var(--text); }
.chips-row { display:flex;flex-wrap:wrap;gap:6px; }
.chip { padding:5px 11px;border-radius:20px;border:1px solid var(--border2);background:var(--bg);color:var(--text-md);font-size:12px;font-family:inherit;cursor:pointer;transition:all 150ms; }
.chip:hover { border-color:var(--rose-md);color:var(--rose); }
.chip-active { border-color:var(--rose);background:var(--rose-lt);color:var(--rose); }
.custom-input { margin-top:8px;width:100%;border:1px solid var(--border2);border-radius:8px;padding:7px 11px;font-size:13px;font-family:inherit;color:var(--text);background:var(--bg);outline:none;box-sizing:border-box; }
.custom-input:focus { border-color:var(--rose-md); }
.process-side { width:300px;flex-shrink:0;display:flex;flex-direction:column;gap:13px; }
.side-card { background:var(--card);border-radius:14px;border:1px solid var(--border);padding:16px; }
.side-card-title { font-size:10px;font-weight:600;color:var(--text-lt);text-transform:uppercase;letter-spacing:.1em;margin-bottom:11px; }
.context-row { display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px; }
.context-row:last-child { border-bottom:none; }
.context-key { color:var(--text-lt); }
.context-val { color:var(--text-md);font-weight:500; }
.related-item { display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);align-items:flex-start; }
.related-item:last-child { border-bottom:none; }
.related-dot { width:5px;height:5px;border-radius:50%;background:var(--lav);margin-top:5px;flex-shrink:0; }
.related-text { font-size:11px;color:var(--text-md);line-height:1.4; }
.side-insight { background:var(--rose-lt);border-color:#ECC8C6; }
.side-insight-text { font-family:'Source Serif 4',serif;font-style:italic;font-size:12px;color:var(--text-md);line-height:1.6; }

/* Terrain */
.terrain-page { display:flex;flex-direction:column;gap:10px; }
/* 旧的 page-level 大标题已并入 terrain-card-hdr，下面保留类名以防其他地方引用 */
.terrain-page-hdr { display:none; }
.terrain-page-title { display:none; }
.terrain-page-sub { display:none; }
/* terrain-card 内部标题区（h2 + tagline 两行） */
.terrain-card-titles { display:flex;flex-direction:column;gap:3px; }
.terrain-card-tagline { font-size:12px;color:var(--text-lt);font-style:italic;margin:0; }
/* canvas 上方的 meta caption（条数 + 主题数 + 提示） */
.terrain-canvas-caption { font-size:12px;color:var(--text-lt);font-style:italic;margin:4px 0 0;padding:0 4px; }
.terrain-ai-hint { font-size:12px;color:var(--text-md);background:var(--lav-lt);border:1px solid var(--lav);border-radius:10px;padding:9px 16px;line-height:1.7; }
.terrain-ai-hint a { color:var(--lav);text-decoration:none;margin-left:4px; }
.terrain-ai-hint a:hover { text-decoration:underline; }
.terrain-error-hint { font-size:12px;color:#C44;background:#FDF0EF;border:1px solid var(--rose-md);border-radius:10px;padding:9px 16px;line-height:1.7;margin-top:8px; }

/* 首次分析进度面板 */
.first-analysis-panel { display:flex;flex-direction:column;align-items:center;text-align:center;padding:60px 40px 50px;gap:14px; }
.fap-spinner { display:flex;gap:6px;color:var(--rose);margin-bottom:6px; }
.fap-dot { width:8px;height:8px;border-radius:50%;background:currentColor;animation:fap-pulse 1.2s ease-in-out infinite; }
.fap-dot:nth-child(2) { animation-delay:0.2s; }
.fap-dot:nth-child(3) { animation-delay:0.4s; }
.fap-title { font-family:'DM Serif Display',serif;font-size:20px;color:var(--text);margin:0; }
.fap-sub { font-size:13px;color:var(--text-md);margin:0; }
.fap-progress { width:280px;max-width:100%;height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin:8px 0; }
.fap-progress-fill { height:100%;background:linear-gradient(90deg,var(--rose),var(--lav));transition:width 800ms ease; }
.fap-tip { font-size:11px;color:var(--text-lt);line-height:1.8;margin-top:6px;max-width:340px; }
.fap-error { font-size:12px;color:#C44;background:#FDF0EF;padding:8px 12px;border-radius:8px;margin:0; }
@keyframes fap-pulse { 0%,100% { opacity:0.3 } 50% { opacity:1 } }

/* 重新分析覆盖层（已有旧 cluster + 正在跑新分析时） */
.terrain-overlay { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,252,250,0.88);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:10;animation:tao-fade-in 240ms ease-out; }
.terrain-overlay-card { background:var(--card);border:1px solid var(--border);border-radius:16px;padding:28px 36px;box-shadow:0 12px 40px rgba(217,112,106,0.18);display:flex;flex-direction:column;align-items:center;gap:10px;max-width:380px;text-align:center; }
.tao-spinner { display:flex;gap:6px;color:var(--rose);margin-bottom:4px; }
.tao-dot { width:8px;height:8px;border-radius:50%;background:currentColor;animation:fap-pulse 1.2s ease-in-out infinite; }
.tao-dot:nth-child(2) { animation-delay:0.2s; }
.tao-dot:nth-child(3) { animation-delay:0.4s; }
.tao-title { font-family:'DM Serif Display',serif;font-size:18px;color:var(--text);margin:0; }
.tao-sub { font-size:12px;color:var(--rose);margin:0;font-style:italic;animation:fap-pulse 2s ease-in-out infinite; }
.tao-progress { width:260px;max-width:100%;height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin:6px 0 2px; }
.tao-progress-fill { height:100%;background:linear-gradient(90deg,var(--rose),var(--lav));transition:width 800ms ease; }
.tao-meta { font-family:'DM Mono',monospace;font-size:11px;color:var(--text-md);display:flex;gap:8px; }
.tao-meta-sep { color:var(--text-lt); }
.tao-tip { font-size:11px;color:var(--text-lt);line-height:1.7;margin-top:6px; }
@keyframes tao-fade-in { from { opacity:0 } to { opacity:1 } }

/* 完成 toast（page 顶部居中） */
.terrain-toast { position:fixed;top:24px;left:50%;transform:translateX(-50%);padding:10px 22px;border-radius:24px;font-size:13px;font-weight:500;box-shadow:0 6px 24px rgba(217,112,106,0.20);z-index:200;animation:terrain-toast-in 320ms ease-out; }
.terrain-toast-ok { background:linear-gradient(90deg,#EDFAF2,#FDF0EF);color:var(--text);border:1px solid #B5DCC0; }
.terrain-toast-error { background:#FDF0EF;color:var(--rose);border:1px solid var(--rose-md); }
@keyframes terrain-toast-in { from { opacity:0;transform:translate(-50%,-16px) } to { opacity:1;transform:translate(-50%,0) } }
.terrain-card { background:var(--card);border-radius:22px;border:1px solid var(--border);box-shadow:0 8px 40px rgba(100,40,60,.08);overflow:hidden; }
.terrain-state-msg { text-align:center;padding:80px 0;color:var(--text-lt);font-size:14px; }
.terrain-clustering-spinner { width:32px;height:32px;border:3px solid var(--border2);border-top-color:var(--rose);border-radius:50%;animation:spin 800ms linear infinite;margin:0 auto 12px; }
.te-hint { font-size:12px;margin-top:8px;color:var(--text-lt); }
.terrain-card-hdr { display:flex;align-items:flex-end;justify-content:space-between;padding:12px 24px 10px;gap:16px; }
.terrain-card-title { font-family:'DM Serif Display',serif;font-size:22px;font-weight:400;color:var(--text);margin:0; }
.terrain-card-sub { font-size:12px;color:var(--text-lt);font-style:italic;margin:0; }
.terrain-card-divider { height:1px;background:var(--border); }
.terrain-filters { display:flex;gap:6px;align-items:center; }
.tf-btn { font-size:12px;border:1px solid var(--border2);background:transparent;border-radius:20px;padding:5px 14px;cursor:pointer;color:var(--text-md);transition:all .15s;font-family:'DM Sans',sans-serif; }
.tf-btn:hover { background:var(--rose-lt);border-color:var(--rose-md);color:var(--text); }
.tf-active { background:var(--rose)!important;border-color:var(--rose)!important;color:#fff!important; }
.terrain-body { display:flex; }
.terrain-left { flex:1;min-width:0;padding:14px 24px 14px 28px; }
.terrain-right { width:216px;flex-shrink:0;border-left:1px solid var(--border);padding:14px 20px; }
.terrain-actions { display:flex;align-items:center;gap:12px; }
.terrain-recluster-btn { padding:6px 12px;border-radius:8px;border:1px solid var(--border2);background:var(--card);color:var(--text-md);font-family:inherit;font-size:12px;cursor:pointer;transition:all 150ms;display:inline-flex;align-items:center;gap:4px; }
.terrain-recluster-btn:hover:not(:disabled) { border-color:var(--rose);color:var(--rose);background:var(--rose-lt); }
.terrain-recluster-btn:disabled { opacity:0.7;cursor:wait;background:var(--rose-lt);border-color:var(--rose-md);color:var(--rose); }
.terrain-recluster-loading { /* same as disabled state */ }
.trcl-dot { display:inline-block;width:4px;height:4px;border-radius:50%;background:currentColor;animation:trcl-pulse 1.2s infinite; }
.trcl-dot:nth-child(2) { animation-delay:0.2s; }
.trcl-dot:nth-child(3) { animation-delay:0.4s; }
@keyframes trcl-pulse { 0%,80%,100% { opacity:0.3 } 40% { opacity:1 } }
.terrain-canvas-wrap { position:relative; }
/* v3.1.28 · 用 viewport-relative：让兴趣地形 tab 一屏（含图例）能完整显示
   v3.1.28-1 · 拉大下限避免扁感，气泡分布更舒展
   -- 1080p ~ canvas 540px / 720p ~ canvas 440px / 4K ~ canvas 620px */
.terrain-canvas { width:100%;height:clamp(440px,54vh,620px);display:block;cursor:pointer; }

/* Hover info card：跟随 hover 中的气泡定位（上沿之上 8px） */
.terrain-hover-card { position:fixed;transform:translate(-50%,calc(-100% - 8px));background:var(--card);border:1px solid var(--border2);border-radius:12px;box-shadow:0 8px 24px rgba(100,40,60,.14);padding:14px 16px;min-width:220px;max-width:280px;font-size:12px;z-index:100;pointer-events:none; }
.thc-title { font-family:'DM Serif Display',serif;font-size:16px;color:var(--text);margin-bottom:4px;display:flex;align-items:center;gap:8px; }
.thc-state-pill { display:inline-block;padding:1px 7px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;color:#fff;letter-spacing:0.02em; }
.leg-state-dot { display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:2px;vertical-align:middle;border:1px solid #fff; }
.thc-meta { font-size:11px;color:var(--text-lt);margin-bottom:10px; }
/* v3.1.29 · hover card 里的"去 §3 看完整解读"hint —— 让兴趣地图 ⇄ 隐性自我 互相引用 */
.thc-terrain-hint { font-size:11.5px;color:var(--text-md);background:var(--rose-lt);border:1px dashed var(--rose-md);border-radius:8px;padding:6px 10px;margin-bottom:10px;display:flex;align-items:center;gap:8px;line-height:1.5; }
.thc-terrain-hint strong { font-weight:600;color:var(--rose); }
.thc-terrain-hint .thc-terrain-link { font-size:11px;color:var(--rose);text-decoration:none;margin-left:auto;white-space:nowrap; }
.thc-terrain-hint .thc-terrain-link:hover { text-decoration:underline; }
.thc-row { display:flex;justify-content:space-between;gap:10px;font-size:12px;line-height:1.7; }
.thc-key { color:var(--text-lt); }
.thc-val { color:var(--text);font-weight:500; }
.thc-score { color:var(--text-lt);font-weight:400; }
.thc-level-deep { color:#2E7D32; }
.thc-level-light { color:var(--text-md); }
.thc-level-zero { color:var(--text-lt); }
.thc-userintent { margin-top:8px;padding:6px 10px;background:var(--lav-lt);border-radius:6px;font-size:11px;color:var(--text-md); }
.thc-userintent strong { color:var(--lav);font-weight:600; }
.thc-ctas { display:flex;gap:8px;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border); }
.thc-cta { font-size:11px;text-decoration:none; }
.thc-cta-secondary { color:var(--text-md); }
.thc-cta-primary { color:var(--rose);font-weight:500; }

/* Intent picker：点击实线气泡触发 */
.terrain-modal-backdrop { position:fixed;inset:0;background:rgba(20,10,15,.18);z-index:200; }
.terrain-intent-picker { position:fixed;transform:translate(-50%,calc(-100% - 12px));background:var(--card);border:1.5px solid var(--rose-md);border-radius:14px;box-shadow:0 12px 36px rgba(217,112,106,.22);padding:18px 20px 16px;min-width:280px;max-width:340px;z-index:201; }
.tip-title { font-family:'DM Serif Display',serif;font-size:17px;color:var(--text);margin-bottom:4px; }
.tip-sub { font-size:13px;color:var(--text-md);margin-bottom:12px; }
.tip-chips { display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px; }
.tip-chip { padding:6px 14px;border-radius:20px;border:1px solid var(--border2);background:var(--bg);color:var(--text-md);font-size:13px;font-family:inherit;cursor:pointer;transition:all 150ms; }
.tip-chip:hover { border-color:var(--rose-md);color:var(--rose); }
.tip-chip-active { border-color:var(--rose);background:var(--rose-lt);color:var(--rose);font-weight:500; }
.tip-current { font-size:11px;color:var(--text-lt);margin-bottom:8px; }
.tip-explore { display:block;font-size:12px;color:var(--rose);text-decoration:none;padding-top:8px;border-top:1px dashed var(--border); }
.tip-explore:hover { text-decoration:underline; }
.tip-close { position:absolute;top:10px;right:12px;background:none;border:none;font-size:18px;line-height:1;color:var(--text-lt);cursor:pointer;padding:4px 8px; }
.tip-close:hover { color:var(--text); }
.terrain-filter-empty { text-align:center;padding:60px 0;color:var(--text-lt);font-size:13px; }
/* v3.1.28 · 图例完整版：3 行，每行 [key 标签] · [所有取值 + 含义]
   紧凑化：把垂直占地从 ~108px → ~78px，让一屏装得下 canvas + legend */
.terrain-legend { display:flex;flex-direction:column;gap:4px;margin-top:10px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px; }
.leg-row { display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:10.5px;color:var(--text-lt);line-height:1.5; }
.leg-row-key { min-width:118px;font-weight:600;color:var(--text-md); }
.leg-row-vals { display:flex;flex-wrap:wrap;gap:10px 14px;flex:1; }
.leg-chip { display:inline-flex;align-items:center;gap:5px;line-height:1.3;white-space:nowrap; }
/* 旧 leg-item 保留兼容性（其他地方可能引用）*/
.leg-item { display:flex;align-items:center;gap:7px;font-size:11px;color:var(--text-lt); }
.terrain-sidebar-title { font-size:10px;font-weight:600;letter-spacing:.08em;color:var(--text-lt);text-transform:uppercase;margin-bottom:12px; }
.terrain-status-row { display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border); }
.terrain-status-row:last-of-type { border-bottom:none; }
.ts-dot { width:7px;height:7px;border-radius:50%;flex-shrink:0; }
.ts-dot-rose { background:var(--rose); }
.ts-dot-lav { background:var(--lav); }
.ts-dot-sky { background:var(--sky); }
.ts-main { flex:1;min-width:0; }
.ts-name { display:block;font-size:13px;font-weight:500;color:var(--text);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.ts-tag { display:block;font-size:10px;margin-top:1px; }
.ts-tag-real { color:var(--lav); }
.ts-tag-illusion { color:var(--rose); }
.ts-count { font-family:'DM Mono',monospace;font-size:12px;color:var(--text-lt);flex-shrink:0; }
.terrain-sidebar-divider { height:1px;background:var(--border);margin:14px 0; }
.terrain-sidebar-note { font-size:11px;color:var(--text-lt);line-height:1.8; }

/* Profile */
.profile-loading { text-align:center;padding:80px 0;color:var(--text-lt);font-size:14px; }
/* 隐性自我页：单列窄版（820px），跟 demo 一致 */
/* v3.1.1 · max-width 从 820 → 980，容纳新三卡布局（180+560+180+gap=948）*/
.profile-page { display:flex;flex-direction:column;gap:24px;max-width:980px;margin:0 auto; }
.profile-page-hdr { padding:0 2px; }
.profile-page-title { font-family:'DM Serif Display',serif;font-size:26px;font-weight:400;color:var(--text);margin-bottom:5px; }
.profile-page-sub { font-size:13px;color:var(--text-lt); }
.profile-banner { background:var(--card);border:1px solid var(--border);border-radius:18px;padding:24px 28px;display:flex;flex-direction:column;gap:20px; }
.pb-top { display:flex;align-items:flex-start;gap:16px; }
.pb-avatar { font-size:36px;line-height:1;flex-shrink:0; }
.pb-intro { flex:1; }
.pb-intro-title { font-family:'DM Serif Display',serif;font-size:18px;color:var(--text);margin-bottom:6px; }
.pb-intro-desc { font-size:13px;color:var(--text-lt);line-height:1.6; }
.pb-stats { display:flex;gap:0;border-top:1px solid var(--border);padding-top:20px; }
.pb-stat { flex:1;text-align:center; }
.pb-num { display:block;font-family:'DM Mono',monospace;font-size:28px;font-weight:700;color:var(--rose); }
.pb-label { font-size:12px;color:var(--text-lt);margin-top:4px;display:block; }
.pb-divider { width:1px;background:var(--border);margin:0 8px; }
.findings-list { display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px; }
.findings-empty { grid-column:1/-1;text-align:center;padding:40px 0;color:var(--text-lt);font-size:14px; }
.finding-card { background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px; }
.fc-tag { display:inline-block;font-size:11px;border:1px solid currentColor;border-radius:20px;padding:2px 9px;margin-bottom:10px; }
.fc-title { font-size:15px;font-weight:500;margin-bottom:6px;color:var(--text); }
.fc-desc { font-size:13px;color:var(--text-md);line-height:1.5;margin-bottom:12px; }
.fc-eyebrow { font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-lt);margin-bottom:6px; }
.fc-metric { display:flex;align-items:center;gap:8px;margin-bottom:10px; }
.fc-metric-bar { flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden; }
.fc-metric-fill { height:100%;background:var(--grad);border-radius:2px; }
.fc-metric-text { font-size:11px;color:var(--text-lt);font-family:'DM Mono',monospace;white-space:nowrap; }
.fc-cta { font-size:12px;color:var(--rose);text-decoration:none; }
.fc-cta:hover { text-decoration:underline; }

/* Finding groups（按 type 分组）*/
.findings-groups { display:flex;flex-direction:column;gap:36px; }
.fg-section { display:flex;flex-direction:column;gap:14px; }
.fg-title { font-family:'DM Serif Display',serif;font-size:20px;font-weight:400;color:var(--text);letter-spacing:-0.01em; }
/* CR-030: 每组 finding 用 auto-fit（单卡撑满列宽不留空 grid cell）+ 限 max-width 不让单卡过宽 */
.fg-items { display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;max-width:760px; }
/* anxiety_panorama 含表格，占整行（即使在多卡 group 内）*/
.fg-items .finding-panorama { grid-column:1 / -1; }
/* 同样，长内容卡（hidden_strength / real_passion）单独占行更好读 */
.findings-empty { grid-column:1 / -1; }
.fe-hint { margin-top:8px;color:var(--rose);font-size:12px; }

/* ── CR-030：Profile 重设计（隐性自我）── */

/* 顶部叙事横幅（取代冷冰冰的三个数字） */
.profile-banner-narrative { padding:22px 26px;gap:14px; }
.pbn-narrative { font-family:'Source Serif 4',serif;font-style:italic;font-size:16px;line-height:1.6;color:var(--text);letter-spacing:-0.005em; }
.pbn-stats { display:flex;gap:24px;align-items:center;padding-top:6px;border-top:1px solid var(--border);padding-top:14px; }
.pbn-stat { display:flex;flex-direction:column;align-items:flex-start;gap:2px; }
.pbn-num { font-family:'DM Mono',monospace;font-size:22px;font-weight:700;color:var(--rose);line-height:1; }
.pbn-label { font-size:11px;color:var(--text-lt); }
.pbn-disclaimer { font-size:11px;color:var(--text-lt);font-style:italic;line-height:1.5; }

/* AI 头条洞察大卡（最醒目） */
.ai-headline-card { background:linear-gradient(135deg,#FFFCFA 0%,#FDF0EF 100%);border:1.5px solid var(--rose-md);border-radius:18px;padding:28px 32px;box-shadow:0 8px 32px rgba(217,112,106,0.10);display:flex;flex-direction:column;gap:14px;position:relative;overflow:hidden; }
.ai-headline-card::before { content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--rose),var(--lav),var(--sky)); }
.ahc-eyebrow { display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--rose);font-weight:600;letter-spacing:.08em;text-transform:uppercase; }
.ahc-eyebrow-dot { width:6px;height:6px;border-radius:50%;background:var(--rose);box-shadow:0 0 0 4px rgba(217,112,106,.2); }
.ahc-claim { font-family:'DM Serif Display',serif;font-size:22px;font-weight:400;color:var(--text);line-height:1.4;margin:0; }
.ahc-evidence { font-family:'Source Serif 4',serif;font-style:italic;font-size:14px;color:var(--text-md);line-height:1.7;margin:0; }
.ahc-narrative { display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--text-md);line-height:1.7;padding:12px 14px;background:rgba(255,255,255,0.5);border-radius:10px;border-left:2px solid var(--rose-md); }
.ahc-narrative p { margin:0; }
.ahc-metric { font-family:'DM Mono',monospace;font-size:12px;color:var(--rose);background:var(--card);padding:6px 12px;border-radius:20px;display:inline-block;align-self:flex-start;border:1px solid var(--rose-md); }
.ahc-actions { display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:4px; }
.ahc-cta { font-size:13px;color:var(--rose);text-decoration:none;font-weight:600; }
.ahc-cta:hover { text-decoration:underline; }

/* AI 头条加载占位 */
.ai-headline-loading { display:flex;align-items:center;gap:10px;padding:14px 20px;background:var(--rose-lt);border:1px dashed var(--rose-md);border-radius:12px;color:var(--rose);font-size:13px; }
.ahl-dot { width:6px;height:6px;border-radius:50%;background:var(--rose);animation:fap-pulse 1.2s ease-in-out infinite; }
.ahl-dot:nth-child(2) { animation-delay:0.2s; }
.ahl-dot:nth-child(3) { animation-delay:0.4s; }
.ahl-text { font-style:italic; }

/* anxiety_panorama 对比表 */
.finding-panorama { padding:22px 24px; }
.panorama-table { width:100%;border-collapse:collapse;margin:12px 0 14px;font-size:12px; }
.panorama-table thead th { text-align:left;padding:8px 8px;font-size:10px;font-weight:600;color:var(--text-lt);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border); }
.panorama-table tbody td { padding:8px 8px;border-bottom:1px solid var(--border); }
.panorama-table tbody tr:last-child td { border-bottom:none; }
.pt-name { color:var(--text);font-weight:500;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.pt-num { text-align:right;font-family:'DM Mono',monospace;color:var(--text-md); }
.pt-rate { padding:2px 8px;border-radius:10px;font-weight:600;font-size:11px; }
.pt-rate-low { background:#FDF0EF;color:var(--rose); }
.pt-rate-mid { background:#FFF3E0;color:#C8840A; }
.pt-rate-ok { background:#EDFAF2;color:#2E7040; }

/* 反馈按钮 */
.fb-buttons { display:flex;align-items:center;gap:6px;margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);flex-wrap:wrap; }
.fb-q { font-size:11px;color:var(--text-lt);margin-right:4px; }
.fb-btn { font-family:inherit;font-size:11px;padding:3px 10px;border-radius:14px;border:1px solid var(--border2);background:var(--card);color:var(--text-md);cursor:pointer;transition:all 120ms; }
.fb-yes:hover { border-color:#5AB870;color:#2E7040;background:#EDFAF2; }
.fb-partial:hover { border-color:#C8840A;color:#C8840A;background:#FFF3E0; }
.fb-no:hover { border-color:var(--rose);color:var(--rose);background:var(--rose-lt); }
.fb-rated .fb-label { font-size:11px;color:var(--text-md);font-style:italic; }
.fb-undo { font-family:inherit;font-size:11px;background:none;border:none;color:var(--rose);cursor:pointer;text-decoration:underline;padding:0; }
.fb-undo:hover { color:var(--text); }
.fb-undo:empty { display:none; }

/* Consumption Style 特殊大卡 */
.finding-style-card { padding:28px 26px;background:linear-gradient(135deg,#FDFCFF 0%,#EEEEF8 100%);border:1.5px solid var(--lav-lt); }
.fsc-label { font-family:'DM Mono',monospace;font-size:11px;color:var(--lav);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px; }
.fsc-claim { font-family:'DM Serif Display',serif;font-size:22px;color:var(--text);margin-bottom:8px;line-height:1.3; }
.fsc-desc { font-size:14px;color:var(--text-md);line-height:1.6; }

/* ─── 隐性自我 v2 · 6 段对话式架构 ─── */
/* 段包装 + 渐进展开 */
.seg-wrapper { display:flex;flex-direction:column;gap:0; }
.seg-just-revealed { animation:segFadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
@keyframes segFadeIn {
  0% { opacity:0;transform:translateY(20px); }
  100% { opacity:1;transform:translateY(0); }
}

/* 段尾"继续 ↓"按钮 */
.seg-next { display:flex;align-items:center;justify-content:center;gap:14px;padding:12px 0 20px;position:relative; }
.seg-next-btn { font-family:inherit;font-size:13px;color:var(--rose);background:#fff;border:1px solid var(--rose-md);padding:9px 22px;border-radius:100px;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 6px rgba(217,112,106,0.08); }
.seg-next-btn:hover { background:var(--rose);color:#fff;border-color:var(--rose);transform:translateY(2px);box-shadow:0 4px 12px rgba(217,112,106,0.18); }
.seg-progress { position:absolute;right:8px;font-family:'DM Mono',monospace;font-size:11px;color:var(--text-lt); }

/* 全部展开后的 end actions */
.seg-end-actions { display:flex;justify-content:center;gap:14px;margin-top:24px;padding-top:24px;border-top:1px dashed var(--border); }
.end-btn { font-family:inherit;font-size:13px;background:#fff;border:1px solid var(--rose);color:var(--rose);padding:10px 22px;border-radius:100px;cursor:pointer;transition:all 0.15s; }
.end-btn:hover { background:var(--rose);color:#fff; }
.end-btn.ghost { border-color:var(--border);color:var(--text-md); }
.end-btn.ghost:hover { background:var(--text-md);color:#fff;border-color:var(--text-md); }

/* v3.1.25 · Chord Triad 释义 footer · 不显眼但有质感 */
.triad-footer { margin-top:40px; padding:0; background:transparent; border:none; }
.triad-summary { list-style:none; cursor:pointer; display:flex; align-items:center; gap:8px; padding:10px 14px; color:var(--text-lt); font-size:12px; font-family:'Source Serif 4',serif; font-style:italic; border-top:1px dashed var(--border); transition:color 0.15s; user-select:none; }
.triad-summary::-webkit-details-marker { display:none; }
.triad-summary:hover { color:var(--text-md); }
.triad-summary strong { font-style:normal; font-family:'DM Serif Display',serif; color:var(--rose); font-weight:400; letter-spacing:0.02em; }
.triad-mark { font-size:14px; color:var(--rose); }
.triad-toggle { margin-left:auto; font-size:10px; color:var(--text-lt); font-family:'DM Mono',monospace; letter-spacing:0.06em; padding:2px 8px; border:1px solid var(--border); border-radius:100px; }
.triad-body { padding:18px 14px 24px; max-width:680px; color:var(--text-md); font-size:13px; line-height:1.75; font-family:'Source Serif 4',serif; }
.triad-body p { margin:0 0 12px; }
.triad-body p:last-child { margin-bottom:0; }
.triad-body strong { color:var(--text); font-weight:600; }
.triad-body em { color:var(--text-lt); font-style:italic; }
.triad-axes { list-style:none; padding:8px 0 8px 4px; margin:0 0 14px; border-left:2px solid var(--rose-md); }
.triad-axes li { padding:4px 0 4px 14px; font-size:13px; color:var(--text-md); }
.triad-axes li strong { color:var(--text); }
.triad-foot-note { color:var(--text-lt); font-style:italic; font-size:12px; padding-top:6px; border-top:1px dashed var(--border); }

.seg { margin-bottom:28px; }
.seg-head { display:flex;align-items:center;gap:10px;margin-bottom:10px; }
.seg-avatar { width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--rose-md),var(--lav));display:flex;align-items:center;justify-content:center;color:#fff;font-family:'DM Serif Display',serif;font-size:14px; }
.seg-name { font-size:11px;color:var(--text-lt);letter-spacing:0.1em; }
/* v3.1.28 · 段头右侧小分享按钮（玫瑰线条风，跟 logo 视觉一致）*/
.seg-share-btn { margin-left:auto;width:34px;height:34px;border-radius:50%;border:1px solid var(--border);background:transparent;color:var(--text-lt);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s ease;padding:0; }
.seg-share-btn:hover { color:var(--rose);border-color:var(--rose-md);background:var(--rose-lt);transform:translateY(-1px); }
.seg-share-btn:active { transform:translateY(0); }
.bubble { background:#fff;border:1px solid var(--border);border-radius:16px;border-top-left-radius:4px;padding:22px 26px;box-shadow:0 2px 8px rgba(120,80,100,0.04); }
.bubble-hero { background:linear-gradient(140deg,#FDF4F3 0%,#F8E5E1 100%);border:1px solid var(--rose-md);padding:0;overflow:hidden; }
.bubble-terrain { background:linear-gradient(140deg,#FAF7F1 0%,#F2EDE0 100%);border:1px solid #E5D9B8; }
.bubble-timeline { background:#fff;padding:16px 18px; }
.bubble-guidance { background:linear-gradient(140deg,#F5F0F8 0%,#EBE6F5 100%);border:1px solid #D8CFE4; }
.bubble-ai { background:linear-gradient(140deg,#EEF6FC 0%,#DCE9F4 100%);border:1px solid var(--sky); }
.b-eyebrow { font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-lt);margin-bottom:8px; }
.b-text { font-family:'Source Serif 4',serif;font-size:16px;line-height:1.7;color:var(--text); }
.b-text strong { color:var(--rose);font-weight:500;font-style:normal;font-family:'DM Serif Display',serif; }
.b-text em { color:var(--text-md);font-style:italic; }
.b-evi { font-family:'DM Mono',monospace;font-size:12px;color:var(--text-md);margin-top:10px; }
.b-narrative { margin-top:14px; }
.b-narrative p { font-family:'Source Serif 4',serif;font-size:14px;color:var(--text-md);line-height:1.6;margin-top:8px; }

/* §1 三身份卡堆叠 */
.deck-area { padding:32px 32px 12px; }
.deck-wrap { position:relative;height:440px;margin-bottom:22px;display:flex;align-items:center;justify-content:center;gap:14px; }
/* v3.1.1 · 三卡布局重设：主卡居中大显示，左右各一张小型缩略卡
   旧设计 bg 卡和主卡同尺寸 + 旋转重叠，视觉混乱
   新设计 bg 卡缩到 180×240（约主卡的 1/3 高），紧贴主卡两侧，清晰的视觉层级 */
.card-bg { width:180px;height:240px;border-radius:18px;box-shadow:0 8px 24px rgba(120,80,100,0.12);border:1px solid var(--border);background:var(--card);transition:transform 0.25s ease, box-shadow 0.25s ease;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px 14px;cursor:pointer;flex-shrink:0;opacity:0.95; }
.card-bg.bg-2 { background:linear-gradient(160deg,#FFF5E5 0%,#F6EAD7 100%); }
.card-bg.bg-3 { background:linear-gradient(160deg,#EEF6FC 0%,#DCE9F4 100%); }
.card-bg:hover { transform:translateY(-4px);box-shadow:0 14px 36px rgba(120,80,100,0.20);opacity:1; }
.card-bg-empty { opacity:0.6 !important;border-style:dashed; }
/* flex-shrink:0 防止 flex 容器空间不够时主卡被压扁；transition 给切换动画用 */
.card-main { position:relative;z-index:3;width:560px;height:380px;flex-shrink:0;border-radius:24px;background:linear-gradient(140deg,#FDF4F3 0%,#F8E5E1 50%,#EEDDDD 100%);border:1px solid var(--rose-md);box-shadow:0 22px 64px rgba(217,112,106,0.2);padding:0;display:flex;overflow:hidden;animation:card-main-enter 0.35s cubic-bezier(.22,1,.36,1); }
@keyframes card-main-enter {
  0%   { transform:scale(0.94);opacity:0; }
  60%  { transform:scale(1.015);opacity:1; }
  100% { transform:scale(1);opacity:1; }
}
.card-main-empty { background:linear-gradient(140deg,#F5F2EE 0%,#EEEAE4 100%);border:1px dashed var(--border2); }
.card-main-img { width:280px;flex-shrink:0;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden; }
.card-main-img img { width:100%;height:100%;object-fit:cover; }
.card-main-body { flex:1;padding:28px 28px;display:flex;flex-direction:column;justify-content:space-between;min-width:0; }
.card-dim { font-size:10px;letter-spacing:0.26em;text-transform:uppercase;color:var(--text-lt);font-family:'DM Mono',monospace; }
.card-dim-sub { font-size:11px;color:var(--text-md);font-style:italic;margin-top:3px;letter-spacing:0;text-transform:none;font-family:'Source Serif 4',serif; }
.b-text .quiet { display:block;margin-top:10px;color:var(--text-md);font-size:14px;font-style:italic;font-family:'Source Serif 4',serif; }
/* v3.1.20 · identityHook 带身份角度标签 */
.b-text .quiet-hook .hook-tag { font-style:normal;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:0.12em;padding:2px 7px;border-radius:100px;margin-right:6px;vertical-align:1px; }
.b-text .quiet-hook-consistent_extreme .hook-tag { background:var(--lav-lt);color:var(--lav); }
.b-text .quiet-hook-contrast .hook-tag { background:var(--rose-lt);color:var(--rose); }
.b-text .quiet-hook-neutral .hook-tag { display:none; }
.card-id-en { font-family:'DM Serif Display',serif;font-size:46px;color:var(--rose);line-height:1;letter-spacing:-1.2px;margin-top:8px; }
.card-id-zh { font-family:'DM Serif Display',serif;font-size:22px;color:var(--text);margin-top:4px;margin-bottom:18px; }
.card-claim { font-family:'Source Serif 4',serif;font-style:italic;font-size:17px;color:var(--text);line-height:1.55; }
.card-evi { font-family:'DM Mono',monospace;font-size:11px;color:var(--text-lt);margin-top:8px;line-height:1.5; }
.card-conf { display:inline-block;font-size:10px;background:#fff;border:1px solid var(--border);border-radius:100px;padding:4px 12px;color:var(--text-md);align-self:flex-start;font-family:'DM Mono',monospace; }
/* v3.1.1 · bg-mini 改为垂直布局（图上 + 文下），适配窄卡 180×240 */
.bg-mini { display:flex;flex-direction:column;align-items:center;gap:10px;width:100%; }
.bg-mini-img { width:100px;height:100px;border-radius:14px;background:#fff;overflow:hidden;border:1px solid var(--border);flex-shrink:0; }
.bg-mini-img img { width:100%;height:100%;object-fit:cover; }
.bg-mini-empty { width:100px;height:100px;border-radius:14px;background:rgba(255,255,255,0.5);border:1px dashed var(--border2);display:flex;align-items:center;justify-content:center;color:var(--text-lt);font-size:32px;font-family:serif; }
/* v3.1.7 · 缺数据态 · 小卡的 UNSEEN 图 + 邀请文案 */
.bg-mini-img-empty { opacity:0.85;border-style:dashed; }
.bg-empty-title { color:var(--text-md)!important;font-family:'Source Serif 4',serif;font-style:italic;font-size:13px!important;margin-top:3px; }
.bg-empty-hint { font-size:10px;color:var(--text-lt);margin-top:5px;font-family:'DM Sans',sans-serif;line-height:1.4; }
/* v3.1.7 · 缺数据态 · 主卡完整邀请（图 + 文左右布局，对齐正常主卡）*/
.card-empty-what { font-family:'Source Serif 4',serif;font-style:italic;font-size:15px;color:var(--text-md);line-height:1.6;margin-top:16px; }
.card-empty-how { font-size:12px;color:var(--text-lt);font-family:'DM Sans',sans-serif;line-height:1.55;margin-top:8px; }
.bg-mini-text { text-align:center; }
.bg-mini-text .bg-dim { font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-lt);margin-bottom:4px;font-family:'DM Mono',monospace; }
.bg-mini-text .bg-id-en { font-family:'DM Serif Display',serif;font-size:17px;color:var(--text-md);line-height:1.1; }
.bg-mini-text .bg-id-zh { font-family:'Noto Sans SC',sans-serif;font-size:13px;color:var(--text-md);margin-top:3px; }
.deck-thumbs { display:flex;justify-content:center;gap:14px;margin-top:8px; }
.deck-thumb { padding:9px 18px;border-radius:10px;border:1px solid var(--border);background:var(--card);cursor:pointer;transition:all 0.2s;font-size:12px;color:var(--text-md);font-family:'DM Mono',monospace;letter-spacing:0.08em;font-weight:500; }
.deck-thumb:hover { border-color:var(--rose-md);color:var(--rose); }
.deck-thumb.active { border-color:var(--rose);background:var(--rose-lt);color:var(--rose);cursor:default; }
.deck-thumb-empty { opacity:0.55;font-style:italic; }
.deck-thumb-empty:hover { border-color:var(--border);color:var(--text-md); }
.combined-summary { margin:8px 28px 22px;padding:18px 22px;background:rgba(255,255,255,0.65);border:1px dashed var(--border);border-radius:12px;font-family:'Source Serif 4',serif;font-style:italic;font-size:15px;color:var(--text);line-height:1.65; }
.combined-summary strong { font-family:'DM Serif Display',serif;font-style:normal;color:var(--rose);font-size:16px; }
/* v3.1.6 · MBTI 风格 3 字母组合代码 + 中文全称 + 叙述 */
.combo-code-row { display:flex;align-items:baseline;gap:12px;margin-bottom:6px;flex-wrap:wrap; }
.combo-code { font-family:'DM Mono',monospace;font-size:28px;font-weight:700;color:var(--rose);letter-spacing:0.18em;background:linear-gradient(180deg,#fff 0%,var(--rose-lt) 100%);padding:3px 12px;border-radius:8px;border:1px solid var(--rose-md);box-shadow:0 2px 6px rgba(217,112,106,.10); }
.combo-name { font-family:'DM Serif Display','Noto Sans SC',serif;font-style:normal;color:var(--text);font-size:18px;font-weight:500;letter-spacing:0.02em; }
.combo-narrative { color:var(--text);line-height:1.7; }

/* §3 隐喻地形 */
.terrain-grid { display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px; }
/* v3.1.17 · 地图怎么读 · 综合解读 + 反思 prompt */
.terrain-reading { margin-top:18px;padding-top:14px;border-top:1px dashed rgba(180,160,120,.4); }
.terrain-reading .b-eyebrow { color:var(--text-md);margin-bottom:6px; }
.terr-reading-text { font-family:'Source Serif 4',serif;font-style:italic;font-size:14px;line-height:1.7;color:var(--text);margin-bottom:10px; }
.terr-reading-prompt { font-size:13px;color:var(--text-md);line-height:1.65;padding:10px 14px;background:rgba(255,255,255,0.5);border-left:3px solid var(--lav);border-radius:0 8px 8px 0; }
.terr-card { padding:14px 16px;border-radius:14px;display:flex;flex-direction:column;gap:6px; }
.terr-card.swamp { background:#EFEDF2;border:1px solid #D5CFE0; }
.terr-card.forest { background:#E5F4E8;border:1px solid #C6E3CB; }
.terr-card.ember { background:#FBE9DD;border:1px solid #F0CCB5; }
.terr-card.sleep { background:#EFEBEA;border:1px solid #DDD5D2; }
/* v3.1.28-2 · 空槽位 placeholder 视觉（暗淡 + 虚线边框，保持地形结构感）*/
.terr-card-empty { opacity:.55;border-style:dashed !important;background:var(--bg) !important; }
.terr-empty-hint { font-family:'Source Serif 4',serif;font-style:italic;font-size:12.5px;color:var(--text-lt);line-height:1.55;margin-top:4px; }
.terr-label { font-size:10px;letter-spacing:0.18em;text-transform:uppercase;display:flex;align-items:center;gap:6px; }
.terr-label .dot { width:8px;height:8px;border-radius:50%;display:inline-block; }
.terr-swamp { color:#6F6588; } .terr-swamp .dot { background:#A09BB8; }
.terr-forest { color:#3A8050; } .terr-forest .dot { background:#7AC890; }
.terr-ember { color:#B05530; } .terr-ember .dot { background:#E08A6A;animation:emberPulse 1.6s ease-in-out infinite; }
.terr-sleep { color:#7A6A65; } .terr-sleep .dot { background:#A89E9A;border:1px dashed #7A6A65; }
@keyframes emberPulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
.terr-title { font-family:'DM Serif Display',serif;font-size:15px;color:var(--text);line-height:1.3; }
.terr-detail { font-family:'DM Mono',monospace;font-size:11px;color:var(--text-md);margin-top:4px; }
.terr-note { font-family:'Source Serif 4',serif;font-style:italic;font-size:12px;color:var(--text-md);margin-top:6px;line-height:1.5; }

/* §4 时间线 · v3.1.28 视觉升级（平滑曲线 + 中轴 + ▲▼ + 现在线 + draw 动画 + pulsing dot） */
.tl-wrap { position:relative;margin-top:8px;padding:0 4px; }
.tl-svg { display:block;width:100%;height:260px;overflow:visible; }
/* Y 轴语义文字 */
.tl-axis-up { position:absolute;top:8px;left:8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5AB870;font-family:'DM Mono',monospace; }
.tl-axis-dn { position:absolute;bottom:34px;left:8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--lav);font-family:'DM Mono',monospace; }
/* 中轴 + "现在"竖线 */
.tl-axis-mid { stroke:var(--border);stroke-width:1;stroke-dasharray:4 4; }
.tl-now-line { stroke:var(--rose-md);stroke-width:1;stroke-dasharray:2 3;opacity:.7; }
/* 曲线 draw-in 动画 —— stroke-dasharray 长 → 短，从左到右画出 */
.tl-curve-g { animation:tlDraw 1.4s cubic-bezier(.22,1,.36,1) forwards;animation-delay:var(--draw-delay,0ms);opacity:0; }
.tl-curve-path { stroke-dasharray:1200;stroke-dashoffset:1200;animation:tlDrawPath 1.4s cubic-bezier(.22,1,.36,1) forwards;animation-delay:var(--draw-delay,0ms); }
.tl-curve-g.tl-curve-falling .tl-curve-path { animation:tlDrawPathDashed 1.4s cubic-bezier(.22,1,.36,1) forwards;animation-delay:var(--draw-delay,0ms); }
@keyframes tlDraw { to { opacity:1 } }
@keyframes tlDrawPath { to { stroke-dashoffset:0 } }
/* falling 曲线已经是虚线，draw 完后还原虚线样式 */
@keyframes tlDrawPathDashed { 0% { stroke-dashoffset:1200 } 99% { stroke-dashoffset:0;stroke-dasharray:1200 } 100% { stroke-dashoffset:0;stroke-dasharray:5 4 } }
/* 末端 dot pulsing —— 表达"现在还在发生" */
.tl-end-dot { opacity:0;animation:tlDotIn .4s ease forwards;animation-delay:calc(var(--draw-delay,0ms) + 1100ms); }
.tl-end-dot-pulse { animation:tlDotIn .4s ease forwards, tlDotPulse 2.4s ease-in-out infinite;animation-delay:calc(var(--draw-delay,0ms) + 1100ms), calc(var(--draw-delay,0ms) + 1500ms); }
@keyframes tlDotIn { to { opacity:1 } }
@keyframes tlDotPulse { 0%,100% { opacity:1;r:3.5 } 50% { opacity:.5;r:5 } }
.tl-end-label { opacity:0;animation:tlLabelIn .5s ease forwards;animation-delay:calc(var(--draw-delay,0ms) + 1200ms); }
@keyframes tlLabelIn { to { opacity:.85 } }
/* v3.1.2 · §4 多信号补充观察列表 */
.tl-supports { margin-top:14px;padding-top:14px;border-top:1px dashed var(--border); }
.tl-supports-eyebrow { font-size:10.5px;letter-spacing:0.08em;color:var(--text-lt);text-transform:uppercase;font-family:'DM Mono',monospace;margin-bottom:8px; }
.tl-support-item { display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;font-size:13px;line-height:1.55;color:var(--text-md); }
.tl-support-kind { flex-shrink:0;font-size:10px;background:var(--lav-lt);color:var(--lav);padding:2px 7px;border-radius:8px;font-family:'DM Mono',monospace;letter-spacing:0.06em;margin-top:2px; }
.tl-support-text { flex:1; }
.tl-legend { display:flex;gap:14px;margin-top:8px;flex-wrap:wrap;font-size:11px;color:var(--text-md);font-family:'DM Mono',monospace;padding:0 8px; }
.tl-leg-item { display:inline-flex;align-items:center;gap:6px; }
.tl-leg-line { width:18px;height:2px;display:inline-block; }

/* v3.1.28 · 分享卡 Modal · 1:1 + 主大次小三卡同框（照 §1 你是谁视觉关系） */
.share-modal-backdrop { position:fixed;inset:0;background:rgba(42,21,32,.55);backdrop-filter:blur(6px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:32px 20px;animation:smdIn .25s ease;overflow-y:auto; }
@keyframes smdIn { from { opacity:0 } to { opacity:1 } }
.share-modal-body { display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;justify-content:center;animation:smbIn .35s cubic-bezier(.22,1,.36,1); }
@keyframes smbIn { from { opacity:0;transform:translateY(16px) scale(.96) } to { opacity:1;transform:translateY(0) scale(1) } }
/* 分享卡本体 · 1:1 正方形 640×640（微信生态友好） */
.share-card { width:640px;height:640px;background:radial-gradient(ellipse at top left,#F8E5E1 0%,transparent 60%),radial-gradient(ellipse at bottom right,#F4DDB8 0%,transparent 55%),linear-gradient(135deg,#FDF4F3 0%,#FAF3E8 100%);border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(100,40,60,.28);display:flex;flex-direction:column;padding:24px 32px 22px;color:var(--text); }
/* v3.1.28 · 加 width:100% / flex-shrink:0 让 html2canvas-pro 截图时布局不乱 */
.share-card .sc-top { display:flex;justify-content:space-between;align-items:center;width:100%;font-size:10px;color:var(--text-lt);letter-spacing:.18em;text-transform:uppercase;font-family:'DM Mono',monospace; }
.share-card .sc-top-eye, .share-card .sc-top-date { flex-shrink:0; }
/* 顶部 HDG + 综合名 */
.sc-triad-head { text-align:center;margin:12px 0 14px; }
.sc-triad-code { font-family:'DM Serif Display',serif;font-size:34px;line-height:1;color:var(--rose);letter-spacing:.06em;margin-bottom:2px; }
.sc-triad-name { font-family:'DM Serif Display',serif;font-size:16px;line-height:1.2;color:var(--text); }
/* 主大次小三卡同框 · 横排 */
.sc-deck { display:flex;align-items:center;justify-content:center;gap:10px;height:300px;margin-bottom:10px; }
/* 副卡 100×190，水平居中，纵向 align center */
.sc-side-card { width:108px;flex-shrink:0;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:12px 8px;display:flex;flex-direction:column;align-items:center;gap:4px;box-shadow:0 6px 20px rgba(120,80,100,.10);opacity:.95; }
.sc-side-mindset { background:linear-gradient(160deg,#FFF5E5 0%,#F6EAD7 100%); }
.sc-side-radius { background:linear-gradient(160deg,#EEF6FC 0%,#DCE9F4 100%); }
.sc-side-img { width:74px;height:74px;border-radius:10px;overflow:hidden;flex-shrink:0; }
.sc-side-img img { width:100%;height:100%;object-fit:cover; }
.sc-side-dim { font-size:9px;color:var(--text-lt);letter-spacing:.12em;margin-top:6px; }
.sc-side-en { font-family:'DM Serif Display',serif;font-size:13px;line-height:1.1;letter-spacing:-.2px;color:var(--text); }
.sc-side-mindset .sc-side-en { color:#8B7AA8; }
.sc-side-radius .sc-side-en { color:#6B95B5; }
.sc-side-zh { font-size:11px;color:var(--text);line-height:1.2; }
.sc-side-empty { opacity:.55;justify-content:center;border-style:dashed; }
.sc-side-empty .sc-side-en { color:var(--text-lt);font-style:italic; }
/* 主卡 横向布局：左大图 + 右文字（参考 §1 .card-main） */
.sc-main-card { flex:1;height:100%;display:flex;border-radius:18px;background:linear-gradient(140deg,#FDF4F3 0%,#F8E5E1 50%,#EEDDDD 100%);border:1px solid var(--rose-md);box-shadow:0 14px 36px rgba(217,112,106,.18);overflow:hidden; }
.sc-main-img { width:50%;flex-shrink:0;background:#fff; }
.sc-main-img img { width:100%;height:100%;object-fit:cover; }
/* 主卡 body 分两团（顶 + 底），space-between 把中间撑开 —— 学 §1 .card-main-body */
.sc-main-body { flex:1;padding:18px 18px 18px;display:flex;flex-direction:column;justify-content:space-between;min-width:0;gap:12px; }
.sc-main-head { display:flex;flex-direction:column;gap:3px; }
.sc-main-foot { display:flex;flex-direction:column;gap:8px; }
.sc-main-dim { font-size:10px;color:var(--text-lt);letter-spacing:.12em; }
.sc-main-en { font-family:'DM Serif Display',serif;font-size:30px;line-height:1.05;color:var(--rose);letter-spacing:-.4px; }
.sc-main-zh { font-family:'DM Serif Display',serif;font-size:16px;color:var(--text);line-height:1.2; }
.sc-main-claim { font-family:'Source Serif 4',serif;font-style:italic;font-size:12.5px;line-height:1.55;color:var(--text-md); }
.sc-main-claim::before, .sc-main-claim::after { content:'"';color:var(--rose);font-size:14px;font-style:normal; }
.sc-main-evi { font-family:'DM Mono',monospace;font-size:10px;color:var(--text-lt);line-height:1.5;padding-top:6px;border-top:1px dashed rgba(217,112,106,.18); }
/* 综合 narrative + 数据条 */
.share-card .sc-claim { font-family:'Source Serif 4',serif;font-style:italic;font-size:13px;line-height:1.7;color:var(--text-md);text-align:center;margin:6px 8px 8px;padding:0 4px;display:flex;flex-direction:column;gap:2px; }
/* 第一行起首加引号 + 最后一行结尾加引号 */
.share-card .sc-claim .sc-claim-line:first-child::before { content:'"';color:var(--rose);font-size:14px;font-style:normal;margin-right:2px; }
.share-card .sc-claim .sc-claim-line:last-child::after { content:'"';color:var(--rose);font-size:14px;font-style:normal;margin-left:2px; }
.share-card .sc-divider { width:44px;height:1px;background:#F5C0BE;margin:0 auto 8px;opacity:.7; }
.share-card .sc-evi { font-family:'DM Mono',monospace;font-size:10px;color:var(--text-lt);text-align:center;line-height:1.6;margin-bottom:8px; }
.share-card .sc-evi-row { display:inline-block;padding:0 6px; }
.share-card .sc-foot { margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;padding-top:4px; }
.share-card .sc-brand { display:flex;flex-direction:column;gap:2px; }
.share-card .sc-brand-logo { display:flex;align-items:center;gap:6px;line-height:1; }
.share-card .sc-brand-logo svg { display:block;flex-shrink:0; }
.share-card .sc-brand-name { font-family:'DM Serif Display',serif;font-size:14px;color:var(--text);letter-spacing:-.2px; }
.share-card .sc-brand-slogan { font-family:'Source Serif 4',serif;font-style:italic;font-size:9px;color:var(--text-lt); }
/* 小屏适配（< 1100px viewport：分享卡缩到 520×520） */
@media (max-width:1100px) { .share-card { width:520px;height:520px;padding:20px 24px } .sc-deck { height:240px } .sc-side-card { width:88px } .sc-side-img { width:60px;height:60px } .sc-main-en { font-size:24px } }
/* 旁边动作面板 */
.share-actions { width:240px;background:#fff;border-radius:14px;padding:22px 22px 18px;box-shadow:0 12px 32px rgba(100,40,60,.12);display:flex;flex-direction:column;gap:10px; }
.share-actions .sa-title { font-family:'DM Serif Display',serif;font-size:18px;color:var(--text);margin-bottom:2px; }
.share-actions .sa-hint { font-size:12px;color:var(--text-lt);line-height:1.5;margin-bottom:8px; }
.share-actions .sa-btn { font-family:inherit;font-size:13px;padding:10px 16px;border-radius:10px;cursor:pointer;border:none;transition:opacity .2s,background .2s; }
.share-actions .sa-btn.primary { background:var(--rose);color:#fff; }
.share-actions .sa-btn.primary:hover { opacity:.88; }
.share-actions .sa-btn.ghost { background:#fff;color:var(--text-md);border:1px solid var(--border); }
.share-actions .sa-btn.ghost:hover { background:var(--rose-lt); }
.share-actions .sa-foot { font-size:10px;color:var(--text-lt);letter-spacing:.06em;margin-top:auto;font-family:'DM Mono',monospace; }
.share-actions .sa-btn:disabled { opacity:.6;cursor:wait; }
.share-actions .sa-toast { font-size:12px;color:var(--rose);background:var(--rose-lt);padding:8px 12px;border-radius:8px;text-align:center;animation:saToastIn .25s ease; }
@keyframes saToastIn { from { opacity:0;transform:translateY(-4px) } to { opacity:1;transform:translateY(0) } }
@media (max-width:760px) { .share-card { width:320px;height:570px;padding:20px 22px } .share-card .sc-art { height:230px } .share-card .sc-id-en { font-size:34px } .share-actions { width:280px } }

/* §5 心理引导 */
.guide-grid { display:grid;grid-template-columns:1fr;gap:14px;margin-top:14px; }
.guide-slot { background:rgba(255,255,255,0.7);border:1px solid #D8CFE4;border-radius:12px;padding:14px 16px; }
.guide-label { font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#6F5C8C;margin-bottom:6px;display:flex;align-items:center;gap:8px; }
.guide-num { display:inline-flex;width:18px;height:18px;border-radius:50%;background:#9082B5;color:#fff;align-items:center;justify-content:center;font-family:'DM Mono',monospace;font-size:10px; }
.guide-text { font-family:'Source Serif 4',serif;font-size:15px;line-height:1.65;color:var(--text); }
.guide-text strong { font-family:'DM Serif Display',serif;font-style:normal;color:#6F5C8C;font-weight:400; }
.guide-text em { color:var(--text-md);font-style:italic; }

/* §6 chips（反馈） */
.chips-wrap { display:flex;flex-direction:column;gap:8px;margin-top:14px; }
.chips { display:flex;flex-wrap:wrap;gap:8px; }
/* v3.1.28 · 闭环 ② · 「上次你说不准——这一次换了角度」hint */
.chips-stale-hint { display:flex;align-items:flex-start;gap:6px;font-size:11.5px;color:var(--rose);background:var(--rose-lt);border:1px dashed var(--rose-md);border-radius:8px;padding:7px 12px;line-height:1.5;animation:cshIn .35s ease; }
.chips-stale-icon { font-family:'DM Mono',monospace;font-size:13px;line-height:1.3;color:var(--rose); }
@keyframes cshIn { from { opacity:0;transform:translateY(-3px) } to { opacity:1;transform:translateY(0) } }
.chip { font-family:inherit;font-size:12px;background:#fff;border:1px solid var(--border);color:var(--text-md);padding:7px 14px;border-radius:100px;cursor:pointer;transition:all 0.15s; }
.chip:hover { border-color:var(--rose);color:var(--rose);background:var(--rose-lt); }
.chip.chip-on { background:var(--rose);color:#fff;border-color:var(--rose); }
.chip.chip-on:hover { background:#C45F58;color:#fff; }
.chip.chip-cta { background:var(--rose);color:#fff;border-color:var(--rose);font-weight:500; }
.chip.chip-cta:hover { background:#C45F58; }
.chip.chip-input { border-style:dashed;color:var(--text-lt); }
.chip.chip-input.chip-on { border-style:solid;background:var(--lav);border-color:var(--lav);color:#fff; }
.chip.chip-done { background:var(--lav-lt);color:var(--lav);border-color:var(--lav);font-weight:500;cursor:default; }
.chip-input-area { display:flex;align-items:center;gap:6px;padding:4px 0 0 6px; }
.chip-text-input { flex:1;font-family:inherit;font-size:13px;padding:8px 12px;border-radius:100px;border:1px solid var(--rose-md);background:#fff;color:var(--text);outline:none;transition:border-color 0.15s; }
.chip-text-input:focus { border-color:var(--rose); }
.chip-text-submit { font-family:inherit;font-size:12px;background:var(--rose);color:#fff;border:none;padding:8px 16px;border-radius:100px;cursor:pointer; }
.chip-text-submit:disabled { background:var(--border2);cursor:default; }
.chip-text-cancel { font-family:inherit;font-size:16px;background:transparent;color:var(--text-lt);border:none;cursor:pointer;width:28px;height:28px;border-radius:50%; }
.chip-text-cancel:hover { background:var(--border);color:var(--text-md); }

/* ─── Weekly Review 页 ─── */
.weekly-page { max-width:880px;margin:0 auto;padding:36px 32px 60px; }
.weekly-loading { text-align:center;padding:80px 0;color:var(--text-lt); }
.weekly-empty { text-align:center;padding:80px 0; }
.weekly-empty p { color:var(--text-md);margin-bottom:14px; }
.weekly-empty-cta { display:inline-block;padding:10px 24px;background:var(--rose);color:#fff;border-radius:10px;text-decoration:none;font-size:14px; }
.weekly-hdr { margin-bottom:36px; }
.weekly-title { font-family:'DM Serif Display',serif;font-size:32px;color:var(--text);margin-bottom:6px; }
.weekly-sub { font-size:14px;color:var(--text-lt);font-style:italic; }
.wk-section { background:var(--card);border:1px solid var(--border);border-radius:14px;padding:24px 28px;margin-bottom:20px; }
.wk-section-title { font-family:'DM Serif Display',serif;font-size:19px;font-weight:400;color:var(--text);margin-bottom:4px; }
.wk-section-sub { font-size:12px;color:var(--text-lt);font-style:italic;margin-bottom:14px; }
.wk-section-journey { background:linear-gradient(135deg,#FFFCFA 0%,#FDF0EF 100%); }

/* 节奏 dots */
.wk-rhythm { display:flex;justify-content:space-between;gap:10px;margin-top:14px; }
.wk-day { flex:1;display:flex;flex-direction:column;align-items:center;gap:6px; }
.wk-dot { width:34px;height:34px;border-radius:50%;border:1.5px solid var(--border2);display:flex;align-items:center;justify-content:center;background:var(--bg);font-family:'DM Mono',monospace;font-size:12px;color:var(--text-lt); }
.wk-dot-done { background:var(--rose-lt);border-color:var(--rose-md); }
.wk-dot-num { color:var(--rose);font-weight:600; }
.wk-day-today .wk-dot { border-color:var(--rose);box-shadow:0 0 0 3px var(--rose-lt); }
.wk-day-future { opacity:0.4; }
.wk-day-label { font-size:11px;color:var(--text-lt); }

/* 本周数字 */
.wk-stats { display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:14px; }
.wk-stat { display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px;background:var(--bg);border-radius:10px; }
.wk-stat-num { font-family:'DM Serif Display',serif;font-size:28px;color:var(--text); }
.wk-stat-label { font-size:11px;color:var(--text-lt); }

/* Findings 卡 */
.wk-findings { display:flex;flex-direction:column;gap:12px;margin-top:14px; }
.wk-finding { display:block;padding:14px 16px;background:var(--bg);border-radius:10px;border-left:3px solid var(--rose-md);text-decoration:none;color:inherit;transition:all 150ms; }
.wk-finding:hover { background:var(--rose-lt);transform:translateX(2px); }
.wk-finding-eyebrow { font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-lt);margin-bottom:4px; }
.wk-finding-claim { font-size:14px;color:var(--text);font-weight:500;margin-bottom:4px; }
.wk-finding-evidence { font-size:12px;color:var(--text-md);line-height:1.5; }
.wk-findings-more { font-size:12px;color:var(--rose);text-decoration:none;align-self:flex-end; }
.wk-findings-more:hover { text-decoration:underline; }

/* 超期清理 */
.wk-overdue { display:flex;flex-direction:column;gap:6px;margin-top:14px; }
.wk-overdue-item { display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg);border-radius:8px;text-decoration:none;color:inherit;transition:all 150ms; }
.wk-overdue-item:hover { background:var(--rose-lt); }
.wk-overdue-main { flex:1;min-width:0; }
.wk-overdue-title { font-size:13px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px; }
.wk-overdue-meta { font-size:11px;color:var(--text-lt); }
.wk-overdue-age { font-size:11px;color:var(--rose);font-family:'DM Mono',monospace;flex-shrink:0; }
.wk-overdue-more { font-size:12px;color:var(--rose);text-decoration:none;text-align:center;padding:8px;border-radius:8px; }
.wk-overdue-more:hover { background:var(--rose-lt); }

/* Journey moments */
.wk-moments { display:flex;flex-direction:column;gap:14px;margin-top:14px; }
.wk-moment { display:flex;gap:14px;padding:14px;background:var(--card);border-radius:10px;border:1px solid var(--border); }
.wk-moment-sweet { border-left:3px solid #5AB870; }
.wk-moment-tear { border-left:3px solid var(--rose); }
.wk-moment-icon { flex-shrink:0;padding-top:2px; }
.wk-moment-body { flex:1; }
.wk-moment-desc { font-size:13px;color:var(--text);margin-bottom:4px; }
.wk-moment-note { font-family:'Source Serif 4',serif;font-style:italic;font-size:13px;color:var(--text-md);margin-bottom:6px; }
.wk-moment-cluster { display:inline-block;font-size:10px;color:var(--lav);background:var(--lav-lt);padding:2px 8px;border-radius:10px; }

/* Button decision animations */
@keyframes pin-stamp { 0%{transform:scale(1) translateY(0)} 28%{transform:scale(1.12) translateY(-5px)} 55%{transform:scale(0.95) translateY(2px)} 75%{transform:scale(1.04) translateY(-1px)} 100%{transform:scale(1) translateY(0)} }
@keyframes used-tick { 0%{transform:scale(1) rotate(0deg)} 20%{transform:scale(1.10) rotate(-5deg)} 45%{transform:scale(1.13) rotate(4deg)} 68%{transform:scale(1.05) rotate(-1.5deg)} 100%{transform:scale(1) rotate(0deg)} }
@keyframes proc-ripple-expand { from{transform:translate(-50%,-50%) scale(0);opacity:0.65} to{transform:translate(-50%,-50%) scale(4.5);opacity:0} }
@keyframes float-up { 0%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)} 100%{opacity:0;transform:translateX(-50%) translateY(-34px) scale(1.05)} }
.proc-act.anim-keep { animation:pin-stamp 500ms ease-out; }
.proc-act.anim-used { animation:used-tick 500ms ease-out; }
.proc-ripple { position:fixed;transform:translate(-50%,-50%) scale(0);width:60px;height:60px;border-radius:50%;border:1.5px solid #5AB870;pointer-events:none;z-index:9999;animation:proc-ripple-expand 650ms ease-out forwards; }
.proc-float-text { position:fixed;transform:translateX(-50%);font-size:13px;font-weight:600;color:var(--text);pointer-events:none;z-index:9999;animation:float-up 620ms cubic-bezier(.22,1,.36,1) forwards; }

/* Settings */
.settings-loading { padding:80px 0;text-align:center;color:var(--text-lt);font-size:14px; }
.settings-wrap { max-width:800px;padding:8px 0; }
.settings-title { font-family:'DM Serif Display',serif;font-size:28px;margin-bottom:28px;color:var(--text); }
.settings-section { background:var(--card);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px; }
.ss-header { margin-bottom:16px; }
.ss-label { font-size:15px;font-weight:500;color:var(--text); }
.ss-desc { display:block;font-size:12px;color:var(--text-lt);margin-top:3px; }
.mode-cards { display:flex;gap:12px;margin-bottom:16px; }
.mode-card { flex:1;padding:16px;border-radius:12px;border:1.5px solid var(--border2);background:var(--bg);text-align:left;cursor:pointer;font-family:inherit;transition:all 150ms; }
.mode-card:hover { border-color:var(--rose-md);background:var(--rose-lt); }
.mode-active { border-color:var(--rose);background:var(--rose-lt); }
.mc-icon { display:block;font-size:22px;margin-bottom:6px; }
.mc-label { display:block;font-size:14px;font-weight:500;color:var(--text);margin-bottom:4px; }
.mc-desc { display:block;font-size:12px;color:var(--text-lt);line-height:1.4; }
.ai-config { border-top:1px solid var(--border);padding-top:16px;display:flex;flex-direction:column;gap:14px; }
.cfg-row { display:flex;flex-direction:column;gap:6px; }
.cfg-key { font-size:12px;color:var(--text-lt); }
.provider-grid { display:flex;flex-wrap:wrap;gap:6px; }
.provider-btn { display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;border:1px solid var(--border2);background:var(--bg);font-size:12px;color:var(--text-md);cursor:pointer;font-family:inherit;transition:all 150ms; }
.provider-btn:hover { border-color:var(--rose-md);color:var(--rose); }
.prov-active { border-color:var(--rose);background:var(--rose-lt);color:var(--rose); }
.prov-label { white-space:nowrap; }
.prov-free-badge { display:inline-block;padding:1px 5px;border-radius:8px;background:#E8F5E9;color:#2E7D32;font-size:10px;font-weight:600;line-height:1.4;white-space:nowrap; }
.provider-signup { margin-top:6px; }
.signup-link { font-size:12px;color:var(--rose);text-decoration:none; }
.signup-link:hover { text-decoration:underline; }
.provider-hint { font-size:11px;color:var(--text-lt);margin-top:2px; }
.key-edit-row,.key-display-row { display:flex;align-items:center;gap:8px; }
.key-input { flex:1;border:1px solid var(--border2);border-radius:8px;padding:7px 10px;font-size:13px;font-family:'DM Mono',monospace;color:var(--text);background:var(--bg);outline:none; }
.key-input:focus { border-color:var(--rose-md); }
.key-masked { font-family:'DM Mono',monospace;font-size:13px;color:var(--text-md); }
.key-toggle,.key-save,.key-cancel,.key-edit-btn,.key-test-btn { padding:5px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;border:1px solid var(--border2);background:var(--bg);color:var(--text-md); }
.key-save { background:var(--rose);border-color:var(--rose);color:#fff; }
.key-test-btn:hover:not(:disabled) { border-color:var(--lav);color:var(--lav); }
.key-test-btn:disabled { opacity:.5;cursor:not-allowed; }
.ping-result { margin-top:8px;padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.5; }
.ping-ok { background:#F0FAF2;color:#2E7D32;border:1px solid #B8EDCA; }
.ping-fail { background:#FDF0EF;color:#C44; border:1px solid var(--rose-md); }

/* Settings 里 chord_bundled 的说明卡 */
.bundled-notice { padding:14px 16px;border-radius:10px;background:linear-gradient(135deg,#FFFCFA 0%,#FDF0EF 100%);border:1px solid var(--rose-md); }
.bn-title { font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px; }
.bn-desc { font-size:12px;color:var(--text-md);line-height:1.7;margin-bottom:8px; }
.bn-desc strong { color:var(--text); }
.bn-hint { font-size:11px;color:var(--text-lt); }
.url-input { border:1px solid var(--border2);border-radius:8px;padding:7px 10px;font-size:13px;color:var(--text);background:var(--bg);outline:none;width:100%; }
.url-input:focus { border-color:var(--rose-md); }
.ai-note { font-size:11px;color:var(--text-lt);line-height:1.5; }
.time-row { display:flex;align-items:center;gap:16px; }
.freq-chips { display:flex;gap:6px; }
.freq-chip { padding:6px 14px;border-radius:20px;border:1px solid var(--border2);background:var(--bg);font-size:13px;color:var(--text-md);cursor:pointer;font-family:inherit;transition:all 150ms; }
.freq-chip:hover { border-color:var(--rose-md);color:var(--rose); }
.freq-active { border-color:var(--rose);background:var(--rose-lt);color:var(--rose); }
.time-input { border:1px solid var(--border2);border-radius:8px;padding:6px 10px;font-size:14px;font-family:'DM Mono',monospace;color:var(--text);background:var(--bg);outline:none; }
.time-input:focus { border-color:var(--rose-md); }
/* 当前皮肤简洁展示（入口）*/
.skin-current-row { display:flex;align-items:center;justify-content:space-between;gap:14px; }
.skin-current-info { display:flex;align-items:center;gap:12px; }
.skin-swatch-lg { width:32px;height:32px;border-radius:50%;flex-shrink:0;box-shadow:0 0 0 2px var(--card),0 0 0 3px var(--border2); }
.skin-current-name { font-size:14px;color:var(--text);font-weight:500; }
.skin-change-btn { padding:8px 16px;border-radius:9px;border:1px solid var(--border2);background:var(--bg);color:var(--text-md);font-family:inherit;font-size:13px;cursor:pointer;transition:all 150ms; }
.skin-change-btn:hover { border-color:var(--rose);color:var(--rose); }

/* Skin modal */
.skin-modal-backdrop { position:fixed;inset:0;background:rgba(20,10,15,.42);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;z-index:1000;animation:fade-in 200ms ease; }
.skin-modal { position:relative;background:var(--card);border-radius:20px;box-shadow:0 24px 64px rgba(0,0,0,.22);padding:32px 36px 28px;max-width:680px;width:calc(100% - 48px);max-height:80vh;overflow-y:auto;animation:scale-in 220ms cubic-bezier(.22,1,.36,1); }
.skin-modal-close { position:absolute;top:16px;right:20px;background:none;border:none;font-size:24px;color:var(--text-lt);cursor:pointer;padding:4px 10px;line-height:1; }
.skin-modal-close:hover { color:var(--text); }
.skin-modal-title { font-family:'DM Serif Display',serif;font-size:24px;color:var(--text);margin-bottom:4px; }
.skin-modal-sub { font-size:13px;color:var(--text-lt);margin-bottom:24px; }
.skin-modal-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:14px; }
.skin-modal-card { position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;padding:20px 16px;border-radius:14px;border:1.5px solid var(--border);cursor:pointer;font-family:inherit;transition:all 200ms;overflow:hidden; }
.skin-modal-card:hover { border-color:var(--rose-md);transform:translateY(-2px);box-shadow:0 8px 20px rgba(217,112,106,.12); }
.skin-modal-active { border-color:var(--rose);box-shadow:0 0 0 2px var(--rose-lt) inset; }
.skin-modal-bg { position:absolute;inset:0;z-index:0;opacity:.4; }
.skin-modal-swatch { position:relative;z-index:1;width:48px;height:48px;border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,.08); }
.skin-modal-name { position:relative;z-index:1;font-size:13px;color:var(--text);font-weight:500; }
.skin-modal-check { position:relative;z-index:1;display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500; }
@keyframes fade-in { from{opacity:0} to{opacity:1} }
@keyframes scale-in { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
.data-actions { display:flex;gap:10px;margin-bottom:10px; }
.data-btn { padding:8px 18px;border-radius:9px;border:1px solid var(--border2);background:var(--bg);font-size:13px;color:var(--text-md);cursor:pointer;font-family:inherit;transition:all 150ms; }
.data-btn:hover { border-color:var(--rose-md);color:var(--rose); }
.data-danger:hover { border-color:#E05050;color:#E05050; }
.data-note { font-size:11px;color:var(--text-lt);line-height:1.5; }
/* v3.1.28-2 · 修复历史时间戳结果显示 */
.data-fix-result { margin-top:10px;padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.6;background:linear-gradient(90deg,#EDFAF2,#FDF0EF);color:var(--text);border:1px solid #B5DCC0;animation:dfrIn .3s ease; }
.data-fix-error { background:#FDF0EF;color:var(--rose);border-color:var(--rose-md); }
.data-fix-history { background:var(--bg);color:var(--text-lt);border-color:var(--border); }
@keyframes dfrIn { from { opacity:0;transform:translateY(-3px) } to { opacity:1;transform:translateY(0) } }
.settings-saved { position:fixed;bottom:24px;right:24px;background:var(--text);color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;animation:fade-in-up 200ms ease;text-decoration:none; }
.settings-recluster { background:var(--lav);bottom:24px;right:24px; }
.settings-recluster-done { background:#5AB870;cursor:pointer; }
.upgrade-banner { display:flex;align-items:center;gap:14px;width:100%;padding:14px 18px;margin-bottom:20px;border:1.5px solid var(--rose-md);border-radius:12px;background:linear-gradient(90deg, var(--rose-lt), var(--lav-lt));cursor:pointer;font-family:inherit;text-align:left;transition:all 200ms; }
.upgrade-banner:hover { border-color:var(--rose);transform:translateY(-1px);box-shadow:0 4px 12px rgba(217,112,106,0.12); }
.ub-icon { font-size:20px;flex-shrink:0; }
.ub-text { flex:1;display:flex;flex-direction:column;gap:2px; }
.ub-title { font-size:14px;font-weight:600;color:var(--text); }
.ub-sub { font-size:12px;color:var(--text-md); }
.ub-arrow { font-size:18px;color:var(--rose);flex-shrink:0; }
@keyframes fade-in-up { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
.privacy-link { font-size:12px;color:var(--rose);text-decoration:none;margin-top:10px;display:inline-block; }
.privacy-link:hover { text-decoration:underline; }

/* Privacy */
.privacy-wrap { max-width:800px;padding:8px 0; }
.privacy-title { font-family:'DM Serif Display',serif;font-size:28px;margin-bottom:8px;color:var(--text); }
.privacy-updated { font-size:12px;color:var(--text-lt);margin-bottom:28px; }
.privacy-section { margin-bottom:24px; }
.privacy-section h3 { font-size:16px;font-weight:500;color:var(--text);margin-bottom:8px; }
.privacy-section p { font-size:14px;color:var(--text-md);line-height:1.7;margin-bottom:8px; }
.privacy-section ul { font-size:14px;color:var(--text-md);line-height:1.7;padding-left:20px; }
.privacy-section li { margin-bottom:4px; }
.privacy-section code { font-family:'DM Mono',monospace;font-size:12px;background:var(--border);padding:1px 5px;border-radius:4px; }

/* Onboarding */
.ob-wrap { max-width:480px;margin:80px auto;padding:0 24px;text-align:center; }
.ob-logo { margin-bottom:24px; }
.ob-title { font-family:'DM Serif Display',serif;font-size:32px;margin-bottom:10px; }
.ob-subtitle { font-size:15px;color:var(--text-md);margin-bottom:32px; }
.storage-cards { display:flex;gap:16px;margin-bottom:24px; }
.storage-card { position:relative;flex:1;padding:24px 20px;border-radius:14px;border:1.5px solid var(--border);background:var(--card);cursor:pointer;transition:all 200ms;font-family:inherit;text-align:center; }
.storage-card:hover:not(:disabled) { border-color:var(--rose-md);background:var(--rose-lt); }
.storage-card-recommend { border-color:var(--rose-md); }
.storage-card-cloud:disabled { opacity:0.55;cursor:not-allowed; }
.sc-recommend { position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:var(--rose);color:#fff;font-size:10px;font-weight:600;padding:2px 10px;border-radius:10px;letter-spacing:0.04em; }
.sc-icon { display:block;font-size:28px;margin-bottom:8px; }
.sc-label { display:block;font-size:14px;font-weight:500;color:var(--text);margin-bottom:6px; }
.sc-desc { display:block;font-size:12px;color:var(--text-lt);line-height:1.5; }
.ob-note { font-size:11px;color:var(--text-lt); }
/* ── Chord 内置 AI 卡片（Onboarding 第一推荐）── */
.ob-bundled-card { padding:20px 22px;border-radius:14px;border:1.5px solid var(--rose-md);background:linear-gradient(135deg,#FFFCFA 0%,#FDF0EF 100%);box-shadow:0 4px 16px rgba(217,112,106,0.08);margin-bottom:18px; }
.ob-bundled-row { display:flex;align-items:flex-start;gap:14px;margin-bottom:14px; }
.ob-bundled-icon { font-size:22px;color:var(--rose);flex-shrink:0;line-height:1; }
.ob-bundled-body { flex:1; }
.ob-bundled-name { font-size:15px;font-weight:600;color:var(--text);margin-bottom:4px; }
.ob-bundled-sub { font-size:12px;color:var(--text-md); }
.ob-bundled-privacy { padding:12px 14px;border-radius:10px;background:rgba(255,255,255,0.55); }
.ob-pri-line { font-size:12px;color:var(--text-md);line-height:1.7; }
.ob-pri-line strong { color:var(--text);font-weight:500; }
.ob-actions-stack { flex-direction:column;align-items:stretch;gap:8px; }
.ob-secondary { padding:10px 22px;border-radius:10px;border:1px solid var(--border2);background:var(--card);font-family:inherit;font-size:13px;color:var(--text-md);cursor:pointer;text-align:center; }
.ob-secondary:hover { border-color:var(--text-md); }
.ob-tertiary { padding:8px 16px;border:none;background:none;font-family:inherit;font-size:12px;color:var(--text-lt);cursor:pointer; }
.ob-tertiary:hover { color:var(--text-md); }
.ob-providers { display:flex;flex-direction:column;gap:10px;margin-bottom:18px; }
.ob-providers-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:18px; }
.ob-prov-free { display:inline-block;margin-left:6px;padding:1px 6px;border-radius:8px;background:#E8F5E9;color:#2E7D32;font-size:10px;font-weight:600;vertical-align:middle; }
.ob-prov { position:relative;padding:14px 16px;border-radius:12px;border:1.5px solid var(--border);background:var(--card);cursor:pointer;transition:all 200ms;font-family:inherit;text-align:left;display:flex;flex-direction:column;gap:4px; }
.ob-prov:hover { border-color:var(--rose-md);background:var(--rose-lt); }
.ob-prov-active { border-color:var(--rose);background:var(--rose-lt); }
.ob-prov-name { font-size:14px;font-weight:600;color:var(--text); }
.ob-prov-tag { font-size:12px;color:var(--text-md); }
.ob-prov-signup { position:absolute;top:14px;right:16px;font-size:11px;color:var(--rose);text-decoration:none; }
.ob-prov-signup:hover { text-decoration:underline; }
.ob-key-input { width:100%;padding:11px 14px;border-radius:10px;border:1.5px solid var(--border2);background:var(--card);font-family:'DM Mono',monospace;font-size:13px;color:var(--text);outline:none;margin-bottom:8px;box-sizing:border-box; }
.ob-key-input:focus { border-color:var(--rose); }
.ob-hint { font-size:11px;color:var(--text-lt);margin-bottom:18px;text-align:left; }
.ob-actions { display:flex;gap:10px;justify-content:flex-end; }
.ob-skip { padding:10px 18px;border-radius:10px;border:1px solid var(--border2);background:var(--card);font-family:inherit;font-size:13px;color:var(--text-md);cursor:pointer; }
.ob-skip:hover { border-color:var(--text-md); }
.ob-next { padding:10px 22px;border-radius:10px;border:none;background:var(--rose);color:#fff;font-family:inherit;font-size:13px;cursor:pointer;font-weight:500; }
.ob-next:disabled { background:var(--border2);color:var(--text-lt);cursor:not-allowed; }
.ob-center { display:flex;flex-direction:column;align-items:center;gap:16px; }
.ob-spinner { width:40px;height:40px;border:3px solid var(--border2);border-top-color:var(--rose);border-radius:50%;animation:spin 800ms linear infinite; }
@keyframes spin { to{transform:rotate(360deg)} }
.ob-import-label { font-size:15px;color:var(--text-md); }
.ob-import-count { font-family:'DM Mono',monospace;font-size:13px;color:var(--text-lt); }
.ob-progress-bar { width:240px;height:6px;background:var(--border);border-radius:3px;overflow:hidden; }
.ob-progress-fill { height:100%;background:var(--grad);transition:width 300ms ease;border-radius:3px; }
.ob-done-icon { font-size:48px; }
.ob-done-title { font-family:'DM Serif Display',serif;font-size:24px;color:var(--text); }
.ob-done-msg { font-size:14px;color:var(--text-md); }
.ob-cta { display:inline-block;margin-top:8px;padding:10px 24px;background:var(--rose);color:#fff;border-radius:10px;text-decoration:none;font-size:14px; }

/* ──── ReleaseReasonDialog (v2 二向决策) ──── */
.rrd-overlay,.bdcd-overlay,.brd-overlay { position:fixed;inset:0;background:rgba(42,21,32,.4);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px; }
.rrd-dialog { background:var(--card);border-radius:16px;padding:24px 24px 18px;max-width:420px;width:100%;box-shadow:0 16px 50px rgba(100,40,60,.3); }
.rrd-eyebrow { font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--text-lt);margin-bottom:6px; }
.rrd-title { font-family:'DM Serif Display','Noto Sans SC',serif;font-size:20px;color:var(--text);margin:0 0 6px; }
.rrd-subtitle { font-size:12px;color:var(--text-md);margin-bottom:8px;font-style:italic;font-family:'Source Serif 4',serif; }
.rrd-hint { margin-bottom:10px; }
.rrd-grid { display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0; }
.rrd-chip { background:#fff;border:1px solid var(--border);border-radius:10px;padding:12px 6px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;font-family:inherit;transition:all 120ms; }
.rrd-chip:hover { border-color:var(--rose-md);background:var(--rose-lt);transform:translateY(-1px); }
.rrd-chip-active { border-color:var(--rose);background:var(--rose-lt);box-shadow:0 0 0 2px var(--rose-md); }
.rrd-chip-emoji { font-size:22px;line-height:1; }
.rrd-chip-label { font-size:11px;color:var(--text-md);text-align:center;line-height:1.3; }
.rrd-custom-wrap { margin:10px 0; }
.rrd-custom-input { width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;color:var(--text);background:#fff; }
.rrd-custom-input:focus { outline:none;border-color:var(--rose);box-shadow:0 0 0 2px var(--rose-md); }
.rrd-actions { display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border); }
.rrd-actions-right { display:flex;gap:8px; }
.rrd-skip,.rrd-cancel { background:none;border:none;font-family:inherit;font-size:12px;color:var(--text-lt);cursor:pointer;padding:6px 8px; }
.rrd-skip:hover,.rrd-cancel:hover { color:var(--rose); }
.rrd-confirm { background:var(--rose);color:#fff;border:none;font-family:inherit;font-size:13px;padding:8px 18px;border-radius:100px;cursor:pointer;font-weight:500; }
.rrd-confirm:hover { background:#C45F58; }
.rrd-confirm:disabled { background:var(--border2);cursor:not-allowed; }

/* ──── BookmarkDeleteConfirmDialog ──── */
.bdcd-dialog { background:var(--card);border-radius:16px;padding:26px 26px 20px;max-width:420px;width:100%;box-shadow:0 16px 50px rgba(100,40,60,.3); }
.bdcd-eyebrow { font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--text-lt);margin-bottom:6px; }
.bdcd-title { font-family:'DM Serif Display','Noto Sans SC',serif;font-size:19px;color:var(--text);margin:0 0 12px; }
.bdcd-body { font-size:13px;color:var(--text-md);line-height:1.65;margin-bottom:18px; }
.bdcd-options { display:flex;flex-direction:column;gap:10px;margin-bottom:10px; }
.bdcd-opt { background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px 16px;cursor:pointer;text-align:left;font-family:inherit;transition:all 120ms; }
.bdcd-opt:hover { border-color:var(--rose-md);background:var(--rose-lt);transform:translateY(-1px); }
.bdcd-opt-strong { border-color:var(--rose);background:linear-gradient(135deg,var(--rose-lt),#fff); }
.bdcd-opt-title { font-size:15px;color:var(--text);font-weight:500;margin-bottom:3px; }
.bdcd-opt-sub { font-size:12px;color:var(--text-lt); }
.bdcd-once { background:none;border:none;font-family:inherit;font-size:11px;color:var(--text-lt);cursor:pointer;padding:6px;margin-top:6px;width:100%;text-align:center; }
.bdcd-once:hover { color:var(--text-md); }

/* ──── BatchReleaseDialog ──── */
.brd-dialog { background:var(--card);border-radius:16px;padding:24px 24px 18px;max-width:560px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 16px 50px rgba(100,40,60,.3); }
.brd-dialog-narrow { max-width:380px; }
.brd-eyebrow { font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--text-lt);margin-bottom:6px; }
.brd-title { font-family:'DM Serif Display','Noto Sans SC',serif;font-size:19px;color:var(--text);margin:0 0 10px; }
.brd-body { font-size:13px;color:var(--text-md);line-height:1.6;margin-bottom:14px; }
.brd-list { flex:1;overflow-y:auto;max-height:48vh;margin:8px 0;border:1px solid var(--border);border-radius:8px;padding:4px 0; }
.brd-row { display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px; }
.brd-row:last-child { border-bottom:none; }
.brd-row-title { flex:1;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.brd-row-select { background:#fff;border:1px solid var(--border);border-radius:6px;padding:4px 6px;font-size:11px;font-family:inherit;color:var(--text-md);cursor:pointer;min-width:130px; }
.brd-row-select:focus { outline:none;border-color:var(--rose); }
.brd-grid { display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:12px 0; }
.brd-chip { background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px 8px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;font-family:inherit;transition:all 120ms; }
.brd-chip:hover { border-color:var(--rose-md);background:var(--rose-lt);transform:translateY(-1px); }
.brd-chip-active { border-color:var(--rose);background:var(--rose-lt);box-shadow:0 0 0 2px var(--rose-md); }
.brd-chip-emoji { font-size:22px;line-height:1; }
.brd-chip-label { font-size:11px;color:var(--text-md);text-align:center;line-height:1.3; }
.brd-separator { text-align:center;font-size:11px;color:var(--text-lt);margin:10px 0;font-style:italic;font-family:'Source Serif 4',serif; }
.brd-custom-input { width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;color:var(--text);background:#fff;margin-bottom:8px; }
.brd-custom-input:focus { outline:none;border-color:var(--rose); }
.brd-actions { display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border);flex-wrap:wrap; }
.brd-actions-right { display:flex;gap:8px;margin-left:auto; }
.brd-skip,.brd-cancel,.brd-switch { background:none;border:none;font-family:inherit;font-size:12px;color:var(--text-lt);cursor:pointer;padding:6px 8px; }
.brd-skip:hover,.brd-cancel:hover,.brd-switch:hover { color:var(--rose); }
.brd-switch { color:var(--lav);border:1px dashed var(--lav-lt);border-radius:6px;padding:6px 12px; }
.brd-confirm { background:var(--rose);color:#fff;border:none;font-family:inherit;font-size:13px;padding:8px 18px;border-radius:100px;cursor:pointer;font-weight:500; }
.brd-confirm:hover { background:#C45F58; }
.brd-confirm:disabled { background:var(--border2);cursor:not-allowed; }

/* ──── Release settings (v2) ──── */
.rs-section { background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px 18px;margin-bottom:14px; }
.rs-section-title { font-family:'DM Serif Display','Noto Sans SC',serif;font-size:14px;color:var(--text);margin-bottom:6px; }
.rs-section-sub { font-size:12px;color:var(--text-lt);margin-bottom:12px; }
.rs-radio-row { display:flex;flex-direction:column;gap:8px; }
.rs-radio-label { display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text);cursor:pointer; }
.rs-radio-label input { margin-top:3px;cursor:pointer; }
.rs-radio-hint { font-size:11px;color:var(--text-lt);margin-top:2px; }

/* ──── 主动出现系统 · 通知设置（Phase 1）──── */
.notif-block { padding:14px 0;border-bottom:1px solid var(--border); }
.notif-block:last-of-type { border-bottom:none; }
.notif-block-title { font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;display:flex;align-items:center;gap:8px; }
.notif-block-desc { font-size:11px;color:var(--text-lt);line-height:1.5;margin-bottom:10px; }
.notif-phase { font-size:9px;background:var(--lav-lt);color:var(--lav);padding:2px 8px;border-radius:100px;letter-spacing:.04em;font-weight:500; }
.notif-block-disabled .notif-block-title { color:var(--text-md); }
.notif-block-disabled .notif-toggle { opacity:.6; }

.notif-radio-row { display:flex;flex-direction:column;gap:6px;margin-top:6px; }
.notif-radio { display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text);cursor:pointer;padding:4px 0; }
.notif-radio input { margin-top:3px;cursor:pointer;accent-color:var(--rose); }
.notif-radio-label { display:block;font-weight:500;color:var(--text);font-size:12px; }
.notif-radio-hint { display:block;font-size:10px;color:var(--text-lt);margin-top:1px; }

.notif-toggle { display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text);cursor:pointer;padding:4px 0; }
.notif-toggle input { cursor:pointer;accent-color:var(--rose); }

.notif-row { display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-md);margin-top:6px; }
.notif-row-label { color:var(--text); }
.notif-row-sep { color:var(--text-lt); }
.notif-select { padding:3px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;font-size:12px;color:var(--text);cursor:pointer;font-family:inherit; }
.notif-select:focus { outline:none;border-color:var(--rose); }

.notif-mute-bar { display:flex;justify-content:space-between;align-items:center;background:#FFF3E0;border:1px solid #E5C088;border-radius:8px;padding:10px 14px;margin:8px 0 14px;font-size:12px;color:#8A5A20; }
.notif-mute-undo { background:transparent;border:1px solid #E5C088;color:#8A5A20;padding:4px 10px;border-radius:100px;font-size:11px;cursor:pointer;font-family:inherit; }
.notif-mute-undo:hover { background:#FFE6BB; }

.notif-mute-bar-actions { display:flex;align-items:center;gap:8px;padding-top:14px;border-top:1px dashed var(--border);margin-top:8px;flex-wrap:wrap; }
.notif-mute-label { font-size:11px;color:var(--text-lt);margin-right:auto; }
.notif-mute-btn { background:transparent;border:1px solid var(--border);color:var(--text-md);padding:5px 12px;border-radius:100px;font-size:11px;cursor:pointer;font-family:inherit;transition:all .15s; }
.notif-mute-btn:hover { border-color:var(--rose);color:var(--rose);background:var(--rose-lt); }
`
