// 高置信度工具型根域名（精确匹配 hostname，不含路径）
export const TOOL_DOMAINS = new Set([
  'gmail.com',
  'mail.google.com',
  'calendar.google.com',
  'docs.google.com',
  'drive.google.com',
  'sheets.google.com',
  'slides.google.com',
  'meet.google.com',
  'chat.google.com',
  'outlook.com',
  'outlook.live.com',
  'mail.yahoo.com',
  'linear.app',
  'app.linear.app',
  'slack.com',
  'app.slack.com',
  'discord.com',
  'notion.so',        // 根路径，无 page ID → 工具
  'www.notion.so',
  'airtable.com',
  'trello.com',
  'asana.com',
  'app.asana.com',
  'jira.atlassian.com',
  'confluence.atlassian.com',
  'github.com',       // 根路径或 profile → 工具（有 blob/issues/pull 的在 AMBIGUOUS）
  'gitlab.com',
  'figma.com',        // 根路径 → 工具（/file/ 在 AMBIGUOUS）
  'www.figma.com',
  'canva.com',
  'miro.com',
  'app.miro.com',
  'vercel.com',
  'app.vercel.com',
  'netlify.com',
  'app.netlify.com',
  'heroku.com',
  'console.cloud.google.com',
  'console.aws.amazon.com',
  'portal.azure.com',
  'feishu.cn',
  'lark.com',
  'bytedance.com',
])

// 永远归入工具，不询问
export const NEVER_ASK_DOMAINS = new Set([
  'gmail.com',
  'mail.google.com',
  'calendar.google.com',
  'outlook.com',
  'outlook.live.com',
  'mail.yahoo.com',
])

// 高置信度内容型路径规则（在 hostname 上额外判断 pathname）
export const CONTENT_PATH_PATTERNS = [
  /\/blog\//i,
  /\/post\//i,
  /\/posts\//i,
  /\/article\//i,
  /\/articles\//i,
  /\/story\//i,
  /\/stories\//i,
  /\/news\//i,
  /\/p\//i,               // medium.com/xxx/p/slug
  /\/read\//i,
  /\/essay\//i,
  /\/note\//i,
  /\/notes\//i,
]

// 高置信度内容型 query 参数
export const CONTENT_QUERY_PARAMS = ['id', 'article_id', 'post_id', 'p', 'itemId']

// 多义域名：路径决定类型
// 返回 'content' | 'tool' | 'unknown'
export type PathDecision = 'content' | 'tool' | 'unknown'

export const AMBIGUOUS_DOMAIN_RULES: Record<string, (url: URL) => PathDecision> = {
  'notion.so': (url) => {
    // notion.so/xxx-pageid（含连字符+hexid）→ 询问
    // notion.so 根路径或 /product /pricing 等 → 工具
    const pathParts = url.pathname.split('/').filter(Boolean)
    if (pathParts.length === 0) return 'tool'
    // Notion page ID 通常是 32 位 hex 或带连字符的 slug-hexid
    const lastPart = pathParts[pathParts.length - 1] ?? ''
    if (/[a-f0-9]{10,}/.test(lastPart)) return 'unknown'
    if (pathParts[0] && ['product', 'pricing', 'templates', 'blog', 'about', 'download', 'login', 'signup'].includes(pathParts[0])) {
      return pathParts[0] === 'blog' ? 'content' : 'tool'
    }
    return 'tool'
  },
  'www.notion.so': (url) => AMBIGUOUS_DOMAIN_RULES['notion.so']!(url),

  'github.com': (url) => {
    const parts = url.pathname.split('/').filter(Boolean)
    // /user/repo/blob|tree|issues|pull|discussions → 内容相关
    if (parts.length >= 3 && ['blob', 'tree', 'issues', 'pull', 'discussions', 'releases'].includes(parts[2] ?? '')) {
      return 'unknown'
    }
    // /user/repo → 也询问（可能是参考资料）
    if (parts.length === 2) return 'unknown'
    return 'tool'
  },
  'www.github.com': (url) => AMBIGUOUS_DOMAIN_RULES['github.com']!(url),

  'youtube.com': (url) => {
    if (url.searchParams.has('v')) return 'unknown'
    if (url.pathname.startsWith('/playlist')) return 'unknown'
    return 'tool'
  },
  'www.youtube.com': (url) => AMBIGUOUS_DOMAIN_RULES['youtube.com']!(url),
  'm.youtube.com': (url) => AMBIGUOUS_DOMAIN_RULES['youtube.com']!(url),

  'figma.com': (url) => {
    if (url.pathname.startsWith('/file/') || url.pathname.startsWith('/proto/') || url.pathname.startsWith('/board/')) {
      return 'unknown'
    }
    return 'tool'
  },
  'www.figma.com': (url) => AMBIGUOUS_DOMAIN_RULES['figma.com']!(url),

  'twitter.com': (url) => {
    const parts = url.pathname.split('/').filter(Boolean)
    // /user/status/id → 单条推文 → 内容
    if (parts.length >= 3 && parts[1] === 'status') return 'unknown'
    return 'tool'
  },
  'x.com': (url) => AMBIGUOUS_DOMAIN_RULES['twitter.com']!(url),
}
