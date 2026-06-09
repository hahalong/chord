import { useEffect, useState } from 'preact/hooks'
import { ChromeStorageAdapter } from '../../storage/ChromeStorageAdapter.js'
import { ClusterService, buildEngine } from '@chord/core'
import { PROVIDERS, BUNDLED_AI_AVAILABLE } from '../aiProviders.js'
import { applySkin } from '../../skin.js'
import type { UserSettings, ResurfaceFreq, BadgeMode, NotificationSettings } from '@chord/types'
import { DEFAULT_NOTIFICATIONS } from '@chord/types'

const adapter = new ChromeStorageAdapter()

const FREQ_OPTIONS: { id: ResurfaceFreq; label: string }[] = [
  { id: 'daily',  label: '每天' },
  { id: 'weekly', label: '每周' },
  { id: 'off',    label: '关闭' },
]

const SKINS: { id: string; label: string; rose: string; bg: string }[] = [
  { id: 'g-pink',   label: 'G 浮云·粉',  rose: '#D9706A', bg: '#FFFCFA' },
  { id: 'g-lav',    label: 'G 浮云·紫',  rose: '#7C6FD4', bg: '#FDFCFF' },
  { id: 'g-sky',    label: 'G 浮云·蓝',  rose: '#4F89B8', bg: '#FAFCFF' },
  { id: 'g-sage',   label: 'G 浮云·绿',  rose: '#5A9070', bg: '#FAFCFA' },
  { id: 'g-amber',  label: 'G 浮云·橙',  rose: '#C47C3A', bg: '#FFFDF8' },
  { id: 'g-slate',  label: 'G 浮云·墨',  rose: '#505870', bg: '#FAFBFC' },
]

function maskKey(key: string): string {
  if (!key || key.length < 8) return '••••••••'
  return key.slice(0, 4) + '••••••••' + key.slice(-4)
}

export function Settings() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [reclustering, setReclustering] = useState(false)
  const [reclusterDone, setReclusterDone] = useState(false)
  const [skinModal, setSkinModal] = useState(false)
  const [pinging, setPinging] = useState(false)
  const [pingResult, setPingResult] = useState<{ ok: boolean; error?: string; detail?: string } | null>(null)

  useEffect(() => {
    adapter.getSettings().then((s) => {
      setSettings(s)
      // 读取当前 provider 对应的 Key（chord_bundled 不在字典里，input 不展示）
      const provider = s.aiEngine.provider
      const currentKey = provider && provider !== 'chord_bundled'
        ? (s.aiEngine.providerKeys?.[provider] ?? '')
        : ''
      setKeyInput(currentKey)
    })
  }, [])

  if (!settings) return <div class="settings-loading">加载中…</div>

  const ai = settings.aiEngine
  // 当前 provider 对应的 Key（不再用 settings.aiEngine.apiKey——那是 runtime 计算的）
  const currentProviderKey = ai.provider && ai.provider !== 'chord_bundled'
    ? (ai.providerKeys?.[ai.provider] ?? '')
    : ''

  async function patch(update: Partial<UserSettings>) {
    await adapter.putSettings(update)
    const next = { ...settings!, ...update }
    setSettings(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // 切换 provider 时同步把对应 provider 的 Key 写到输入框
  async function switchProvider(newProvider: typeof ai.provider) {
    if (!newProvider) return
    const stored = ai.providerKeys?.[newProvider] ?? ''
    setKeyInput(stored)
    setPingResult(null)
    setEditingKey(false)
    await patch({ aiEngine: { ...ai, provider: newProvider } })
  }

  async function saveKey() {
    const trimmed = keyInput.trim()
    const provider = ai.provider
    if (!provider || provider === 'chord_bundled') {
      setEditingKey(false)
      return
    }
    const prevKey = ai.providerKeys?.[provider] ?? ''
    const becomingActive = !prevKey && !!trimmed
    await patch({
      aiEngine: {
        ...ai,
        providerKeys: { ...(ai.providerKeys ?? {}), [provider]: trimmed },
        // 首次写入 Key → 自动 flip 到 AI 模式
        ...(becomingActive ? { mode: 'ai' as const } : {}),
      },
    })
    setEditingKey(false)
    if (becomingActive) {
      setReclustering(true)
      setReclusterDone(false)
      try {
        const fresh = await adapter.getSettings()
        await ClusterService.recluster(adapter, buildEngine(fresh.aiEngine))
        setReclusterDone(true)
        setTimeout(() => setReclusterDone(false), 6000)
      } catch (err) {
        console.error('AI recluster failed:', err)
      } finally {
        setReclustering(false)
      }
    }
  }

  async function testConnection() {
    if (pinging) return
    setPinging(true)
    setPingResult(null)
    try {
      // 用最新的 settings（包含 resolveApiKey 注入的 apiKey）构建 engine
      const fresh = await adapter.getSettings()
      if (!fresh.aiEngine.apiKey) {
        setPingResult({ ok: false, error: '当前 provider 没有可用的 Key' })
        return
      }
      const engine = buildEngine(fresh.aiEngine)
      // buildEngine 可能返回 TFIDFEngine（无 ping）；只有 OpenAICompatibleEngine 才有 ping
      if (typeof (engine as { ping?: () => unknown }).ping === 'function') {
        const r = await (engine as { ping: () => Promise<{ ok: boolean; error?: string; detail?: string }> }).ping()
        setPingResult(r)
      } else {
        setPingResult({ ok: false, error: '当前模式不支持检测（离线模式无 API 调用）' })
      }
    } catch (e) {
      setPingResult({ ok: false, error: (e as Error).message })
    } finally {
      setPinging(false)
      // 5 秒后清空提示
      setTimeout(() => setPingResult(null), 6000)
    }
  }

  function scrollToProvider() {
    document.querySelector('.provider-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div class="settings-wrap">
      <h2 class="settings-title">设置</h2>

      {ai.mode === 'offline' && (
        <button class="upgrade-banner" onClick={scrollToProvider}>
          <span class="ub-text">
            <span class="ub-title">升级聚类准确度</span>
            <span class="ub-sub">3 步设置免费 API Key，分类按真实内容主题</span>
          </span>
          <span class="ub-arrow">→</span>
        </button>
      )}

      {/* ── AI 引擎 ── */}
      <section class="settings-section">
        <div class="ss-header">
          <span class="ss-label">AI 引擎</span>
          <span class="ss-desc">用于生成回响问句和内容聚类</span>
        </div>

        <div class="mode-cards">
          <button
            class={`mode-card ${ai.mode === 'offline' ? 'mode-active' : ''}`}
            onClick={() => patch({ aiEngine: { ...ai, mode: 'offline' } })}
          >
            <span class="mc-label">离线模式</span>
            <span class="mc-desc">TF-IDF 算法，无需 API Key，完全本地</span>
          </button>
          <button
            class={`mode-card ${ai.mode === 'ai' ? 'mode-active' : ''}`}
            onClick={() => patch({ aiEngine: { ...ai, mode: 'ai' } })}
          >
            <span class="mc-label">AI 模式</span>
            <span class="mc-desc">接入大模型，问句更个人化，聚类更准确</span>
          </button>
        </div>

        {ai.mode === 'ai' && (
          <div class="ai-config">
            {/* Provider */}
            <div class="cfg-row">
              <label class="cfg-key">服务商</label>
              <div class="provider-grid">
                {PROVIDERS
                  // 只有编译期注入了 token 时才显示「Chord 内置 AI」选项
                  .filter((p) => p.id !== 'chord_bundled' || BUNDLED_AI_AVAILABLE)
                  .map((p) => (
                    <button
                      key={p.id}
                      class={`provider-btn ${ai.provider === p.id ? 'prov-active' : ''}`}
                      onClick={() => switchProvider(p.id)}
                    >
                      <span class="prov-label">{p.label}</span>
                      {p.free && <span class="prov-free-badge">免费</span>}
                    </button>
                  ))}
              </div>
              {ai.provider !== 'chord_bundled' && ai.provider && PROVIDERS.find((p) => p.id === ai.provider)?.signupUrl && (
                <div class="provider-signup">
                  <a
                    href={PROVIDERS.find((p) => p.id === ai.provider)!.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="signup-link"
                  >
                    → 免费注册获取 API Key（无需信用卡）
                  </a>
                </div>
              )}
              <p class="provider-hint">{PROVIDERS.find((p) => p.id === ai.provider)?.hint ?? ''}</p>
            </div>

            {/* 当用户选择 chord_bundled 时，告知数据流向，不要 Key 输入 */}
            {ai.provider === 'chord_bundled' && (
              <div class="cfg-row">
                <div class="bundled-notice">
                  <div class="bn-title">已为你接入免费 AI</div>
                  <div class="bn-desc">
                    Chord 内置一个免费的智谱 GLM-4-Flash 接口，开箱可用。<br/>
                    <strong>会发送给智谱</strong>：你的收藏标题（用于主题分析）<br/>
                    <strong>不会发送</strong>：私人注释 · URL · 决策记录 · 用户身份
                  </div>
                  <div class="bn-hint">想换更强的模型？选其他服务商即可。</div>
                </div>
              </div>
            )}

            {/* ★ API Key 缺失警告（非 chord_bundled 且 key 空时显著提醒） */}
            {ai.provider && ai.provider !== 'chord_bundled' && !currentProviderKey && (
              <div class="cfg-row">
                <div class="key-missing-warn" style="background:#FDF0EF;border:1px solid #D9706A;border-radius:8px;padding:12px 14px;color:#9A3A35">
                  <div style="font-weight:600;margin-bottom:4px">⚠️ 当前服务商未配置 API Key</div>
                  <div style="font-size:13px;line-height:1.6">
                    AI 调用会失败 → 聚类会卡在原来的结果（不再静默降级到本地算法）。<br/>
                    请在下方<strong>「API Key · 设置」</strong>填入 Key，或选择 <strong>Chord 内置 AI（免费）</strong>。
                  </div>
                </div>
              </div>
            )}

            {/* API Key（chord_bundled 不需要） */}
            {ai.provider !== 'chord_bundled' && (
            <div class="cfg-row">
              <label class="cfg-key">API Key</label>
              {editingKey ? (
                <div class="key-edit-row">
                  <input
                    class="key-input"
                    type={showKey ? 'text' : 'password'}
                    value={keyInput}
                    onInput={(e) => setKeyInput((e.target as HTMLInputElement).value)}
                    placeholder="sk-..."
                  />
                  <button class="key-toggle" onClick={() => setShowKey(!showKey)}>{showKey ? '隐藏' : '显示'}</button>
                  <button class="key-save" onClick={saveKey}>保存</button>
                  <button class="key-cancel" onClick={() => { setEditingKey(false); setKeyInput(currentProviderKey) }}>取消</button>
                </div>
              ) : (
                <div class="key-display-row">
                  <span class="key-masked">{currentProviderKey ? maskKey(currentProviderKey) : '未设置'}</span>
                  <button class="key-edit-btn" onClick={() => setEditingKey(true)}>
                    {currentProviderKey ? '修改' : '设置'}
                  </button>
                  {currentProviderKey && (
                    <button
                      class="key-test-btn"
                      onClick={testConnection}
                      disabled={pinging}
                      title="发一次最小调用验证 Key 和接口"
                    >
                      {pinging ? '检测中…' : '测试连接'}
                    </button>
                  )}
                </div>
              )}
              {pingResult && (
                <div class={`ping-result ${pingResult.ok ? 'ping-ok' : 'ping-fail'}`}>
                  {pingResult.ok
                    ? <>✓ 连接正常{pingResult.detail ? `（${pingResult.detail}）` : ''}</>
                    : <>✗ {pingResult.error}</>}
                </div>
              )}
            </div>
            )}

            {/* Custom base URL (only for 'custom' provider) */}
            {ai.provider === 'custom' && (
              <div class="cfg-row">
                <label class="cfg-key">接口地址</label>
                <input
                  class="url-input"
                  type="url"
                  value={ai.baseUrl ?? ''}
                  placeholder="https://your-proxy/v1"
                  onBlur={(e) => patch({ aiEngine: { ...ai, baseUrl: (e.target as HTMLInputElement).value } })}
                />
              </div>
            )}

            {/* Model override */}
            <div class="cfg-row">
              <label class="cfg-key">模型（可选）</label>
              <input
                class="url-input"
                type="text"
                value={ai.model ?? ''}
                placeholder={ai.provider ? '留空使用默认模型' : '先选择服务商'}
                onBlur={(e) => patch({ aiEngine: { ...ai, model: (e.target as HTMLInputElement).value || undefined } })}
              />
            </div>

            <p class="ai-note">API Key 仅存储在本地，不经过 Chord 服务器。请确认已向对应服务商申请访问权限。</p>
          </div>
        )}
      </section>

      {/* ── 回响时间 ── */}
      <section class="settings-section">
        <div class="ss-header">
          <span class="ss-label">回响时间</span>
          <span class="ss-desc">每天何时唤醒一条收藏</span>
        </div>

        <div class="time-row">
          <div class="freq-chips">
            {FREQ_OPTIONS.map((f) => (
              <button
                key={f.id}
                class={`freq-chip ${settings.resurfaceFreq === f.id ? 'freq-active' : ''}`}
                onClick={() => patch({ resurfaceFreq: f.id })}
              >{f.label}</button>
            ))}
          </div>
          {settings.resurfaceFreq !== 'off' && (
            <input
              class="time-input"
              type="time"
              value={settings.resurfaceTime}
              onBlur={(e) => patch({ resurfaceTime: (e.target as HTMLInputElement).value })}
            />
          )}
        </div>
      </section>

      {/* ── 皮肤 ── */}
      <section class="settings-section">
        <div class="ss-header">
          <span class="ss-label">皮肤</span>
          <span class="ss-desc">G 浮云系列</span>
        </div>

        <div class="skin-current-row">
          <div class="skin-current-info">
            <span class="skin-swatch-lg" style={{ background: SKINS.find((s) => s.id === settings.skinId)?.rose ?? '#D9706A' }} />
            <span class="skin-current-name">{SKINS.find((s) => s.id === settings.skinId)?.label ?? '未知皮肤'}</span>
          </div>
          <button class="skin-change-btn" onClick={() => setSkinModal(true)}>换一身皮肤 →</button>
        </div>
      </section>

      {/* ── 皮肤 modal（全屏 overlay）── */}
      {skinModal && (
        <div class="skin-modal-backdrop" onClick={() => setSkinModal(false)}>
          <div class="skin-modal" onClick={(e) => e.stopPropagation()}>
            <button class="skin-modal-close" onClick={() => setSkinModal(false)}>×</button>
            <h2 class="skin-modal-title">换一身皮肤</h2>
            <p class="skin-modal-sub">G 浮云系列 · 6 款预设</p>
            <div class="skin-modal-grid">
              {SKINS.map((s) => (
                <button
                  key={s.id}
                  class={`skin-modal-card ${settings.skinId === s.id ? 'skin-modal-active' : ''}`}
                  onClick={() => {
                    // 双保险：先同步应用 CSS 变量（立即视觉反馈），再异步写 storage（其他页面订阅更新）
                    applySkin(s.id)
                    patch({ skinId: s.id })
                  }}
                >
                  <span class="skin-modal-swatch" style={{ background: s.rose }} />
                  <span class="skin-modal-bg" style={{ background: s.bg }} />
                  <span class="skin-modal-name">{s.label}</span>
                  {settings.skinId === s.id && (
                    <span class="skin-modal-check" style={{ color: s.rose }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><use href="#icon-check-sm" /></svg>
                      使用中
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 数据修复 · v3.1.28-2 · 修 import 时 dateAdded 丢失的 bug ── */}
      <SavedAtFixSection />

      {/* ── 数据管理 ── */}
      <section class="settings-section">
        <div class="ss-header">
          <span class="ss-label">数据管理</span>
        </div>
        <div class="data-actions">
          <button class="data-btn" onClick={handleExport}>导出数据 (JSON)</button>
          <button class="data-btn data-danger" onClick={handleDeleteAll}>清空所有数据</button>
        </div>
        <p class="data-note">导出包含书房所有内容和事件日志（不含私人注释明文）。清空操作不可撤销。</p>
        <a href="#privacy" class="privacy-link">隐私声明 →</a>
      </section>

      {/* ── 主动出现系统（Phase 1）── */}
      <NotificationSection settings={settings} patch={patch} />

      {/* ── v2 二向决策：放手设置 ── */}
      <section class="rs-section">
        <div class="rs-section-title">放手设置</div>
        <div class="rs-section-sub">放手时是否也从 Chrome 书签里删除该条目</div>
        <div class="rs-radio-row">
          <label class="rs-radio-label">
            <input
              type="radio"
              name="release-bookmark"
              checked={(settings.releaseAlsoDeletesBookmark ?? 'ask') === 'ask'}
              onChange={() => patch({ releaseAlsoDeletesBookmark: 'ask' })}
            />
            <span>
              每次询问
              <div class="rs-radio-hint">每次放手时都问一次（推荐）</div>
            </span>
          </label>
          <label class="rs-radio-label">
            <input
              type="radio"
              name="release-bookmark"
              checked={settings.releaseAlsoDeletesBookmark === 'always'}
              onChange={() => patch({ releaseAlsoDeletesBookmark: 'always' })}
            />
            <span>
              始终也删 Chrome 书签
              <div class="rs-radio-hint">「放手」= 彻底告别</div>
            </span>
          </label>
          <label class="rs-radio-label">
            <input
              type="radio"
              name="release-bookmark"
              checked={settings.releaseAlsoDeletesBookmark === 'never'}
              onChange={() => patch({ releaseAlsoDeletesBookmark: 'never' })}
            />
            <span>
              永不删 Chrome 书签
              <div class="rs-radio-hint">「放手」只从 Chord 移出，浏览器保留</div>
            </span>
          </label>
        </div>
      </section>

      {saved && <div class="settings-saved">✓ 已保存</div>}
      {reclustering && (
        <div class="settings-saved settings-recluster">正在用 AI 重新整理你的兴趣地形…</div>
      )}
      {reclusterDone && (
        <a class="settings-saved settings-recluster-done" href="#terrain">
          ✓ 已用 AI 重聚类，去看看 →
        </a>
      )}
    </div>
  )

  async function handleExport() {
    const [items, events, clusters] = await Promise.all([
      adapter.getItems(),
      adapter.getEvents(),
      adapter.getClusters(),
    ])
    const blob = new Blob([JSON.stringify({ items, events, clusters, exportedAt: Date.now() }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chord-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleDeleteAll() {
    if (!confirm('确定要清空所有书房数据吗？此操作不可撤销。')) return
    const items = await adapter.getItems()
    await adapter.batch(items.map((i) => ({ op: 'delete_item' as const, id: i.id })))
    alert('已清空。')
  }
}

// ─── 主动出现系统：通知设置 section（Phase 1）──────────────
function NotificationSection({
  settings,
  patch,
}: {
  settings: UserSettings
  patch: (u: Partial<UserSettings>) => Promise<void>
}) {
  const notif: NotificationSettings = settings.notifications ?? DEFAULT_NOTIFICATIONS

  function patchNotif(u: Partial<NotificationSettings>) {
    patch({ notifications: { ...notif, ...u } })
  }

  async function muteFor(hours: number) {
    const until = Date.now() + hours * 3600_000
    await patchNotif({ muteUntil: until })
  }

  function unmute() {
    patchNotif({ muteUntil: undefined })
  }

  const isMuted = notif.muteUntil && notif.muteUntil > Date.now()

  return (
    <section class="rs-section">
      <div class="rs-section-title">Chord 怎么跟你打招呼</div>
      <div class="rs-section-sub">主动出现 ≠ 打扰。所有通道独立可控，紧急时一键全静音。</div>

      {/* ── 静音状态条 ── */}
      {isMuted && (
        <div class="notif-mute-bar">
          <span>🔇 全部通知已静音到 {new Date(notif.muteUntil!).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</span>
          <button class="notif-mute-undo" onClick={unmute}>取消静音</button>
        </div>
      )}

      {/* ── Layer 0: Badge ── */}
      <div class="notif-block">
        <div class="notif-block-title">📍 扩展图标 Badge</div>
        <div class="notif-block-desc">在工具栏 Chord 图标上显示有几条想跟你说话</div>
        <div class="notif-radio-row">
          {([
            { id: 'number', label: '数字', hint: '显示具体数字 1-9 / 9+' },
            { id: 'dot', label: '小红点', hint: '只显示一个点，不显示数字' },
            { id: 'off', label: '关闭', hint: '不显示 badge' },
          ] as { id: BadgeMode; label: string; hint: string }[]).map((opt) => (
            <label key={opt.id} class="notif-radio">
              <input
                type="radio"
                name="badge-mode"
                checked={notif.badgeMode === opt.id}
                onChange={() => patchNotif({ badgeMode: opt.id })}
              />
              <span>
                <span class="notif-radio-label">{opt.label}</span>
                <span class="notif-radio-hint">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Layer 2: 每日通知 ── */}
      <div class="notif-block">
        <div class="notif-block-title">🔔 每日唤醒</div>
        <div class="notif-block-desc">每天在你方便的时间发一条最值得回响的内容（智能跳过：4 小时内你已主动打开，或安静时段）</div>
        <label class="notif-toggle">
          <input
            type="checkbox"
            checked={notif.daily}
            onChange={(e) => patchNotif({ daily: (e.target as HTMLInputElement).checked })}
          />
          <span>启用每日唤醒通知</span>
        </label>

        <div class="notif-row">
          <label class="notif-toggle">
            <input
              type="checkbox"
              checked={notif.skipWeekend}
              onChange={(e) => patchNotif({ skipWeekend: (e.target as HTMLInputElement).checked })}
            />
            <span>周末跳过</span>
          </label>
        </div>

        <div class="notif-row">
          <span class="notif-row-label">安静时段</span>
          <select
            class="notif-select"
            value={notif.quietStart}
            onChange={(e) => patchNotif({ quietStart: Number((e.target as HTMLSelectElement).value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
          <span class="notif-row-sep">至</span>
          <select
            class="notif-select"
            value={notif.quietEnd}
            onChange={(e) => patchNotif({ quietEnd: Number((e.target as HTMLSelectElement).value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Layer 3: Echo Moment ── */}
      <div class="notif-block">
        <div class="notif-block-title">✨ Echo Moment（念念之响）</div>
        <div class="notif-block-desc">当某条收藏被你回访 3 / 7 / 15 / 30 次时，系统温柔地问一句。同一条 14 天冷却</div>
        <label class="notif-toggle">
          <input
            type="checkbox"
            checked={notif.echoMoment}
            onChange={(e) => patchNotif({ echoMoment: (e.target as HTMLInputElement).checked })}
          />
          <span>启用念念之响</span>
        </label>
      </div>

      {/* ── Layer 3.5: Milestone ── */}
      <div class="notif-block">
        <div class="notif-block-title">🎉 Milestone（仪式时刻）</div>
        <div class="notif-block-desc">收藏 100 / 500 / 1000 条 · streak 7 / 30 / 100 天 · 一辈子各发 1 次</div>
        <label class="notif-toggle">
          <input
            type="checkbox"
            checked={notif.milestone}
            onChange={(e) => patchNotif({ milestone: (e.target as HTMLInputElement).checked })}
          />
          <span>启用仪式时刻提醒</span>
        </label>
      </div>

      {/* ── Layer 4: Recall ── */}
      <div class="notif-block">
        <div class="notif-block-title">💌 重新召回</div>
        <div class="notif-block-desc">14 天没开 → 一条摘要；30 天没开 → 一条「我们想你」；60+ 天永远静默</div>
        <label class="notif-toggle">
          <input
            type="checkbox"
            checked={notif.recall}
            onChange={(e) => patchNotif({ recall: (e.target as HTMLInputElement).checked })}
          />
          <span>启用重新召回</span>
        </label>
      </div>

      {/* ── 紧急按钮 ── */}
      <div class="notif-mute-bar-actions">
        <span class="notif-mute-label">紧急静音</span>
        <button class="notif-mute-btn" onClick={() => muteFor(24)}>🔇 静音 24h</button>
        <button class="notif-mute-btn" onClick={() => muteFor(24 * 7)}>🔕 静音 1 周</button>
      </div>
    </section>
  )
}

// ─── v3.1.28-2 · 修复历史时间戳 ────────────────────────────
// 解决 v1 import 时 dateAdded 丢失 → 所有 bookmark 的 savedAt 被压缩成"导入那一刻" bug
// 用户视角：时间显示全错 / 焦虑沼泽 / 沉睡之地都不正确
// 触发：SW 用 chord_savedat_migrated_v2 flag 自动跑一次；这里给个手动重跑入口（force 模式）
function SavedAtFixSection() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ totalChecked: number; updated: number; oldestDaysAgo: number; newestDaysAgo: number } | null>(null)
  const [historyStatus, setHistoryStatus] = useState<{ at: number; updated: number; total: number; oldestDaysAgo?: number; newestDaysAgo?: number } | null>(null)

  // 读历史 migration 状态
  useEffect(() => {
    chrome.storage.local.get('chord_savedat_migrated_v2').then((data) => {
      setHistoryStatus(data['chord_savedat_migrated_v2'] ?? null)
    })
  }, [])

  async function handleRunFix() {
    setStatus('running')
    setResult(null)
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'FORCE_SAVEDAT_FIX' })
      if (resp?.error) {
        setStatus('error')
      } else {
        setResult(resp)
        setHistoryStatus({ at: Date.now(), updated: resp.updated, total: resp.totalChecked, oldestDaysAgo: resp.oldestDaysAgo, newestDaysAgo: resp.newestDaysAgo })
        setStatus('done')
      }
    } catch (e) {
      console.warn('FORCE_SAVEDAT_FIX failed', e)
      setStatus('error')
    }
  }

  return (
    <section class="settings-section">
      <div class="ss-header">
        <span class="ss-label">修复历史时间戳</span>
      </div>
      <p class="data-note" style="margin-top:0">
        如果你的"等待时长"显示不对（比如旧书签都显示 14 天前），是 v1 导入时 Chrome bookmark 的 dateAdded 没拿到。
        点击下面按钮会重新从 Chrome 书签 + 浏览历史拉真实时间，修正所有书签来源的 item。
        <br/>不影响主动保存的内容；不发任何网络请求。
      </p>
      <div class="data-actions">
        <button class="data-btn" onClick={handleRunFix} disabled={status === 'running'}>
          {status === 'running' ? '正在修复…' : '修复历史时间戳'}
        </button>
      </div>
      {status === 'done' && result && (
        <div class="data-fix-result">
          ✓ 修复完成 · 共检查 {result.totalChecked} 条 · 修正 {result.updated} 条<br/>
          最老 {result.oldestDaysAgo} 天前 / 最新 {result.newestDaysAgo} 天前
        </div>
      )}
      {status === 'error' && (
        <div class="data-fix-result data-fix-error">✗ 修复失败 · 看 Chrome 控制台报错</div>
      )}
      {status === 'idle' && historyStatus && historyStatus.updated > 0 && (
        <div class="data-fix-result data-fix-history">
          上次修复：{new Date(historyStatus.at).toLocaleString('zh-CN')} · 修正 {historyStatus.updated}/{historyStatus.total} 条
          {historyStatus.oldestDaysAgo != null && ` · 最老 ${historyStatus.oldestDaysAgo} 天前`}
        </div>
      )}
    </section>
  )
}
