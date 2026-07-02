import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Chord · 回响',
  version: '1.1.5',
  description: '帮你和曾经保存的内容重新面对面，识别真实兴趣，整理内心。',

  permissions: [
    'bookmarks',
    'history',
    'storage',
    'notifications',
    'activeTab',
    'alarms',
  ],

  // v1.1.4 · AI provider API endpoints
  //   背景: host_permissions 为空时, SW 里 fetch 外部 API 受 CORS 约束——
  //         provider 服务端 CORS 配置一变, 所有用户 "Failed to fetch"（实际发生过）
  //   加了 host_permissions 后 fetch 绕过 CORS, 不再依赖对方响应头
  //   注: 自定义 provider（用户自填 baseURL）不在此列, 仍依赖对方 CORS
  host_permissions: [
    'https://open.bigmodel.cn/*',                    // 智谱（chord_bundled 默认）
    'https://api.deepseek.com/*',
    'https://api.openai.com/*',
    'https://api.anthropic.com/*',
    'https://api.moonshot.cn/*',                     // Kimi
    'https://api.siliconflow.cn/*',
    'https://dashscope.aliyuncs.com/*',              // 通义千问
    'https://ark.cn-beijing.volces.com/*',           // 豆包
    'https://generativelanguage.googleapis.com/*',   // Gemini
  ],

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
