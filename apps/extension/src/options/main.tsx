import { render } from 'preact'
import { signal, computed } from '@preact/signals'
import { Onboarding } from './pages/Onboarding.js'
import { Dashboard } from './pages/Dashboard.js'
import { Process } from './pages/Process.js'
import { Terrain } from './pages/Terrain.js'
import { Profile } from './pages/Profile.js'
import { Weekly } from './pages/Weekly.js'
import { Settings } from './pages/Settings.js'
import { Privacy } from './pages/Privacy.js'
import { applySkin } from '../skin.js'
import { ReclusterStatusBar } from '../components/ReclusterStatusBar.js'
import { NewVersionBanner } from '../components/NewVersionBanner.js'
import { ExperimentFollowupBanner } from '../components/ExperimentFollowupBanner.js'
import { SHARED_CSS } from './shared-css.js'

// 注意：storage key 是 chord_settings（ChromeStorageAdapter 用的），不是 settings
chrome.storage.local.get('chord_settings').then((data) => {
  const settings = data['chord_settings'] as { skinId?: string; [k: string]: unknown } | undefined
  const skinId = settings?.skinId ?? 'g-pink'
  applySkin(skinId)

  // 主动出现 Phase 1：写 lastOpenedAt，供 Layer 4 重新召回判定
  chrome.storage.local.set({
    chord_settings: { ...(settings ?? {}), lastOpenedAt: Date.now() },
  })
})
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['chord_settings']) {
    const skinId = (changes['chord_settings'].newValue as { skinId?: string } | undefined)?.skinId ?? 'g-pink'
    applySkin(skinId)
  }
})

// Options 页打开时，告诉 SW 检查是否需要后台 recluster（fire-and-forget）
// 这样不管用户进哪个页面，AI 都开始跑——等 ta 流到 Terrain 时结果已经好了
chrome.runtime.sendMessage({ type: 'PAGE_OPENED', page: 'options' }).catch(() => {})

// Hash-based router
const hash = signal(window.location.hash || '#dashboard')
window.addEventListener('hashchange', () => { hash.value = window.location.hash })

const page = computed(() => (hash.value.split('?')[0] ?? '').replace('#', '') || 'dashboard')

const NAV_ITEMS = [
  { id: 'dashboard', label: '候响室' },
  { id: 'process',   label: '处理' },
  { id: 'terrain',   label: '兴趣地形' },
  { id: 'profile',   label: '隐性自我' },
  // v3.1.28 · 周回顾暂时藏起来（内容还没有积累价值）—— 入口隐藏，page 保留以防有人 #weekly 直达
  // { id: 'weekly',    label: '周回顾' },
  { id: 'settings',  label: '设置' },
]

function App() {
  const currentPage = page.value

  if (currentPage === 'onboarding') {
    return <Onboarding />
  }

  return (
    <div class="options-layout">
      <NewVersionBanner />
      <ReclusterStatusBar />
      <ExperimentFollowupBanner />
      {/* Top bar */}
      <div class="opt-topbar">
        <div class="opt-logo">
          <svg viewBox="0 0 120 100" fill="none" width="24" height="24">
            <path d="M82 18 Q28 18 28 50 Q28 82 82 82" stroke="#D9706A" stroke-width="5" stroke-linecap="round"/>
            <path d="M82 34 Q44 34 44 50 Q44 66 82 66" stroke="#D9706A" stroke-width="2.5" stroke-linecap="round" opacity="0.4"/>
            <circle cx="87" cy="50" r="4" fill="#D9706A"/>
            <circle cx="99" cy="50" r="2.8" fill="#D9706A" opacity="0.65"/>
            <circle cx="109" cy="50" r="1.8" fill="#D9706A" opacity="0.35"/>
          </svg>
          <span class="opt-logo-text">回响</span>
        </div>

        <nav class="opt-nav">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              class={`opt-nav-item ${currentPage === item.id ? 'opt-nav-active' : ''}`}
            >{item.label}</a>
          ))}
        </nav>
      </div>

      {/* Page content */}
      <div class="opt-content">
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'process'   && <Process />}
        {currentPage === 'terrain'   && <Terrain />}
        {currentPage === 'profile'   && <Profile />}
        {currentPage === 'weekly'    && <Weekly />}
        {currentPage === 'settings'  && <Settings />}
        {currentPage === 'privacy'   && <Privacy />}
      </div>
    </div>
  )
}

const style = document.createElement('style')
style.textContent = SHARED_CSS
document.head.appendChild(style)

render(<App />, document.getElementById('app')!)
