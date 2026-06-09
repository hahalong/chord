// CR-027：max_tokens 参数化 + 截断 JSON 兜底解析
// CR-028：cluster() 切到 L1 分类，AI 返回 {i, label} 而不是 {name, itemIndices, keywords}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenAICompatibleEngine, recoverTruncatedJsonArray } from './OpenAICompatibleEngine.js'

describe('recoverTruncatedJsonArray', () => {
  it('完整 JSON 直接解析', () => {
    const r = recoverTruncatedJsonArray('[{"a":1},{"a":2}]')
    expect(r).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('被截断在对象中间时挽救前 N-1 个', () => {
    const truncated = '[{"i":0,"label":"AI 应用与工具"},{"i":1,"lab'
    const r = recoverTruncatedJsonArray(truncated)
    expect(r).toEqual([{ i: 0, label: 'AI 应用与工具' }])
  })

  it('完全无法解析时返回 null', () => {
    expect(recoverTruncatedJsonArray('not json at all')).toBeNull()
  })

  it('截断到只剩 `[` 没有任何完整对象时返回 null', () => {
    expect(recoverTruncatedJsonArray('[{"i":0,"label":"未完成')).toBeNull()
  })

  it('非数组（对象）也返回 null', () => {
    expect(recoverTruncatedJsonArray('{"a":1}')).toBeNull()
  })
})

describe('OpenAICompatibleEngine.chat() max_tokens 参数化（CR-027）', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // 默认 mock 返回 L1 分类结果
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({
        choices: [{ message: { content: '[{"i":0,"label":"AI 应用与工具"}]' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
  })

  afterEach(() => fetchSpy.mockRestore())

  it('cluster() 传 max_tokens=8192', async () => {
    const eng = new OpenAICompatibleEngine({ baseUrl: 'http://x', apiKey: 'k', model: 'm' })
    await eng.cluster([{ id: '1', title: 't', domain: 'd' }])
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.max_tokens).toBe(8192)
  })

  it('generateQuestion() 传 max_tokens=256', async () => {
    fetchSpy.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '问句' } }],
    }), { status: 200 }))
    const eng = new OpenAICompatibleEngine({ baseUrl: 'http://x', apiKey: 'k', model: 'm' })
    await eng.generateQuestion({ title: 't', domain: 'd', savedAt: Date.now(), wakeCount: 0 })
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.max_tokens).toBe(256)
  })

  it('classifyIntents() 传 max_tokens=2048', async () => {
    fetchSpy.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '[{"i":0,"intent":"learn"}]' } }],
    }), { status: 200 }))
    const eng = new OpenAICompatibleEngine({ baseUrl: 'http://x', apiKey: 'k', model: 'm' })
    await eng.classifyIntents([{ id: '1', title: 't' }])
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.max_tokens).toBe(2048)
  })
})

describe('OpenAICompatibleEngine.cluster() L1 分类（CR-028）', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch') })
  afterEach(() => fetchSpy.mockRestore())

  function mockL1Response(content: string, finishReason = 'stop') {
    fetchSpy.mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content }, finish_reason: finishReason }],
      usage: { completion_tokens: 100 },
    }), { status: 200 }))
  }

  it('AI 返回每条 item 的 L1 标签，汇成 cluster', async () => {
    mockL1Response('[{"i":0,"label":"AI 应用与工具"},{"i":1,"label":"投资与金融市场"},{"i":2,"label":"AI 应用与工具"}]')
    const eng = new OpenAICompatibleEngine({ baseUrl: 'http://x', apiKey: 'k', model: 'm' })
    const r = await eng.cluster([
      { id: 'a', title: 'ChatGPT', domain: 'chatgpt.com' },
      { id: 'b', title: 'TradingView', domain: 'tradingview.com' },
      { id: 'c', title: 'Claude', domain: 'claude.ai' },
    ])
    expect(r).toHaveLength(2)
    const ai = r.find((c) => c.name === 'AI 应用与工具')!
    const inv = r.find((c) => c.name === '投资与金融市场')!
    expect(ai.itemIds.sort()).toEqual(['a', 'c'])
    expect(inv.itemIds).toEqual(['b'])
  })

  it('cluster name 永远是 L1 预定义名（不能有 `·` 拼接）', async () => {
    mockL1Response('[{"i":0,"label":"AI 应用与工具"},{"i":1,"label":"投资与金融市场"}]')
    const eng = new OpenAICompatibleEngine({ baseUrl: 'http://x', apiKey: 'k', model: 'm' })
    const r = await eng.cluster([
      { id: 'a', title: 't1', domain: 'd' },
      { id: 'b', title: 't2', domain: 'd' },
    ])
    for (const c of r) {
      expect(c.name).not.toContain('·')
      expect(c.name).not.toContain(' · ')
    }
  })

  it('AI 重复打标时只保留第一次', async () => {
    mockL1Response('[{"i":0,"label":"AI 应用与工具"},{"i":0,"label":"投资与金融市场"}]')
    const eng = new OpenAICompatibleEngine({ baseUrl: 'http://x', apiKey: 'k', model: 'm' })
    const r = await eng.cluster([{ id: 'a', title: 't', domain: 'd' }])
    expect(r).toHaveLength(1)
    expect(r[0]!.name).toBe('AI 应用与工具')
    expect(r[0]!.itemIds).toEqual(['a'])
  })

  it('AI 漏标的 item 兜底归到「其他」', async () => {
    mockL1Response('[{"i":0,"label":"AI 应用与工具"}]')   // 只标了 i=0，漏 1 2
    const eng = new OpenAICompatibleEngine({ baseUrl: 'http://x', apiKey: 'k', model: 'm' })
    const r = await eng.cluster([
      { id: 'a', title: 't1', domain: 'd' },
      { id: 'b', title: 't2', domain: 'd' },
      { id: 'c', title: 't3', domain: 'd' },
    ])
    const other = r.find((c) => c.name === '其他')!
    expect(other.itemIds.sort()).toEqual(['b', 'c'])
  })

  it('AI 返回非法 label 时该 item 兜底归「其他」', async () => {
    mockL1Response('[{"i":0,"label":"瞎编的类别"},{"i":1,"label":"AI 应用与工具"}]')
    const eng = new OpenAICompatibleEngine({ baseUrl: 'http://x', apiKey: 'k', model: 'm' })
    const r = await eng.cluster([
      { id: 'a', title: 't1', domain: 'd' },
      { id: 'b', title: 't2', domain: 'd' },
    ])
    const ai = r.find((c) => c.name === 'AI 应用与工具')!
    const other = r.find((c) => c.name === '其他')!
    expect(ai.itemIds).toEqual(['b'])
    expect(other.itemIds).toEqual(['a'])
  })

  it('cluster 输出顺序按 L1_CATEGORIES 定义顺序（稳定）', async () => {
    // L1_CATEGORIES 顺序: ai_app, ai_eng, invest, testing, coding, hardtech, utility, job, life, misc
    mockL1Response('[{"i":0,"label":"投资与金融市场"},{"i":1,"label":"AI 应用与工具"},{"i":2,"label":"编程与软件开发"}]')
    const eng = new OpenAICompatibleEngine({ baseUrl: 'http://x', apiKey: 'k', model: 'm' })
    const r = await eng.cluster([
      { id: 'a', title: 't1', domain: 'd' },
      { id: 'b', title: 't2', domain: 'd' },
      { id: 'c', title: 't3', domain: 'd' },
    ])
    expect(r.map((c) => c.name)).toEqual([
      'AI 应用与工具',
      '投资与金融市场',
      '编程与软件开发',
    ])
  })

  it('遇到截断的 AI 响应仍能挽救部分标签', async () => {
    mockL1Response('[{"i":0,"label":"AI 应用与工具"},{"i":1,"lab', 'length')
    const eng = new OpenAICompatibleEngine({ baseUrl: 'http://x', apiKey: 'k', model: 'm' })
    const r = await eng.cluster([
      { id: 'a', title: 't1', domain: 'd' },
      { id: 'b', title: 't2', domain: 'd' },
    ])
    const ai = r.find((c) => c.name === 'AI 应用与工具')!
    const other = r.find((c) => c.name === '其他')!
    expect(ai.itemIds).toEqual(['a'])
    expect(other.itemIds).toEqual(['b'])    // 截断丢失的 b 被兜底归到「其他」
  })
})
