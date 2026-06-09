import {
  TOOL_DOMAINS,
  NEVER_ASK_DOMAINS,
  CONTENT_PATH_PATTERNS,
  CONTENT_QUERY_PARAMS,
  AMBIGUOUS_DOMAIN_RULES,
} from './rules.js'

export type URLClassification =
  | { type: 'content'; confidence: 'high' }
  | { type: 'tool'; confidence: 'high'; neverAsk?: boolean }
  | { type: 'unknown'; confidence: 'low'; domain: string }

export function classifyURL(
  rawUrl: string,
  domainPrefs: Record<string, 'content' | 'tool'> = {},
): URLClassification {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { type: 'tool', confidence: 'high' } // 无效 URL，静默归入快速入口
  }

  const hostname = url.hostname.replace(/^www\./, '')
  const domain = hostname

  // ① 用户历史偏好（最高优先级）
  const pref = domainPrefs[domain] ?? domainPrefs[hostname]
  if (pref) {
    return { type: pref, confidence: 'high' }
  }

  // ② 永不询问的工具域名（gmail 等）
  if (NEVER_ASK_DOMAINS.has(domain) || NEVER_ASK_DOMAINS.has(hostname)) {
    return { type: 'tool', confidence: 'high', neverAsk: true }
  }

  // ③ 多义域名路径判断
  const ambiguousRule = AMBIGUOUS_DOMAIN_RULES[hostname] ?? AMBIGUOUS_DOMAIN_RULES[url.hostname]
  if (ambiguousRule) {
    const decision = ambiguousRule(url)
    if (decision === 'tool') return { type: 'tool', confidence: 'high' }
    if (decision === 'content') return { type: 'content', confidence: 'high' }
    return { type: 'unknown', confidence: 'low', domain }
  }

  // ④ 已知工具型根域名
  if (TOOL_DOMAINS.has(domain) || TOOL_DOMAINS.has(hostname)) {
    return { type: 'tool', confidence: 'high' }
  }

  // ⑤ 内容型路径模式
  const pathname = url.pathname
  if (CONTENT_PATH_PATTERNS.some((p) => p.test(pathname))) {
    return { type: 'content', confidence: 'high' }
  }

  // ⑥ 内容型 query 参数
  if (CONTENT_QUERY_PARAMS.some((p) => url.searchParams.has(p))) {
    return { type: 'content', confidence: 'high' }
  }

  // ⑦ 路径深度暗示（/a/b/c/d... 通常是内容页）
  const pathDepth = pathname.split('/').filter(Boolean).length
  if (pathDepth >= 3) {
    return { type: 'content', confidence: 'high' }
  }

  // ⑧ 兜底：未知，触发询问
  return { type: 'unknown', confidence: 'low', domain }
}
