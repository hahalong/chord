import { describe, it, expect } from 'vitest'
import { generateGuidance } from './PsychGuidanceService.js'
import type { Item, IdentityCard } from '@chord/types'

const NOW = 1716000000000
const DAY = 86400_000

function mkItem(overrides: Partial<Item> = {}): Item {
  return {
    id: Math.random().toString(36).slice(2),
    url: 'https://example.com/a',
    title: 'Sample',
    favicon: '',
    savedAt: NOW - 30 * DAY,
    sourceDomain: 'example.com',
    type: 'content',
    status: 'pending',
    wakeCount: 0,
    source: 'bookmark',
    ...overrides,
  }
}

function mkCard(dimension: IdentityCard['dimension'], id: IdentityCard['id'], name: string, enName: string): IdentityCard {
  return {
    dimension, id, name, enName,
    claim: '占位 claim',
    evidence: '占位 evidence',
    confidence: 0.7,
    confidenceLevel: 'high',
  }
}

describe('PsychGuidanceService.generateGuidance', () => {
  it('无 cards → null', () => {
    expect(generateGuidance({ cards: [], items: [mkItem()] })).toBeNull()
  })

  it('< 10 items → null', () => {
    const cards: IdentityCard[] = [mkCard('consumption', 'hoarder', '收藏家', 'HOARDER')]
    const items = Array.from({ length: 5 }, () => mkItem())
    expect(generateGuidance({ cards, items, now: NOW })).toBeNull()
  })

  it('信息焦虑囤积家：HOARDER + EXPLORER + GENERALIST → 完整 4 槽 + 组合命名', () => {
    const cards: IdentityCard[] = [
      mkCard('consumption', 'hoarder', '收藏家', 'HOARDER'),
      mkCard('mindset', 'explorer', '探索者', 'EXPLORER'),
      mkCard('radius', 'generalist', '广博派', 'GENERALIST'),
    ]
    const items: Item[] = []
    for (let i = 0; i < 50; i++) {
      items.push(mkItem({ id: `i-${i}`, cluster: `C${i % 5}`, savedAt: NOW - (i * 5) * DAY }))
    }
    const result = generateGuidance({ cards, items, now: NOW })
    expect(result).not.toBeNull()
    expect(result!.comboName).toBe('信息焦虑囤积家')
    expect(result!.slots.naming).toContain('误以为已经完成了学习')
    expect(result!.slots.cost).toContain('50 条')  // {{total}}
    expect(result!.slots.experiment).toContain('5 分钟')
    expect(result!.slots.reframe).toContain('以后再说')
  })

  it('深耕策展人：CURATOR + SETTLER + SPECIALIST → 不同的文案模板', () => {
    const cards: IdentityCard[] = [
      mkCard('consumption', 'curator', '策展人', 'CURATOR'),
      mkCard('mindset', 'settler', '沉淀者', 'SETTLER'),
      mkCard('radius', 'specialist', '专精派', 'SPECIALIST'),
    ]
    const items = Array.from({ length: 30 }, (_, i) => mkItem({ id: `c-${i}`, status: i < 20 ? 'kept' : 'pending' }))
    const result = generateGuidance({ cards, items, now: NOW })
    expect(result).not.toBeNull()
    expect(result!.comboName).toBe('深耕策展人')
    expect(result!.slots.naming).toContain('聚光灯')
  })

  it('未匹配组合 → 主身份兜底', () => {
    const cards: IdentityCard[] = [
      mkCard('consumption', 'thinker', '思想家', 'THINKER'),
    ]
    const items = Array.from({ length: 20 }, () => mkItem())
    const result = generateGuidance({ cards, items, now: NOW })
    expect(result).not.toBeNull()
    expect(result!.slots.naming).toContain('滋养想法')  // primary:thinker 模板
  })

  it('完全未匹配 → universal fallback', () => {
    const cards: IdentityCard[] = [
      // 自创身份，不在表里
      mkCard('mindset', 'returner', '回归者', 'RETURNER'),
    ]
    const items = Array.from({ length: 20 }, () => mkItem())
    const result = generateGuidance({ cards, items, now: NOW })
    expect(result).not.toBeNull()
    // UNIVERSAL_FALLBACK 含 "大脑误以为已经完成了学习"
    expect(result!.slots.naming).toContain('误以为已经完成了学习')
  })

  it('模板里的 {{total}} {{processed}} 等占位符正确替换为数字', () => {
    const cards: IdentityCard[] = [
      mkCard('consumption', 'hoarder', '收藏家', 'HOARDER'),
    ]
    const items: Item[] = []
    for (let i = 0; i < 40; i++) items.push(mkItem({ id: `i-${i}`, savedAt: NOW - i * DAY }))
    items[0]!.status = 'kept'
    items[0]!.processedAt = NOW

    const result = generateGuidance({ cards, items, now: NOW })
    expect(result).not.toBeNull()
    // 占位符全部替换，文本里不应有 {{...}}
    for (const slot of Object.values(result!.slots)) {
      expect(slot).not.toMatch(/\{\{\w+\}\}/)
    }
    // total = 40 应该出现在 cost 里
    expect(result!.slots.cost).toContain('40 条')
  })

  it('文案纪律：所有 4 槽都符合活人感（不含 AI 报告腔禁词）', () => {
    const combos: IdentityCard[][] = [
      [mkCard('consumption', 'hoarder', '收藏家', 'HOARDER'),
       mkCard('mindset', 'explorer', '探索者', 'EXPLORER'),
       mkCard('radius', 'generalist', '广博派', 'GENERALIST')],
      [mkCard('consumption', 'curator', '策展人', 'CURATOR'),
       mkCard('mindset', 'settler', '沉淀者', 'SETTLER'),
       mkCard('radius', 'specialist', '专精派', 'SPECIALIST')],
      [mkCard('consumption', 'executor', '行动者', 'EXECUTOR'),
       mkCard('mindset', 'seeker', '求索者', 'SEEKER'),
       mkCard('radius', 'specialist', '专精派', 'SPECIALIST')],
      [mkCard('consumption', 'thinker', '思想家', 'THINKER'),
       mkCard('mindset', 'returner', '回归者', 'RETURNER'),
       mkCard('radius', 'generalist', '广博派', 'GENERALIST')],
    ]
    const items = Array.from({ length: 30 }, () => mkItem())

    for (const cards of combos) {
      const result = generateGuidance({ cards, items, now: NOW })
      expect(result).not.toBeNull()
      const allText = Object.values(result!.slots).join(' ')
      // 禁词：AI 报告腔 / 学术装腔
      expect(allText).not.toMatch(/您|建议您|根据您的数据|认知心理学|焦虑型回避机制/)
      // 必须有具体数字或动作号召
      expect(allText.length).toBeGreaterThan(200)
    }
  })

  it('8 个主要组合每个都有自己的命名（不退化到默认拼接）', () => {
    const combos = [
      { ids: ['hoarder', 'explorer', 'generalist'], expected: '信息焦虑囤积家' },
      { ids: ['curator', 'settler', 'specialist'], expected: '深耕策展人' },
      { ids: ['executor', 'seeker', 'specialist'], expected: '目标驱动型专家' },
      { ids: ['thinker', 'returner', 'generalist'], expected: '反思型杂食回归者' },
      { ids: ['slow_reader', 'settler', 'specialist'], expected: '慢品大师' },
      { ids: ['hoarder', 'returner', 'specialist'], expected: '怀旧型醒悟者' },
      { ids: ['executor', 'explorer', 'switcher'], expected: '短时实验家' },
      { ids: ['curator', 'explorer', 'generalist'], expected: '审美型杂食家' },
    ]
    const items = Array.from({ length: 30 }, () => mkItem())

    for (const { ids, expected } of combos) {
      const cards: IdentityCard[] = [
        mkCard('consumption', ids[0] as IdentityCard['id'], '占', 'X'),
        mkCard('mindset', ids[1] as IdentityCard['id'], '占', 'X'),
        mkCard('radius', ids[2] as IdentityCard['id'], '占', 'X'),
      ]
      const result = generateGuidance({ cards, items, now: NOW })
      expect(result?.comboName).toBe(expected)
    }
  })
})
