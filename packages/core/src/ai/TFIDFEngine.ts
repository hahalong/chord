import type { ClusterInput, ClusterResult } from '@chord/types'
import type { AIEngine, QuestionContext } from './AIEngine.js'
import { daysSince } from '../utils/date.js'

// 停用词（中英文常见词 + URL 片段）
const STOP_WORDS = new Set([
  // 中文虚词
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '上',
  '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己',
  '这', '那', '但', '而', '与', '及', '或', '并', '中', '为', '以', '从', '如', '被',
  '如何', '什么', '为什么', '怎么', '怎样', '关于', '通过', '使用', '利用', '基于',
  '一个', '这个', '那个', '可以', '需要', '已经', '他们', '我们', '它们', '进行',
  // 常见中文二字组合（停用）— 行为/动作类
  '介绍', '分享', '推荐', '教程', '方法', '总结', '学习', '提高', '优化', '详解',
  '实践', '案例', '指南', '入门', '进阶', '汇总', '整理', '梳理', '分析',
  // 太泛化的范畴名 — 当 cluster 名几乎没意义（CR-012：避免「工具·earnings」这种结果）
  // 真正的兴趣主题应该比这些词更具体（如「AI 工具」而不是「工具」）
  '工具', '产品', '设计', '内容', '文章', '资讯', '新闻', '应用', '软件',
  '网站', '系统', '服务', '平台', '项目', '业务', '行业', '市场', '公司',
  '团队', '用户', '功能', '页面', '操作', '问题', '方案', '体验', '报告',
  '数据', '模型', '技术', '研究', '开发', '管理', '运营', '工作', '业内',
  // 英文虚词
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that',
  'it', 'its', 'i', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who', 'how',
  'your', 'my', 'our', 'their', 'from', 'by', 'as', 'up', 'out', 'if', 'so', 'not',
  'use', 'using', 'used', 'get', 'make', 'new', 'more', 'about', 'like', 'into',
  'one', 'two', 'all', 'just', 'also', 'when', 'then', 'than', 'now', 'some', 'any',
  // URL / 域名片段（核心：任何在域名里出现的 token 都不该成为聚类名）
  'com', 'net', 'org', 'io', 'cn', 'www', 'http', 'https', 'html', 'php', 'asp',
  'co', 'uk', 'us', 'jp', 'de', 'fr', 'tv', 'me', 'app', 'dev',
  'github', 'gitlab', 'bitbucket', 'medium', 'zhihu', 'weixin', 'bilibili',
  'juejin', 'csdn', 'notion', 'sspai', 'douban', 'jianshu', 'segmentfault',
  'youtube', 'twitter', 'reddit', 'wikipedia', 'google', 'apple', 'figma',
  'linkedin', 'facebook', 'instagram', 'pinterest', 'quora', 'stackoverflow',
  'dribbble', 'behance', 'producthunt', 'hackernews', 'arxiv', 'ssrn',
  'qq', 'mp', 'wx', 'wechat', 'tieba', 'baidu', 'sina', 'sohu', 'taobao',
  'amazon', 'ebay', 'yahoo', 'bing', 'duckduckgo', 'spotify', 'netflix',
  'discord', 'slack', 'telegram', 'whatsapp', 'tiktok', 'douyin', 'xiaohongshu',
])

// 从域名提取额外的停用词（避免按域名聚类）
function domainStopWords(domain: string): Set<string> {
  const stop = new Set<string>()
  const parts = domain.toLowerCase().replace(/:\d+$/, '').split('.')
  const ignoreTLD = new Set(['com', 'net', 'org', 'io', 'cn', 'edu', 'gov', 'co', 'uk'])
  for (const part of parts) {
    if (part.length >= 2 && !ignoreTLD.has(part)) {
      stop.add(part)
    }
  }
  return stop
}

// 中文 n-gram 提取：bigram + trigram + 4-gram（对长 chunk）
// 4-gram 关键：让「深度学习」「分析报告」「机器学习」这种常见 4 字词直接出现在候选里，
// 不必依赖运行时 n-gram 合并兜底（CR-014）
function tokenizeChinese(text: string): string[] {
  const tokens: string[] = []
  const chunks = text.match(/[一-鿿㐀-䶿]+/g) ?? []
  for (const chunk of chunks) {
    // bigram：捕获相邻词根关联
    for (let i = 0; i < chunk.length - 1; i++) {
      tokens.push(chunk.slice(i, i + 2))
    }
    // trigram：对 4 字以上的词组有更强的区分度
    if (chunk.length >= 4) {
      for (let i = 0; i < chunk.length - 2; i++) {
        tokens.push(chunk.slice(i, i + 3))
      }
    }
    // 4-gram：捕获常见 4 字名词（深度学习/分析报告/产业研究）。chunk ≥ 5 字时才生成
    // 不必加更长，会导致过拟合（10 字标题里 10-gram 几乎只在一个 doc 出现）
    if (chunk.length >= 5) {
      for (let i = 0; i < chunk.length - 3; i++) {
        tokens.push(chunk.slice(i, i + 4))
      }
    }
  }
  return tokens
}

function tokenize(text: string, extraStop: Set<string> = new Set()): string[] {
  // 英文词
  const english = text.toLowerCase().match(/[a-z][a-z0-9]*/g) ?? []
  const engTokens = english.filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !extraStop.has(w))

  // 中文 bigram/trigram
  const chineseTokens = tokenizeChinese(text).filter(
    (t) => !STOP_WORDS.has(t) && !extraStop.has(t),
  )

  return [...engTokens, ...chineseTokens]
}

function computeTFIDF(docs: string[][]): Map<number, Map<string, number>> {
  const N = docs.length
  const df = new Map<string, number>()
  for (const doc of docs) {
    const seen = new Set(doc)
    for (const term of seen) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const idf = (term: string) => Math.log((N + 1) / ((df.get(term) ?? 0) + 1))

  const result = new Map<number, Map<string, number>>()
  docs.forEach((doc, i) => {
    const tf = new Map<string, number>()
    for (const term of doc) tf.set(term, (tf.get(term) ?? 0) + 1)
    const scores = new Map<string, number>()
    for (const [term, count] of tf) {
      scores.set(term, (count / doc.length) * idf(term))
    }
    result.set(i, scores)
  })
  return result
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, normA = 0, normB = 0
  for (const [term, score] of a) {
    dot += score * (b.get(term) ?? 0)
    normA += score * score
  }
  for (const score of b.values()) normB += score * score
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function kmeans(tfidfVecs: Map<number, Map<string, number>>, k: number, maxIter = 25): number[] {
  const n = tfidfVecs.size
  if (n === 0) return []
  k = Math.min(k, n)

  // K-means++ 初始化（更稳定的初始中心选择）
  const indices = Array.from({ length: n }, (_, i) => i)
  const centerIndices: number[] = [Math.floor(Math.random() * n)]
  while (centerIndices.length < k) {
    const distances = indices.map((i) => {
      const vec = tfidfVecs.get(i)!
      const minDist = Math.min(...centerIndices.map((c) => 1 - cosineSimilarity(vec, tfidfVecs.get(c)!)))
      return Math.max(0, minDist)
    })
    const total = distances.reduce((s, d) => s + d, 0)
    if (total === 0) { centerIndices.push(indices.find((i) => !centerIndices.includes(i)) ?? 0); continue }
    let rand = Math.random() * total
    for (let i = 0; i < distances.length; i++) {
      rand -= distances[i]!
      if (rand <= 0) { centerIndices.push(i); break }
    }
    if (centerIndices.length < k) centerIndices.push(indices.find((i) => !centerIndices.includes(i)) ?? 0)
  }

  let centers: Map<string, number>[] = centerIndices.map((i) => new Map(tfidfVecs.get(i)!))
  const assignments = new Array<number>(n).fill(0)

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false
    for (let i = 0; i < n; i++) {
      const vec = tfidfVecs.get(i)!
      let best = 0, bestSim = -1
      for (let c = 0; c < centers.length; c++) {
        const sim = cosineSimilarity(vec, centers[c]!)
        if (sim > bestSim) { bestSim = sim; best = c }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true }
    }
    if (!changed) break

    centers = Array.from({ length: k }, (_, c) => {
      const members = indices.filter((i) => assignments[i] === c)
      if (members.length === 0) return new Map<string, number>()
      const merged = new Map<string, number>()
      for (const i of members) {
        for (const [term, score] of tfidfVecs.get(i)!) {
          merged.set(term, (merged.get(term) ?? 0) + score)
        }
      }
      for (const [term, sum] of merged) merged.set(term, sum / members.length)
      return merged
    })
  }

  return assignments
}

function topTerms(vec: Map<string, number>, n = 5): string[] {
  return [...vec.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([term]) => term)
}

// 尝试把 a 和 b 按重叠拼回原词
// 例如 a='配置指' b='置指南' → 共享 2 字尾首 '置指' → 合并为 '配置指南'
function tryOverlapMerge(a: string, b: string): string | null {
  const maxLen = Math.min(a.length, b.length) - 1
  for (let len = maxLen; len >= 1; len--) {
    if (a.slice(-len) === b.slice(0, len)) {
      return a + b.slice(len)
    }
  }
  return null
}

// 贪心合并 n-gram 切片回原词
// 关键修复 CR-011：解决「配置指·置指南」这种把一个词的两个切片当独立词拼起来的问题
function mergeOverlappingNgrams(keywords: string[]): string[] {
  const result = [...keywords]
  let changed = true
  while (changed && result.length > 1) {
    changed = false
    outer: for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i]!
        const b = result[j]!
        // 两个方向都试：a 在前 vs b 在前
        const merged = tryOverlapMerge(a, b) ?? tryOverlapMerge(b, a)
        if (merged && merged.length > Math.max(a.length, b.length)) {
          result.splice(j, 1)   // 先删高 index
          result[i] = merged
          changed = true
          break outer
        }
      }
    }
  }
  return result
}

// 去掉是其他更长词子串的片段（如保留「配置指南」时去掉「指南」「配置」）
function dropSubstrings(phrases: string[]): string[] {
  return phrases.filter((p) =>
    !phrases.some((other) => other !== p && other.length > p.length && other.includes(p))
  )
}

// 从关键词生成可读的主题名
function buildClusterName(keywords: string[]): string {
  if (keywords.length === 0) return '其他'

  const chinese = keywords.filter((k) => /[一-鿿]/.test(k))
  const english = keywords.filter((k) => /^[a-z]/.test(k))

  // 中文：先按重叠合并 n-gram 切片回完整词，再去掉子串残留
  const merged = dropSubstrings(mergeOverlappingNgrams(chinese))
  // 长度优先：4-gram > trigram > bigram，更具体的词更适合做主题名
  // 同长度时按 TF-IDF 排名（即原 keywords 顺序）
  merged.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length
    return keywords.indexOf(a) - keywords.indexOf(b)
  })

  const parts: string[] = []
  // 优先放最长的；如果只有一个 ≥3 字的好词，第二位补一个不同前缀的短词避免「重复感」
  if (merged.length > 0) parts.push(merged[0]!)
  if (merged.length > 1) {
    const second = merged.find((k, i) => i > 0 && !startsWithAny(k, parts) && !endsWithAny(k, parts))
    if (second) parts.push(second)
  }
  // 英文兜底
  if (parts.length < 2 && english.length > 0) parts.push(english[0]!)

  return parts.slice(0, 2).join(' · ') || keywords.slice(0, 2).join(' · ') || '其他'
}

// 「{a}的{b}」感觉差，避免第二个词以已选词为前缀/后缀
function startsWithAny(s: string, prefixes: string[]): boolean {
  return prefixes.some((p) => p.length < s.length && s.startsWith(p))
}
function endsWithAny(s: string, suffixes: string[]): boolean {
  return suffixes.some((p) => p.length < s.length && s.endsWith(p))
}

export class TFIDFEngine implements AIEngine {
  readonly id = 'tfidf-offline'
  readonly requiresApiKey = false

  async cluster(items: ClusterInput[], count?: number): Promise<ClusterResult[]> {
    if (items.length === 0) return []

    // 动态 k：分段策略，避免老版本 min(8, n/15) 的 junk drawer 问题
    //   ≤5 条：1 类（太少没必要拆）
    //   <15 条：2 类
    //   ≥15 条：每 12 条 1 类，上限 20
    // 老版本对 128 条只切 8 类，平均 16/cluster，无关 item 被硬塞进同一个 cluster 形成「纹藏 · agi」
    // 这类杂物抽屉；新版 128 条切 11 类，每类更紧致；剩余难归类的用下面 low-cohesion 检测兜到「其他」。
    const k = count ?? (
      items.length <= 5 ? 1 :
      items.length < 15 ? 2 :
      Math.min(20, Math.ceil(items.length / 12))
    )

    // 关键修复：全局域名停用集
    // 把 corpus 里所有 item 的域名片段汇总，作为统一的停用词。
    // 这样 `arxiv` 不仅在 arxiv.org 的 item 里被过滤，也在 medium.com 那条「arxiv 论文推荐」标题里被过滤——
    // 不然合并出的 cluster 名容易冒出 arxiv / weixin / mp 这种不该当主题名的词。
    const globalStop = new Set<string>()
    for (const item of items) {
      for (const tok of domainStopWords(item.domain)) globalStop.add(tok)
    }

    const docs = items.map((item) => {
      return tokenize(`${item.title} ${item.userNote ?? ''} ${item.excerpt ?? ''}`, globalStop)
    })
    const tfidf = computeTFIDF(docs)
    const assignments = kmeans(tfidf, k)

    // 先聚合
    const groups = new Map<number, { itemIds: string[]; termVec: Map<string, number>; centroid: Map<string, number> }>()
    assignments.forEach((cluster, i) => {
      const g = groups.get(cluster) ?? { itemIds: [] as string[], termVec: new Map<string, number>(), centroid: new Map<string, number>() }
      g.itemIds.push(items[i]!.id)
      for (const [term, score] of (tfidf.get(i) ?? new Map())) {
        g.termVec.set(term, (g.termVec.get(term) ?? 0) + score)
      }
      groups.set(cluster, g)
    })
    // 计算每个 cluster 的 centroid（term 平均向量）
    for (const g of groups.values()) {
      for (const [term, sum] of g.termVec) g.centroid.set(term, sum / g.itemIds.length)
    }

    // ─── 低相似度兜底：检测 cluster 内异常 item，挪到「其他」───────────
    // 对每个 item，算它和所在 cluster centroid 的 cosine sim。
    // 低于阈值的视为「不属于该主题」，挪到统一的「其他」cluster。
    // 阈值 0.15：典型 TF-IDF 同主题文章相似度 0.3+，跨主题 0.05-。0.15 平衡。
    //
    // 但小集合（n < 30）不启用：item 太少时 TF-IDF 噪声大，强行筛掉低相似度 item 会让结果支离破碎。
    // 显式传 count 也不启用：调用方明确要求 X 类，不该被「其他」破坏数量预期（测试场景常用）。
    const ENABLE_OTHERS = items.length >= 30 && count === undefined
    const COHESION_THRESHOLD = 0.15
    const otherIds: string[] = []
    const finalGroups = new Map<number, { itemIds: string[]; termVec: Map<string, number> }>()
    for (const [clusterIdx, g] of groups) {
      if (!ENABLE_OTHERS) {
        // 小集合：原 group 不动
        finalGroups.set(clusterIdx, { itemIds: g.itemIds, termVec: g.termVec })
        continue
      }
      const keepIds: string[] = []
      const keepTermVec = new Map<string, number>()
      for (let i = 0; i < g.itemIds.length; i++) {
        const itemId = g.itemIds[i]!
        const docIdx = items.findIndex((it) => it.id === itemId)
        const vec = tfidf.get(docIdx) ?? new Map()
        const sim = cosineSimilarity(vec, g.centroid)
        if (sim >= COHESION_THRESHOLD) {
          keepIds.push(itemId)
          for (const [term, score] of vec) {
            keepTermVec.set(term, (keepTermVec.get(term) ?? 0) + score)
          }
        } else {
          otherIds.push(itemId)
        }
      }
      if (keepIds.length > 0) {
        finalGroups.set(clusterIdx, { itemIds: keepIds, termVec: keepTermVec })
      }
    }

    return [...finalGroups.values()]
      .filter((g) => g.itemIds.length > 0)
      .map((g) => {
        // 双重保险：选 keyword 时再次过滤全局域名停用集
        // （domain bigram 可能在中文 trigram 切片里残留，比如「arxiv」被切成 ar/xi/iv）
        const cleaned = new Map<string, number>()
        for (const [term, score] of g.termVec) {
          if (globalStop.has(term)) continue
          if (STOP_WORDS.has(term)) continue
          cleaned.set(term, score)
        }
        const keywords = topTerms(cleaned, 6)
        return {
          name: buildClusterName(keywords),
          keywords,
          itemIds: g.itemIds,
        }
      })
      // 附加「其他」cluster：装所有 low-cohesion item
      .concat(otherIds.length > 0 ? [{
        name: '其他',
        keywords: [],
        itemIds: otherIds,
      }] : [])
  }

  async generateQuestion(ctx: QuestionContext): Promise<string> {
    const age = daysSince(ctx.savedAt)
    const timeDesc =
      age < 7 ? '几天前'
      : age < 30 ? `${Math.floor(age / 7)} 周前`
      : age < 365 ? `${Math.floor(age / 30)} 个月前`
      : `${Math.floor(age / 365)} 年前`

    const titleShort = ctx.title.length > 24 ? `${ctx.title.slice(0, 24)}…` : ctx.title

    if (ctx.wakeCount === 0) {
      if (ctx.userNote) {
        return `${timeDesc}你保存这个时写道：「${ctx.userNote}」——现在还有同感吗？`
      }
      // 首次唤醒：嵌入标题或域名，比通用模板更具体
      const firstWakeTemplates = [
        `${timeDesc}你保存了这个，当时是什么触动了你？`,
        `当初从 ${ctx.domain} 保存这篇，是为了什么？`,
        `「${titleShort}」——${timeDesc}的你为什么留下它？`,
      ]
      return firstWakeTemplates[hashIdx(ctx, firstWakeTemplates.length)]!
    }

    // 重复唤醒：扩充到 6 条模板，按 (title 哈希 + wakeCount) 选择保持稳定且多样
    const templates = [
      `这是第 ${ctx.wakeCount + 1} 次看到它——还留着，是因为真的有用，还是舍不得放手？`,
      `它在书房里待了 ${timeDesc} 了，有没有哪怕用过一次？`,
      `${timeDesc}的收藏，现在看还有感觉吗？`,
      `「${titleShort}」——${timeDesc}过去了，你想起它时会想什么？`,
      `${ctx.domain} 的这条收藏，等了 ${timeDesc} 了。`,
      `这个已经在书房 ${timeDesc} 了，该做个决定了吗？`,
    ]
    return templates[hashIdx(ctx, templates.length)]!
  }
}

// 用 title 字符 + wakeCount 当种子，让同一 item 不同唤醒选不同模板，且 deterministic 便于测试
function hashIdx(ctx: QuestionContext, mod: number): number {
  let h = ctx.wakeCount * 31
  for (let i = 0; i < ctx.title.length; i++) h = (h * 33 + ctx.title.charCodeAt(i)) | 0
  return Math.abs(h) % mod
}
