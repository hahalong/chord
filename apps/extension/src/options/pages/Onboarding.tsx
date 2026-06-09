import { signal } from '@preact/signals'
import { ChromeStorageAdapter } from '../../storage/ChromeStorageAdapter.js'
import { ChordIcon } from '../../components/ChordIcon.js'
import { ONBOARDING_TOP_PROVIDERS, BUNDLED_AI_AVAILABLE } from '../aiProviders.js'
import type { AIProvider } from '@chord/types'

const adapter = new ChromeStorageAdapter()

type Step = 'storage' | 'ai_setup' | 'importing' | 'done'
const step = signal<Step>('storage')
const importProgress = signal(0)
const importTotal = signal(0)
const storageChoice = signal<'local' | 'cloud' | null>(null)
const selectedProvider = signal<AIProvider>('zhipu')
const keyInput = signal('')
const showCustom = signal(false)   // 「自己配 Key」展开

export function Onboarding() {
  async function chooseStorage(mode: 'local' | 'cloud') {
    storageChoice.value = mode
    await adapter.putSettings({ storageMode: mode })
    step.value = 'ai_setup'
  }

  async function saveAIAndContinue() {
    const trimmed = keyInput.value.trim()
    if (trimmed) {
      const settings = await adapter.getSettings()
      const provider = selectedProvider.value
      await adapter.putSettings({
        aiEngine: {
          ...settings.aiEngine,
          mode: 'ai',
          provider,
          providerKeys: { ...(settings.aiEngine.providerKeys ?? {}), [provider]: trimmed },
        },
      })
    }
    step.value = 'importing'
    await importBookmarks()
  }

  async function skipAI() {
    step.value = 'importing'
    await importBookmarks()
  }

  // 「就用 Chord 内置 AI」一键继续：ChromeStorageAdapter 首次初始化时已经设了
  // chord_bundled，这里不需要再写一次；直接进 importing
  async function useBundledAndContinue() {
    step.value = 'importing'
    await importBookmarks()
  }

  // 用户主动选择关闭 AI（完全离线）
  async function disableAIAndContinue() {
    const settings = await adapter.getSettings()
    await adapter.putSettings({
      aiEngine: { ...settings.aiEngine, mode: 'offline' },
    })
    step.value = 'importing'
    await importBookmarks()
  }

  async function importBookmarks() {
    const tree = await chrome.bookmarks.getTree()
    const urls = flattenBookmarks(tree)
    importTotal.value = urls.length

    // 并行批量查 chrome.history 取「最早访问时间」——比 bookmark.dateAdded 更准
    // 用户可能 2 年前就访问过这个页面，最近才加书签——以 history 最早访问为准
    const urlList = urls.filter((u) => u?.url).map((u) => u!.url)
    const earliestVisits = await ChromeStorageAdapter.getEarliestVisits(urlList)

    // Import in batches to avoid blocking
    for (let i = 0; i < urls.length; i++) {
      const bm = urls[i]
      const { ItemService, classifyURL, getFaviconUrl } = await import('@chord/core')
      const settings = await adapter.getSettings()
      const classification = classifyURL(bm.url, settings.domainPrefs)

      // 「原收藏时间」= min(bookmark.dateAdded, chrome.history 最早访问)
      const earliestVisit = earliestVisits.get(bm.url)
      let savedAt: number | undefined = bm.dateAdded
      if (typeof savedAt === 'number' && earliestVisit !== undefined) {
        savedAt = Math.min(savedAt, earliestVisit)
      } else if (earliestVisit !== undefined) {
        savedAt = earliestVisit
      }

      await ItemService.saveItem(
        adapter,
        {
          url: bm.url,
          title: bm.title,
          source: 'bookmark',
          favicon: getFaviconUrl(bm.url),
          type: classification.type === 'tool' ? 'tool' : 'content',
          savedAt,
        },
        { userId: settings.userId, deviceId: settings.deviceId },
      )
      importProgress.value = i + 1
      // yield to browser every 20 items
      if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0))
    }
    // 导入完成 → 立刻通知 SW 启动后台 recluster（不等 alarm 的 30s+ 延迟）
    // 用 PAGE_OPENED 消息触发 maybeRunBackgroundRecluster；UI 通过订阅
    // chord_recluster_status 显示进度，所以用户能看到「正在分析 N 条...」
    try {
      chrome.runtime.sendMessage({ type: 'PAGE_OPENED', page: 'onboarding_done' }).catch(() => {})
    } catch {}
    step.value = 'done'
  }

  if (step.value === 'storage') {
    return (
      <div class="ob-wrap">
        <div class="ob-logo">
          <svg viewBox="0 0 120 100" fill="none" width="56" height="56">
            <path d="M82 18 Q28 18 28 50 Q28 82 82 82" stroke="#D9706A" stroke-width="5" stroke-linecap="round"/>
            <path d="M82 34 Q44 34 44 50 Q44 66 82 66" stroke="#D9706A" stroke-width="2.5" stroke-linecap="round" opacity="0.4"/>
            <circle cx="87" cy="50" r="4" fill="#D9706A"/>
            <circle cx="99" cy="50" r="2.8" fill="#D9706A" opacity="0.65"/>
            <circle cx="109" cy="50" r="1.8" fill="#D9706A" opacity="0.35"/>
          </svg>
        </div>
        <h1 class="ob-title">回响，开始了</h1>
        <p class="ob-subtitle">在开始之前，请选择数据存储方式。</p>

        <div class="storage-cards">
          <button class="storage-card storage-card-recommend" onClick={() => chooseStorage('local')}>
            <span class="sc-recommend">推荐</span>
            <span class="sc-label">只存本地</span>
            <span class="sc-desc">数据只在你的电脑上，完全私密，无任何网络请求</span>
          </button>
          <button class="storage-card storage-card-cloud" onClick={() => chooseStorage('cloud')} disabled>
            <span class="sc-label">云端同步</span>
            <span class="sc-desc">多设备同步，需要登录账号（即将推出）</span>
          </button>
        </div>

        <p class="ob-note">可随时在设置中更改。导出数据和一键删除永久可用。</p>
      </div>
    )
  }

  if (step.value === 'ai_setup') {
    // 编译期注入了 token → 主推「Chord 内置 AI」；用户可展开「自己配 Key」或彻底关闭
    // 没注入 token → 走老流程（让用户自己配 Key 或跳过）
    if (BUNDLED_AI_AVAILABLE && !showCustom.value) {
      return (
        <div class="ob-wrap">
          <h1 class="ob-title">已为你接入免费 AI</h1>
          <p class="ob-subtitle">让分类按真实内容主题——不只是关键词堆积。</p>

          <div class="ob-bundled-card">
            <div class="ob-bundled-row">
              <span class="ob-bundled-icon">✦</span>
              <div class="ob-bundled-body">
                <div class="ob-bundled-name">Chord 内置 · 智谱 GLM-4-Flash</div>
                <div class="ob-bundled-sub">免费 · 无限额度 · 中文优化 · 开箱可用</div>
              </div>
            </div>
            <div class="ob-bundled-privacy">
              <div class="ob-pri-line"><strong>会发送给智谱</strong>：收藏标题（用于主题分析）</div>
              <div class="ob-pri-line"><strong>不会发送</strong>：私人注释 · URL · 决策记录 · 你的身份</div>
            </div>
          </div>

          <p class="ob-hint">想用自己的 Key（Claude / GPT / Gemini 等更强的模型），或者完全不联网，往下：</p>

          <div class="ob-actions ob-actions-stack">
            <button class="ob-next" onClick={useBundledAndContinue}>就用 Chord 免费 AI →</button>
            <button class="ob-secondary" onClick={() => { showCustom.value = true }}>用自己的 API Key</button>
            <button class="ob-tertiary" onClick={disableAIAndContinue}>完全离线（不联网，分类质量一般）</button>
          </div>
        </div>
      )
    }

    return (
      <div class="ob-wrap">
        <h1 class="ob-title">{BUNDLED_AI_AVAILABLE ? '用自己的 API Key' : '开启免费 AI 聚类'}</h1>
        <p class="ob-subtitle">让分类按真实内容主题，跨网站合并相似内容、同站不同主题分开。</p>

        <div class="ob-providers ob-providers-grid">
          {ONBOARDING_TOP_PROVIDERS.map((meta) => {
            const active = selectedProvider.value === meta.id
            return (
              <button
                key={meta.id}
                class={`ob-prov ${active ? 'ob-prov-active' : ''}`}
                onClick={() => { selectedProvider.value = meta.id }}
              >
                <span class="ob-prov-name">
                  {meta.label}
                  {meta.free && <span class="ob-prov-free">免费</span>}
                </span>
                <span class="ob-prov-tag">{meta.hint}</span>
                {meta.signupUrl && (
                  <a
                    class="ob-prov-signup"
                    href={meta.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { e.stopPropagation(); selectedProvider.value = meta.id }}
                  >
                    注册 →
                  </a>
                )}
              </button>
            )
          })}
        </div>

        <input
          class="ob-key-input"
          type="password"
          placeholder="粘贴 API Key（注册后在控制台生成）"
          value={keyInput.value}
          onInput={(e) => { keyInput.value = (e.target as HTMLInputElement).value }}
        />
        <p class="ob-hint">想用 Claude / GPT / Gemini 等服务？跳过此步，到「设置」里配置自己的 Key。</p>

        <div class="ob-actions">
          {BUNDLED_AI_AVAILABLE && (
            <button class="ob-skip" onClick={() => { showCustom.value = false }}>← 返回</button>
          )}
          <button class="ob-skip" onClick={skipAI}>稍后再说</button>
          <button
            class="ob-next"
            disabled={!keyInput.value.trim()}
            onClick={saveAIAndContinue}
          >
            启用 AI →
          </button>
        </div>
      </div>
    )
  }

  if (step.value === 'importing') {
    const pct = importTotal.value > 0 ? Math.round((importProgress.value / importTotal.value) * 100) : 0
    return (
      <div class="ob-wrap ob-center">
        <div class="ob-spinner" />
        <p class="ob-import-label">正在导入书签…</p>
        <p class="ob-import-count">{importProgress.value} / {importTotal.value}</p>
        <div class="ob-progress-bar">
          <div class="ob-progress-fill" style={`width:${pct}%`} />
        </div>
      </div>
    )
  }

  return (
    <div class="ob-wrap ob-center">
      <div class="ob-done-icon"><ChordIcon name="sakura" size={48} color="var(--rose)" /></div>
      <h2 class="ob-done-title">已就绪</h2>
      <p class="ob-done-msg">导入了 {importTotal.value} 条书签，今天的第一响已准备好。</p>
      <a class="ob-cta" href="#dashboard">进入候响室</a>
    </div>
  )
}

interface BMNode { url?: string; title: string; dateAdded?: number; children?: BMNode[] }

function flattenBookmarks(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
): { url: string; title: string; dateAdded?: number }[] {
  const result: { url: string; title: string; dateAdded?: number }[] = []
  function walk(node: BMNode) {
    if (node.url) result.push({ url: node.url, title: node.title, dateAdded: node.dateAdded })
    node.children?.forEach(walk)
  }
  nodes.forEach(walk)
  return result
}
