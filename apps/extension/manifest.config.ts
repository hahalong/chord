import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Chord · 回响',
  version: '1.1.2',
  description: '帮你和曾经保存的内容重新面对面，识别真实兴趣，整理内心。',

  permissions: [
    'bookmarks',
    'history',
    'storage',
    'notifications',
    'activeTab',
    'alarms',
  ],

  // Phase 0: 无 host_permissions（P1 时加第三方平台）
  host_permissions: [],

  background: {
    service_worker: 'src/background/sw.ts',
    type: 'module',
  },

  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'assets/icon-16.png',
      '32': 'assets/icon-32.png',
      '48': 'assets/icon-48.png',
      '128': 'assets/icon-128.png',
    },
  },

  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },

  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/classifier-hint.ts'],
      run_at: 'document_idle',
    },
  ],

  icons: {
    '16': 'assets/icon-16.png',
    '32': 'assets/icon-32.png',
    '48': 'assets/icon-48.png',
    '128': 'assets/icon-128.png',
  },

  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
})
