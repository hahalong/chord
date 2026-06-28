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
  // DeepSeek 实测意图 prompt 下准确率 86% 稳定 ±2%，性价比最高（$0.14/M input）
  { id: 'deepseek',    label: 'DeepSeek',           hint: 'V3/V4 系列，便宜+稳定，聚类效果优',  signupUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'openai',      label: 'OpenAI',             hint: 'GPT 系列，需国际网络',                signupUrl: 'https://platform.openai.com/api-keys' },
  { id: 'google',      label: 'Gemini (Google)',    hint: 'Gemini 系列，AI Studio 免费额度',     signupUrl: 'https://aistudio.google.com/apikey' },
  { id: 'anthropic',   label: 'Claude (Anthropic)', hint: 'Claude 系列，需国际网络',             signupUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'custom',      label: '自定义',              hint: '填入 OpenAI 兼容接口地址' },
]

// 编译期是否有 Chord 内置 token；用于决定 chord_bundled provider 是否出现在 UI
export const BUNDLED_AI_AVAILABLE: boolean =
  ((import.meta.env['VITE_CHORD_BUNDLED_AI_KEY'] as string | undefined) ?? '').trim().length > 0

// Onboarding 展示的高频选项：4 个中国免费 + OpenAI/Gemini/Claude，让海外用户首次也能直接选
export const ONBOARDING_TOP_PROVIDERS = [
  ...PROVIDERS.slice(0, 4),
  ...PROVIDERS.filter((p) => p.id === 'deepseek' || p.id === 'openai' || p.id === 'google' || p.id === 'anthropic'),
]
