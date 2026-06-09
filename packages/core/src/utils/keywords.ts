/**
 * 简单关键词提取（v1：无 AI 依赖，纯规则）
 *
 * 用途：用户在「放手」时填的自由文本（releaseReasonCustom），提取关键词后
 * 喂给 AnalyticsService 聚合（例："这个月你 5 次放手都提到「拖延」"）。
 *
 * v2 升级路径：当 AI 引擎可用时，可改为 OpenAI embedding-based 聚类。
 * 详见 Chord_二向决策_实施方案.md §2 + Chord_念念回响_功能设计.md。
 *
 * 算法：
 * - 中文：滑动 bigram + 跳过单字符/纯符号
 * - 英文：按词边界切分 + 停用词过滤
 * - 去重 + 按长度排序，取前 N 个
 */

// 中文/英文整词停用词（多字词，整体匹配过滤）
const STOPWORDS = new Set<string>([
  // 中文整词
  '没有', '一个', '一些', '什么', '怎么', '为什么', '已经', '还是', '感觉',
  // 英文整词
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'i', 'me', 'my', 'you', 'your', 'it', 'its', 'they', 'them', 'their',
  'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'but', 'with',
  'this', 'that', 'these', 'those', 'have', 'has', 'had', 'do', 'does', 'did',
  'so', 'just', 'too', 'really', 'very', 'not', 'now', 'then',
])

// 中文单字停用字符：任何含这些字的 bigram 都被过滤（避免 "觉这"/"域我"/"我没" 这种过渡片段污染）
const STOPCHARS = new Set<string>([
  '的', '了', '是', '在', '有', '和', '我', '你', '它', '们', '这', '那', '不',
  '就', '都', '也', '会', '能', '要', '吧', '吗', '呢', '啊', '又', '太', '很',
  '没', '个', '上', '下', '去', '把', '让', '使', '被', '给', '从', '与', '及',
  '或', '为', '以', '所', '而', '但', '却', '只', '还',
])

function containsStopChar(s: string): boolean {
  for (const ch of s) if (STOPCHARS.has(ch)) return true
  return false
}

const MIN_KEYWORD_LEN_CN = 2  // 中文 bigram 最小 2 字
const MIN_KEYWORD_LEN_EN = 3  // 英文最小 3 字母
const MAX_KEYWORDS = 5         // 单条文本最多提取 5 个关键词

/**
 * 提取关键词。
 * 输入示例："感觉这个领域我没动力学下去了，太焦虑"
 * 输出示例：["领域", "动力", "焦虑", "下去"]
 */
export function extractKeywords(text: string | undefined | null): string[] {
  if (!text || typeof text !== 'string') return []
  const trimmed = text.trim()
  if (trimmed.length === 0) return []

  const tokens = new Set<string>()

  // 1. 英文 / 数字按词边界
  const enMatches = trimmed.toLowerCase().match(/[a-z][a-z0-9]+/g) ?? []
  for (const word of enMatches) {
    if (word.length >= MIN_KEYWORD_LEN_EN && !STOPWORDS.has(word)) {
      tokens.add(word)
    }
  }

  // 2. 中文：去掉非汉字字符后按 bigram 切
  // 双重过滤：① 整词不在 STOPWORDS ② 字符不含 STOPCHARS（避免 "觉这"/"域我" 这种过渡片段）
  const cnOnly = trimmed.replace(/[^一-鿿]/g, ' ')
  for (const segment of cnOnly.split(/\s+/)) {
    if (segment.length < MIN_KEYWORD_LEN_CN) continue
    // 滑动 bigram
    for (let i = 0; i <= segment.length - 2; i++) {
      const bigram = segment.slice(i, i + 2)
      if (STOPWORDS.has(bigram)) continue
      if (containsStopChar(bigram)) continue
      tokens.add(bigram)
    }
    // 整段如果不长（≤4字）且不含停用字符，也加进去——可能是一个完整词
    if (segment.length <= 4 && !STOPWORDS.has(segment) && !containsStopChar(segment)) {
      tokens.add(segment)
    }
  }

  // 去重 + 按长度倒序（更长的更"有信息量"）+ 截断
  return Array.from(tokens)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_KEYWORDS)
}
