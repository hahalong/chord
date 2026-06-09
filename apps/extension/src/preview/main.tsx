/**
 * Chord 隐性自我 v3.1 · Preview 工具
 *
 * 跑法：pnpm dev → http://localhost:5173/src/preview/index.html
 *   - 无参数 → 显示 case 列表
 *   - ?case=case-001-hoarder-min → 显示该 case 的 Profile 页
 */

// ★ 必须最先 import：把 chrome global shim 注入到 window
import './mockChrome.js'

import { render } from 'preact'
import { signal, computed } from '@preact/signals'
import { injectMockData, resetMockData } from './mockChrome.js'
import { CASES, type CaseDef } from './cases.js'
import { generateMockData } from './factory.js'
import { Profile } from '../options/pages/Profile.js'
import { SHARED_CSS } from '../options/shared-css.js'
import { applySkin } from '../skin.js'
// v3.1.25 · 跨段 audit 工具
import { auditAllCases, type CaseAuditReport } from './case-audit.js'

// 全部 case 的 audit 报告（启动时一次性算）
const auditReports = signal<Map<string, CaseAuditReport>>(new Map())
auditAllCases(CASES).then((reports) => {
  auditReports.value = reports
  const failCount = [...reports.values()].filter((r) => !r.ok).length
  console.log(`[Audit] ${reports.size} cases checked, ${failCount} with warnings`)
})

const INDEX_CSS = `
  body { margin:0; font-family:'Noto Sans SC','DM Sans',-apple-system,sans-serif; background:#FFFCFA; color:#2A1520; }
  .preview-index { max-width:980px; margin:0 auto; padding:32px 24px 80px; }
  .preview-head h1 { font-family:'DM Serif Display','Noto Sans SC',serif; font-size:28px; margin:0 0 6px; }
  .preview-sub { color:#7A5560; font-size:13px; margin:0 0 24px; }
  .preview-section { margin-top:28px; }
  .preview-section h2 { font-family:'DM Serif Display',serif; font-size:18px; color:#D9706A; margin:0 0 10px; padding-bottom:6px; border-bottom:1px solid #F0E0DF; }
  .preview-list { list-style:none; padding:0; margin:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:8px; }
  .preview-list a { display:flex; flex-direction:column; gap:3px; padding:10px 12px; background:#fff; border:1px solid #F0E0DF; border-radius:8px; text-decoration:none; color:#2A1520; transition:all 150ms; }
  .preview-list a:hover { border-color:#D9706A; background:#FDF0EF; }
  .preview-id { font-family:'DM Mono',monospace; font-size:10px; color:#B89098; }
  .preview-name { font-size:13px; font-weight:500; }
  .preview-expected { font-size:11px; color:#7A5560; font-family:'DM Mono',monospace; }
  .preview-foot { margin-top:40px; padding-top:16px; border-top:1px solid #F0E0DF; color:#B89098; font-size:11px; text-align:center; }
  /* v3.1.25 · Audit badge */
  .audit-badge { display:inline-flex; align-items:center; gap:3px; font-size:10px; padding:2px 6px; border-radius:8px; font-family:'DM Mono',monospace; margin-left:auto; }
  .audit-badge-ok { background:#E8F5E9; color:#3C8C4F; }
  .audit-badge-warn { background:#FDF0EF; color:#D9706A; border:1px solid #F5C0BE; }
  .audit-badge-loading { background:#F5F0EE; color:#B89098; }
  .preview-list a { position:relative; }
  .preview-list a .preview-name-row { display:flex; align-items:center; gap:6px; }
  .audit-summary { margin:16px 0 24px; padding:12px 14px; background:#FDF0EF; border-radius:8px; border:1px solid #F5C0BE; font-size:12px; color:#7A5560; }
  .audit-summary strong { color:#D9706A; }
`

const CASE_CSS = `
  body { margin:0; font-family:'Noto Sans SC','DM Sans',-apple-system,sans-serif; background:#FFFCFA; color:#2A1520; }
  .case-topbar { position:sticky; top:0; z-index:100; display:flex; align-items:center; gap:16px; padding:10px 20px; background:#fff; border-bottom:1px solid #F0E0DF; box-shadow:0 1px 4px rgba(0,0,0,.04); }
  .case-back { color:#7A5560; text-decoration:none; font-size:13px; }
  .case-back:hover { color:#D9706A; }
  .case-title { flex:1; font-size:13px; }
  .case-title code { font-family:'DM Mono',monospace; font-size:11px; color:#B89098; margin-right:8px; }
  .case-expected { font-size:11px; color:#7A5560; font-family:'DM Mono',monospace; background:#FDF0EF; padding:3px 8px; border-radius:10px; }
  .case-body { padding:0; }
  /* v3.1.25 · Audit detail */
  .audit-detail { margin:12px 20px 0; padding:10px 14px; border-radius:8px; font-size:12px; line-height:1.6; }
  .audit-detail-ok { background:#E8F5E9; color:#3C8C4F; border:1px solid #C8E6CB; }
  .audit-detail-warn { background:#FDF0EF; color:#7A5560; border:1px solid #F5C0BE; }
  .audit-detail-head { font-weight:600; color:#D9706A; margin-bottom:6px; }
  .audit-detail ul { margin:0; padding-left:20px; }
  .audit-detail li { margin:3px 0; }
  .audit-detail code { font-family:'DM Mono',monospace; background:#fff; padding:1px 5px; border-radius:3px; color:#D9706A; font-size:11px; }
  .audit-detail em { color:#B89098; font-style:italic; }
  .audit-meta { margin-top:8px; padding-top:8px; border-top:1px dashed rgba(0,0,0,.08); font-size:11px; color:#B89098; font-family:'DM Mono',monospace; }
  .audit-meta code { background:rgba(217,112,106,.08); padding:1px 5px; border-radius:3px; color:#D9706A; font-size:10px; }
`

// 应用默认皮肤
applySkin('g-pink')

// 注入 options 共享 CSS（Profile 依赖这些 class 才能正确渲染）
{
  const style = document.createElement('style')
  style.textContent = SHARED_CSS
  document.head.appendChild(style)
}

// Hash-based routing
const hash = signal(window.location.hash || '')
// Profile 内部用 signal 缓存身份卡，hash 切换时单纯 re-render 不足以触发重算 →
// 简化做法：切 case 时硬刷新页面，让所有 storage 读取走重新加载流程
window.addEventListener('hashchange', () => {
  if (hash.value !== window.location.hash) {
    location.reload()
  }
})

const currentCase = computed<CaseDef | null>(() => {
  const m = hash.value.match(/#case=([\w-]+)/)
  if (!m) return null
  return CASES.find((c) => c.id === m[1]) ?? null
})

// 注入 mock 数据
function loadCase(caseDef: CaseDef) {
  resetMockData()
  const data = generateMockData(caseDef.spec)
  injectMockData(data)
  console.log('[Preview] Loaded case:', caseDef.id, {
    items: data.chord_items.length,
    clusters: data.chord_clusters.length,
  })
}

function CaseIndex() {
  // 按 category 分组
  const grouped = new Map<string, CaseDef[]>()
  for (const c of CASES) {
    const arr = grouped.get(c.category) ?? []
    arr.push(c)
    grouped.set(c.category, arr)
  }

  const reports = auditReports.value
  const totalCases = CASES.length
  const checkedCases = reports.size
  const failedCases = [...reports.values()].filter((r) => !r.ok).length

  return (
    <div class="preview-index">
      <header class="preview-head">
        <h1>Chord 隐性自我 v3.1 · 用例预览</h1>
        <p class="preview-sub">
          共 {totalCases} 个 case · 点击进入查看 Profile 渲染效果
        </p>
      </header>
      {/* v3.1.25 · 跨段 audit summary */}
      {checkedCases > 0 && (
        <div class="audit-summary">
          🛡️ <strong>跨段 audit</strong>：检查了 {checkedCases} / {totalCases} 个 case，
          {failedCases === 0
            ? <> 全部 <strong>✅ 通过</strong>（无身份矛盾词，expected 匹配实际）</>
            : <> <strong>⚠️ {failedCases} 个</strong> 有 warning（点击 case 查看详情）</>}
        </div>
      )}
      {[...grouped.entries()].map(([cat, cases]) => (
        <section class="preview-section" key={cat}>
          <h2>{cat}（{cases.length} 个）</h2>
          <ul class="preview-list">
            {cases.map((c) => {
              const report = reports.get(c.id)
              return (
                <li key={c.id}>
                  <a href={`#case=${c.id}`}>
                    <code class="preview-id">{c.id}</code>
                    <div class="preview-name-row">
                      <span class="preview-name">{c.name}</span>
                      {report ? (
                        report.ok
                          ? <span class="audit-badge audit-badge-ok" title="跨段 audit 通过">✓</span>
                          : <span class="audit-badge audit-badge-warn" title={auditTooltip(report)}>⚠ {report.totalWarnings}</span>
                      ) : (
                        <span class="audit-badge audit-badge-loading">…</span>
                      )}
                    </div>
                    <span class="preview-expected">
                      {[
                        c.expected.consumption,
                        c.expected.mindset,
                        c.expected.radius,
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      <footer class="preview-foot">
        <p>下方主体由真实的 Profile 组件渲染 · mock 数据通过 MockStorageAdapter 注入</p>
      </footer>
      <style>{INDEX_CSS}</style>
    </div>
  )
}

function auditTooltip(report: CaseAuditReport): string {
  const lines: string[] = []
  if (report.consumptionMatch !== 'match') {
    lines.push(`Consumption: expected=${report.expectedConsumption ?? 'null'}, actual=${report.actualConsumption ?? 'null'}`)
  }
  if (report.mindsetMatch !== 'match') {
    lines.push(`Mindset: expected=${report.expectedMindset ?? 'null'}, actual=${report.actualMindset ?? 'null'}`)
  }
  if (report.radiusMatch !== 'match') {
    lines.push(`Radius: expected=${report.expectedRadius ?? 'null'}, actual=${report.actualRadius ?? 'null'}`)
  }
  if (report.violations.length > 0) {
    lines.push(`Banned words (${report.violations.length}):`)
    for (const v of report.violations.slice(0, 3)) {
      lines.push(`  · ${v.section}: "${v.bannedWord}"`)
    }
    if (report.violations.length > 3) lines.push(`  · ... 还有 ${report.violations.length - 3} 个`)
  }
  return lines.join('\n')
}

function CasePreview({ caseDef }: { caseDef: CaseDef }) {
  // 加载 case 数据（每次 caseDef 变化时重新加载）
  loadCase(caseDef)

  // preview 验收模式：自动点击"继续 ↓"直到展开全部段
  // 因为 review 时要一眼看完整页，不让你手点 5 次
  if (!(window as unknown as { __previewExpanded?: boolean }).__previewExpanded) {
    ;(window as unknown as { __previewExpanded?: boolean }).__previewExpanded = true
    setTimeout(() => {
      let clicks = 0
      const interval = setInterval(() => {
        const btn = document.querySelector<HTMLButtonElement>('.seg-next-btn')
        if (!btn || clicks >= 10) {
          clearInterval(interval)
          return
        }
        btn.click()
        clicks++
      }, 300)  // 300ms per click，给 Preact 充分 reflow 时间
    }, 1200)  // 等 Profile mount + storage 读完
  }

  return (
    <div class="case-preview">
      <div class="case-topbar">
        <a class="case-back" href="#">← 返回列表</a>
        <span class="case-title">
          <code>{caseDef.id}</code> · {caseDef.name}
        </span>
        <span class="case-expected">
          预期: {[
            caseDef.expected.consumption,
            caseDef.expected.mindset,
            caseDef.expected.radius,
          ].filter(Boolean).join(' · ')}
        </span>
      </div>
      {/* v3.1.25 · 跨段 audit 详情 */}
      <AuditDetail caseId={caseDef.id} />
      <div class="case-body">
        <Profile />
      </div>
      <style>{CASE_CSS}</style>
    </div>
  )
}

function AuditDetail({ caseId }: { caseId: string }) {
  const report = auditReports.value.get(caseId)
  if (!report) return null
  if (report.ok) {
    return (
      <div class="audit-detail audit-detail-ok">
        🛡️ 跨段 audit: <strong>✓ 通过</strong>（身份匹配、§5 走专属模板、无矛盾词）
        <div class="audit-meta">
          §5 模板: <code>{report.guidanceTemplateKey}</code>
          {report.insightTemplates.length > 0 && <> · §2 触发: <code>{report.insightTemplates.join(', ')}</code></>}
          {report.changeKinds.length > 0 && <> · §4 触发: <code>{report.changeKinds.join(', ')}</code></>}
        </div>
      </div>
    )
  }
  return (
    <div class="audit-detail audit-detail-warn">
      <div class="audit-detail-head">⚠️ 跨段 audit · {report.totalWarnings} 个 warning</div>
      <ul>
        {report.consumptionMatch !== 'match' && (
          <li>
            <strong>Consumption</strong>: expected <code>{report.expectedConsumption ?? 'null'}</code>，
            actual <code>{report.actualConsumption ?? 'null'}</code> ({report.consumptionMatch})
          </li>
        )}
        {report.mindsetMatch !== 'match' && (
          <li>
            <strong>Mindset</strong>: expected <code>{report.expectedMindset ?? 'null'}</code>，
            actual <code>{report.actualMindset ?? 'null'}</code> ({report.mindsetMatch})
          </li>
        )}
        {report.radiusMatch !== 'match' && (
          <li>
            <strong>Radius</strong>: expected <code>{report.expectedRadius ?? 'null'}</code>，
            actual <code>{report.actualRadius ?? 'null'}</code> ({report.radiusMatch})
          </li>
        )}
        {report.guidanceFellThrough && (
          <li>
            <strong>§5 模板</strong>: 走到了 <code>UNIVERSAL_FALLBACK</code>——
            这个身份组合没有专属模板，所有用户看到同一段文案。建议补 stopped/returning 层或 primary
          </li>
        )}
        {report.violations.map((v, i) => (
          <li key={i}>
            <strong>{v.section}</strong> 出现禁词 <code>"{v.bannedWord}"</code>: <em>{v.context}</em>
          </li>
        ))}
      </ul>
      <div class="audit-meta">
        §5 模板: <code>{report.guidanceTemplateKey}</code>
        {report.insightTemplates.length > 0 && <> · §2 触发: <code>{report.insightTemplates.join(', ')}</code></>}
        {report.changeKinds.length > 0 && <> · §4 触发: <code>{report.changeKinds.join(', ')}</code></>}
      </div>
    </div>
  )
}

function App() {
  const c = currentCase.value
  return c ? <CasePreview caseDef={c} /> : <CaseIndex />
}

render(<App />, document.getElementById('app')!)
