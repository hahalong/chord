import { describe, it, expect } from 'vitest'
import { classifyURL } from './URLClassifier.js'

// ─── CLAUDE.md §5 required edge cases ────────────────────────────────────────

describe('CLAUDE.md §5 required edge cases', () => {
  it('notion.so 主页 → 工具', () => {
    expect(classifyURL('https://notion.so')).toMatchObject({ type: 'tool' })
    expect(classifyURL('https://www.notion.so')).toMatchObject({ type: 'tool' })
    expect(classifyURL('https://notion.so/')).toMatchObject({ type: 'tool' })
  })

  it('notion.so/xxx-pageid → 询问 (unknown)', () => {
    expect(classifyURL('https://notion.so/My-Page-abc123def4560789abcde')).toMatchObject({ type: 'unknown', confidence: 'low' })
    expect(classifyURL('https://www.notion.so/workspace/PageTitle-1234567890abcdef1234')).toMatchObject({ type: 'unknown', confidence: 'low' })
  })

  it('github.com → 工具', () => {
    expect(classifyURL('https://github.com')).toMatchObject({ type: 'tool' })
    expect(classifyURL('https://github.com/')).toMatchObject({ type: 'tool' })
    expect(classifyURL('https://github.com/trending')).toMatchObject({ type: 'tool' })
    expect(classifyURL('https://github.com/johndoe')).toMatchObject({ type: 'tool' })
  })

  it('github.com/user/repo/blob/… → 询问', () => {
    expect(classifyURL('https://github.com/user/repo/blob/main/README.md')).toMatchObject({ type: 'unknown', confidence: 'low' })
    expect(classifyURL('https://github.com/user/repo/tree/main/src')).toMatchObject({ type: 'unknown', confidence: 'low' })
    expect(classifyURL('https://github.com/user/repo/issues/42')).toMatchObject({ type: 'unknown', confidence: 'low' })
    expect(classifyURL('https://github.com/user/repo/pull/100')).toMatchObject({ type: 'unknown', confidence: 'low' })
    expect(classifyURL('https://github.com/user/repo/releases')).toMatchObject({ type: 'unknown', confidence: 'low' })
    expect(classifyURL('https://github.com/user/repo')).toMatchObject({ type: 'unknown', confidence: 'low' })
  })

  it('youtube.com → 工具', () => {
    expect(classifyURL('https://youtube.com')).toMatchObject({ type: 'tool' })
    expect(classifyURL('https://www.youtube.com')).toMatchObject({ type: 'tool' })
    expect(classifyURL('https://www.youtube.com/')).toMatchObject({ type: 'tool' })
    expect(classifyURL('https://www.youtube.com/feed/subscriptions')).toMatchObject({ type: 'tool' })
  })

  it('youtube.com/watch?v=xxx → 询问', () => {
    expect(classifyURL('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({ type: 'unknown', confidence: 'low' })
    expect(classifyURL('https://youtube.com/watch?v=abc123')).toMatchObject({ type: 'unknown', confidence: 'low' })
    expect(classifyURL('https://m.youtube.com/watch?v=abc')).toMatchObject({ type: 'unknown', confidence: 'low' })
  })

  it('figma.com → 工具', () => {
    expect(classifyURL('https://figma.com')).toMatchObject({ type: 'tool' })
    expect(classifyURL('https://www.figma.com')).toMatchObject({ type: 'tool' })
    expect(classifyURL('https://www.figma.com/')).toMatchObject({ type: 'tool' })
  })

  it('figma.com/file/xxx → 询问', () => {
    expect(classifyURL('https://www.figma.com/file/abc123/My-Design')).toMatchObject({ type: 'unknown', confidence: 'low' })
    expect(classifyURL('https://figma.com/file/XYZ')).toMatchObject({ type: 'unknown', confidence: 'low' })
    expect(classifyURL('https://www.figma.com/proto/abc/Prototype')).toMatchObject({ type: 'unknown', confidence: 'low' })
    expect(classifyURL('https://www.figma.com/board/abc/Board')).toMatchObject({ type: 'unknown', confidence: 'low' })
  })

  it('gmail.com → 工具，永不询问 (neverAsk=true)', () => {
    const r = classifyURL('https://gmail.com')
    expect(r.type).toBe('tool')
    expect(r).toMatchObject({ neverAsk: true })
  })

  it('mail.google.com → 工具，永不询问', () => {
    const r = classifyURL('https://mail.google.com/mail/u/0/')
    expect(r.type).toBe('tool')
    expect(r).toMatchObject({ neverAsk: true })
  })
})

// ─── domainPrefs user overrides ───────────────────────────────────────────────

describe('user domain preferences (highest priority)', () => {
  it('user-classified domain overrides all rules', () => {
    const prefs = { 'github.com': 'content' as const }
    expect(classifyURL('https://github.com', prefs)).toMatchObject({ type: 'content', confidence: 'high' })
  })

  it('user tool preference overrides content path pattern', () => {
    const prefs = { 'example.com': 'tool' as const }
    expect(classifyURL('https://example.com/blog/my-article', prefs)).toMatchObject({ type: 'tool', confidence: 'high' })
  })

  it('www prefix is stripped before matching domainPrefs', () => {
    const prefs = { 'notion.so': 'content' as const }
    expect(classifyURL('https://www.notion.so/My-Page-abc123', prefs)).toMatchObject({ type: 'content', confidence: 'high' })
  })
})

// ─── Never-ask domains ────────────────────────────────────────────────────────

describe('never-ask tool domains', () => {
  it('calendar.google.com → neverAsk', () => {
    const r = classifyURL('https://calendar.google.com/calendar/r')
    expect(r).toMatchObject({ type: 'tool', neverAsk: true })
  })

  it('outlook.com → neverAsk', () => {
    const r = classifyURL('https://outlook.com/mail/inbox')
    expect(r).toMatchObject({ type: 'tool', neverAsk: true })
  })
})

// ─── Known tool domains ───────────────────────────────────────────────────────

describe('known tool domains', () => {
  it('linear.app → tool', () => {
    expect(classifyURL('https://linear.app')).toMatchObject({ type: 'tool' })
    expect(classifyURL('https://app.linear.app/team/PROJ/issues')).toMatchObject({ type: 'tool' })
  })

  it('slack.com → tool', () => {
    expect(classifyURL('https://app.slack.com/client/T0/C0')).toMatchObject({ type: 'tool' })
  })

  it('vercel.com → tool', () => {
    expect(classifyURL('https://vercel.com/dashboard')).toMatchObject({ type: 'tool' })
  })

  it('airtable.com → tool', () => {
    expect(classifyURL('https://airtable.com/appXXX/tblYYY')).toMatchObject({ type: 'tool' })
  })
})

// ─── Content path patterns ────────────────────────────────────────────────────

describe('content path patterns', () => {
  it('/blog/ → content', () => {
    expect(classifyURL('https://example.com/blog/my-post')).toMatchObject({ type: 'content', confidence: 'high' })
  })

  it('/post/ → content', () => {
    expect(classifyURL('https://example.com/post/some-article')).toMatchObject({ type: 'content', confidence: 'high' })
  })

  it('/article/ → content', () => {
    expect(classifyURL('https://news.com/article/breaking-news')).toMatchObject({ type: 'content', confidence: 'high' })
  })

  it('/p/ → content (Medium-style)', () => {
    expect(classifyURL('https://medium.com/@author/p/slug123')).toMatchObject({ type: 'content', confidence: 'high' })
  })

  it('/note/ and /notes/ → content', () => {
    expect(classifyURL('https://example.com/note/my-thought')).toMatchObject({ type: 'content', confidence: 'high' })
    expect(classifyURL('https://example.com/notes/everything')).toMatchObject({ type: 'content', confidence: 'high' })
  })

  it('/story/ → content', () => {
    expect(classifyURL('https://medium.com/publication/story/title')).toMatchObject({ type: 'content', confidence: 'high' })
  })

  it('/essay/ → content', () => {
    expect(classifyURL('https://paulgraham.com/essay/startups.html')).toMatchObject({ type: 'content', confidence: 'high' })
  })
})

// ─── Content query params ─────────────────────────────────────────────────────

describe('content query params', () => {
  it('?id= → content', () => {
    expect(classifyURL('https://example.com/page?id=12345')).toMatchObject({ type: 'content', confidence: 'high' })
  })

  it('?article_id= → content', () => {
    expect(classifyURL('https://news.com/read?article_id=999')).toMatchObject({ type: 'content', confidence: 'high' })
  })

  it('?p= → content (WordPress)', () => {
    expect(classifyURL('https://wordpress-site.com/?p=123')).toMatchObject({ type: 'content', confidence: 'high' })
  })
})

// ─── Path depth heuristic ─────────────────────────────────────────────────────

describe('path depth heuristic (≥3 segments → content)', () => {
  it('3-segment path on unknown domain → content', () => {
    expect(classifyURL('https://somesite.com/a/b/c')).toMatchObject({ type: 'content', confidence: 'high' })
  })

  it('4-segment path → content', () => {
    expect(classifyURL('https://docs.something.com/section/guide/advanced/tips')).toMatchObject({ type: 'content', confidence: 'high' })
  })
})

// ─── Unknown fallback ─────────────────────────────────────────────────────────

describe('unknown fallback (triggers classification bubble)', () => {
  it('unknown domain with short path → unknown', () => {
    const r = classifyURL('https://some-unknown-site.com')
    expect(r).toMatchObject({ type: 'unknown', confidence: 'low' })
    if (r.type === 'unknown') expect(r.domain).toBe('some-unknown-site.com')
  })

  it('unknown domain with 1-2 path segments → unknown', () => {
    expect(classifyURL('https://random-app.io/dashboard')).toMatchObject({ type: 'unknown', confidence: 'low' })
  })
})

// ─── Twitter/X ────────────────────────────────────────────────────────────────

describe('twitter.com / x.com', () => {
  it('twitter.com home → tool', () => {
    expect(classifyURL('https://twitter.com')).toMatchObject({ type: 'tool' })
    expect(classifyURL('https://x.com')).toMatchObject({ type: 'tool' })
  })

  it('twitter.com/user/status/id →询问', () => {
    expect(classifyURL('https://twitter.com/elonmusk/status/1234567890')).toMatchObject({ type: 'unknown', confidence: 'low' })
    expect(classifyURL('https://x.com/user/status/123')).toMatchObject({ type: 'unknown', confidence: 'low' })
  })

  it('twitter.com/user profile → tool', () => {
    expect(classifyURL('https://twitter.com/elonmusk')).toMatchObject({ type: 'tool' })
  })
})

// ─── YouTube playlist ─────────────────────────────────────────────────────────

describe('youtube playlist', () => {
  it('/playlist → 询问', () => {
    expect(classifyURL('https://www.youtube.com/playlist?list=PLxxx')).toMatchObject({ type: 'unknown', confidence: 'low' })
  })
})

// ─── Invalid URL ──────────────────────────────────────────────────────────────

describe('invalid URL', () => {
  it('invalid URL → tool (silent fallback)', () => {
    expect(classifyURL('not-a-url')).toMatchObject({ type: 'tool', confidence: 'high' })
    expect(classifyURL('')).toMatchObject({ type: 'tool', confidence: 'high' })
  })
})
