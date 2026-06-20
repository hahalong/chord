import type { AIEngineSettings } from '@chord/types'
import type { AIEngine } from './AIEngine.js'
import { PRESET_ENGINES } from './AIEngine.js'
import { TFIDFEngine } from './TFIDFEngine.js'
import { OpenAICompatibleEngine } from './OpenAICompatibleEngine.js'

/**
 * v0.1.3 · 用户主动选 AI 但 key 缺 → 抛 MissingApiKeyError, 不静默 fallback tfidf
 *   背景: 之前 buildEngine 看到 mode='ai' apiKey='' 静默回 TFIDFEngine, 用户切 OpenAI 没填 key 那次
 *         触发了这条路径, 18 个 tfidf cluster 写进 storage, banner 显示成功完成, 用户看不到原因
 *   规则: 只有 mode='offline' (用户明确选了离线) 才允许返回 TFIDFEngine
 *        mode='ai' && key 缺 → 抛错让 sw 写 lastError, 由 banner 红色提示
 */
export class MissingApiKeyError extends Error {
  constructor(public readonly provider: string) {
    super(`AI provider "${provider}" 没填 API Key · 请在「设置」里填上 Key 或切到 Chord 内置 AI`)
    this.name = 'MissingApiKeyError'
  }
}

export function buildEngine(settings: AIEngineSettings): AIEngine {
  // 用户明确选离线
  if (settings.mode !== 'ai') return new TFIDFEngine()

  // 用户选 AI 但 key 缺 → 不静默 fallback, 抛错
  if (!settings.apiKey) {
    const provider = settings.provider ?? 'unknown'
    throw new MissingApiKeyError(provider)
  }

  const provider = settings.provider ?? 'openai'
  const preset = PRESET_ENGINES[provider as keyof typeof PRESET_ENGINES]
  return new OpenAICompatibleEngine({
    baseUrl: settings.baseUrl ?? preset?.baseUrl ?? PRESET_ENGINES.openai.baseUrl,
    model: settings.model ?? preset?.model ?? PRESET_ENGINES.openai.model,
    apiKey: settings.apiKey,
    provider,
  })
}
