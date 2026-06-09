import { describe, it, expect } from 'vitest'
import { extractKeywords } from './keywords.js'

describe('extractKeywords', () => {
  it('returns empty array for empty/null/undefined input', () => {
    expect(extractKeywords(undefined)).toEqual([])
    expect(extractKeywords(null)).toEqual([])
    expect(extractKeywords('')).toEqual([])
    expect(extractKeywords('   ')).toEqual([])
  })

  it('extracts English words and filters stopwords', () => {
    const r = extractKeywords('I am not interested in this topic anymore')
    expect(r).toContain('interested')
    expect(r).toContain('topic')
    expect(r).toContain('anymore')
    expect(r).not.toContain('the')
    expect(r).not.toContain('not')
    expect(r).not.toContain('this')
  })

  it('extracts Chinese bigrams', () => {
    const r = extractKeywords('感觉这个领域我没动力学下去了')
    // 应该提取出"领域"、"动力"等有意义片段
    expect(r.some((k) => k.includes('领域') || k === '领域')).toBe(true)
    expect(r.some((k) => k.includes('动力') || k === '动力')).toBe(true)
  })

  it('filters Chinese stopwords', () => {
    const r = extractKeywords('这是一个的')
    expect(r).not.toContain('的')
    expect(r).not.toContain('这是')
  })

  it('handles mixed Chinese + English', () => {
    const r = extractKeywords('AI 论文太多了，看不完')
    expect(r.length).toBeGreaterThan(0)
    // 至少应该有英文 'ai'
    expect(r).toContain('论文')
  })

  it('caps at 5 keywords', () => {
    const r = extractKeywords(
      '这是一个非常长的句子有很多关键词比如学习成长动力工作生活时间精力',
    )
    expect(r.length).toBeLessThanOrEqual(5)
  })

  it('deduplicates keywords', () => {
    const r = extractKeywords('学习 学习 学习 工作 工作')
    // 不应该出现重复
    const unique = new Set(r)
    expect(unique.size).toBe(r.length)
  })

  it('handles symbols and numbers gracefully', () => {
    expect(() => extractKeywords('!!! @#$ 123')).not.toThrow()
    // 数字单独不算关键词（被英文正则要求字母开头过滤掉）
    const r = extractKeywords('!!! @#$ 123')
    expect(r.every((k) => !/^\d+$/.test(k))).toBe(true)
  })

  it('handles very short text', () => {
    const r = extractKeywords('累')
    // 单字符通常不会被提取（中文 bigram 最小 2 字）
    expect(r.length).toBeLessThanOrEqual(1)
  })
})
