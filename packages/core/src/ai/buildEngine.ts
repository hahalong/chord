import type { AIEngineSettings } from '@chord/types'
import type { AIEngine } from './AIEngine.js'
import { PRESET_ENGINES } from './AIEngine.js'
import { TFIDFEngine } from './TFIDFEngine.js'
import { OpenAICompatibleEngine } from './OpenAICompatibleEngine.js'

export function buildEngine(settings: AIEngineSettings): AIEngine {
  if (settings.mode === 'ai' && settings.apiKey) {
    const provider = settings.provider ?? 'openai'
    const preset = PRESET_ENGINES[provider as keyof typeof PRESET_ENGINES]
    return new OpenAICompatibleEngine({
      baseUrl: settings.baseUrl ?? preset?.baseUrl ?? PRESET_ENGINES.openai.baseUrl,
      model: settings.model ?? preset?.model ?? PRESET_ENGINES.openai.model,
      apiKey: settings.apiKey,
      provider,
    })
  }
  return new TFIDFEngine()
}
