// AI Provider 元数据：Onboarding 和 Settings 共用
// 顺序很重要：免费的在前。Onboarding 只展示前 4 个，剩余的在 Settings 里完整展示。

import type { AIProvider } from '@chord/types'

export interface ProviderMeta {
  id: AIProvider
  label: string
  hint: string
  free?: boolean
  signupUrl?: string
}

export const PROVIDERS: ProviderMeta[] = [
  // chord_bundled 仅在编译期注入了 token 时才在 UI 显示（由 BUNDLED_AI_AVAILABLE 控制）
  { id: 'chord_bundled', label: 'Chord 内置 AI',     hint: '默认开启 · 无需配置 · 智谱 GLM-4-Flash', free: true },
  { id: 'zhipu',       label: '智谱 GLM-4-Flash',  hint: '免费，无限额度，中文优化',           free: true, signupUrl: 'https://open.bigmodel.cn' },
  { id: 'qwen',        label: '通义千问 Qwen-Turbo', hint: '阿里 DashScope，有免费额度',         free: true, signupUrl: 'https://bailian.console.aliyun.com' },
  { id: 'siliconflow', label: 'Silicon Flow',      hint: '免费 14M tokens/月，含 Qwen/DeepSeek', free: true, signupUrl: 'https://siliconflow.cn' },
  { id: 'kimi',        label: 'Kimi (月之暗面)',    hint: 'api.moonshot.cn' },
  { id: 'doubao',      label: '豆包 (字节)',         hint: 'ark.cn-beijing.volces.com' },
  { id: 'openai',      label: 'OpenAI',             hint: 'api.openai.com' },
  { id: 'google',      label: 'Gemini (Google)',    hint: 'generativelanguage.googleapis.com' },
  { id: 'anthropic',   label: 'Claude (Anthropic)', hint: 'api.anthropic.com' },
  { id: 'custom',      label: '自定义',              hint: '填入 OpenAI 兼容接口地址' },
]

// 编译期是否有 Chord 内置 token；用于决定 chord_bundled provider 是否出现在 UI
export const BUNDLED_AI_AVAILABLE: boolean =
  ((import.meta.env['VITE_CHORD_BUNDLED_AI_KEY'] as string | undefined) ?? '').trim().length > 0

// Onboarding 展示的高频选项（前 4 个，免费的优先）
export const ONBOARDING_TOP_PROVIDERS = PROVIDERS.slice(0, 4)
