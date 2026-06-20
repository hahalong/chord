/**
 * v0.1.3 fix-A 护航 · buildEngine 静默 fallback bug
 *
 * 起因: 用户切 OpenAI 没填 key → buildEngine 静默回 TFIDFEngine
 *       → recluster 跑 tfidf 写 18 个怪 cluster, banner 显示成功完成
 *       用户切回 chord_bundled 后 cluster 残留 + 防抖 5min 不重跑
 *
 * 修法: mode='ai' && apiKey 空 → 抛 MissingApiKeyError
 *      mode='offline' → 才允许返回 TFIDFEngine
 *
 * 这个 fail = 静默 fallback 又回来了, 不准发版
 */

import { describe, it, expect } from 'vitest'
import { buildEngine, MissingApiKeyError } from './buildEngine.js'
import { TFIDFEngine } from './TFIDFEngine.js'
import { OpenAICompatibleEngine } from './OpenAICompatibleEngine.js'

describe('buildEngine · mode=offline 才允许 TFIDFEngine', () => {
  it('mode=offline → TFIDFEngine（用户明确选离线）', () => {
    const e = buildEngine({ mode: 'offline' })
    expect(e).toBeInstanceOf(TFIDFEngine)
  })

  it('mode=offline + 任意 provider/apiKey → 仍 TFIDFEngine', () => {
    const e = buildEngine({ mode: 'offline', provider: 'openai', apiKey: 'sk-xxx' })
    expect(e).toBeInstanceOf(TFIDFEngine)
  })
})

describe('buildEngine · mode=ai && apiKey 缺 → 抛 MissingApiKeyError（v0.1.3 修法）', () => {
  it('mode=ai + apiKey 空 → 抛错（不静默 fallback）', () => {
    expect(() => buildEngine({ mode: 'ai', provider: 'openai', apiKey: '' })).toThrow(MissingApiKeyError)
  })

  it('mode=ai + apiKey undefined → 抛错', () => {
    expect(() => buildEngine({ mode: 'ai', provider: 'openai' })).toThrow(MissingApiKeyError)
  })

  it('错误消息包含 provider 名 + 引导用户填 key', () => {
    try {
      buildEngine({ mode: 'ai', provider: 'anthropic', apiKey: '' })
      expect.fail('应该抛错')
    } catch (e) {
      expect(e).toBeInstanceOf(MissingApiKeyError)
      expect((e as Error).message).toContain('anthropic')
      expect((e as Error).message).toMatch(/Key|key/)
    }
  })

  it('chord_bundled 没编译期 key 时 → 抛错（让用户看到 而非静默 tfidf）', () => {
    // 模拟编译期 BUNDLED_AI_KEY 没注入的情况
    // ChromeStorageAdapter.resolveApiKey 会返回 undefined → settings.apiKey 缺
    expect(() => buildEngine({ mode: 'ai', provider: 'chord_bundled', apiKey: '' })).toThrow(MissingApiKeyError)
  })
})

describe('buildEngine · mode=ai && apiKey 齐 → OpenAICompatibleEngine', () => {
  it('mode=ai + provider + apiKey 都全 → 返回 OpenAICompatibleEngine', () => {
    const e = buildEngine({ mode: 'ai', provider: 'openai', apiKey: 'sk-test' })
    expect(e).toBeInstanceOf(OpenAICompatibleEngine)
    expect(e).not.toBeInstanceOf(TFIDFEngine)
  })

  it('chord_bundled + bundled key 注入 → OpenAICompatibleEngine 调智谱', () => {
    const e = buildEngine({ mode: 'ai', provider: 'chord_bundled', apiKey: 'bundled-key' })
    expect(e).toBeInstanceOf(OpenAICompatibleEngine)
  })
})

describe('MissingApiKeyError · 类型 + provider 字段', () => {
  it('name 和 provider 字段都对', () => {
    try {
      buildEngine({ mode: 'ai', provider: 'qwen', apiKey: '' })
    } catch (e) {
      expect((e as MissingApiKeyError).name).toBe('MissingApiKeyError')
      expect((e as MissingApiKeyError).provider).toBe('qwen')
    }
  })
})
