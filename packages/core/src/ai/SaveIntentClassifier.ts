// SaveIntent v2 规则引擎
// 详见 plan: 动机系统 v2 优化 · Sprint A + B 实施方案
//
// 核心设计原则（v1 → v2 升级）：
//   1. 域名信号软化：强域名独立判定，候选域名必须叠加 pattern 才确认
//   2. 中文 pattern 升 2-3 字短语：避免裸字（孤独/温柔）假阳性
//   3. 加 negative patterns：含「班车/福利/年报」的不归 job
//   4. 词典扩 2026 互联网热词（短视频/Vibe Coding 等）
//
// 优先级（first-match wins）：
//   tool → aspire → learn → track → inspire → null
//
// 为什么 aspire > learn：「我是如何学习 X 的」既含 aspire pattern 又含 learn pattern，
// 但用户真实动机更接近"自我叙事/渴望"。

import type { SaveIntent, IntentSignal, Item } from '@chord/types'

export interface IntentInput {
  url: string
  title: string
  domain: string
}

// ═══════════ 域名分档（v2 关键升级）═══════════════════════════
// 强域名：单独触发即归类（高置信度信号）
// 候选域名：必须 + pattern 双命中才归类（容易"什么都有"的域名）
// 弱域名：完全靠 pattern（默认）

const STRONG_TOOL_DOMAINS = [
  'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com',
  'docs.', 'developer.', 'api.', 'pkg.',
  'registry.npmjs.org', 'pypi.org', 'rubygems.org', 'crates.io', 'pkg.go.dev',
  'mdn.', 'developer.mozilla.org',
  'developer.android.com', 'developer.apple.com', 'docs.python.org',
  'help.', 'support.', 'kb.',
]

const STRONG_TRACK_DOMAINS = [
  'techcrunch.com', '36kr.com', 'huxiu.com', 'producthunt.com',
  'news.ycombinator.com', 'theverge.com',
  'techmeme.com', 'venturebeat.com', 'wired.com',
  'twitter.com', 'x.com', 'bilibili.com', 'xiaohongshu.com',
  'reddit.com', 'arstechnica.com',
]

/**
 * 候选 inspire 域名 ← 关键 v2 修复
 * v1: mp.weixin.qq.com 整域名归 inspire → 蔚来班车也被错归（BC-012）
 * v2: 必须域名 + INSPIRE_PATTERNS_CN 双命中才确认是 inspire
 */
const CANDIDATE_INSPIRE_DOMAINS = [
  'medium.com', 'substack.com', 'mp.weixin.qq.com', 'matters.news',
]

// ═══════════ 中文 pattern（v2 升 2-3 字短语）═══════════════════

const TOOL_PATTERNS_CN = [
  /使用|教程|指南|配置|安装|操作|手册|速查|文档|接口|工具|插件|快捷键/,
  /攻略|自动化|提示词|Prompt 工程|工作流/,                    // v2 新增
]

const TOOL_PATTERNS_EN = [
  /\b(how to|tutorial|guide|cheat[\s-]?sheet|reference|tips|tricks|setup|install|configure|docs?|api)\b/i,
]

const ASPIRE_PATTERNS_CN = [
  /我是如何|我的转型|我的经历|从零到|蜕变|成为一名|从.+到.+/,
  /年薪|月薪|自由职业|副业|个人品牌|独立开发|财务自由|提前退休/,
  /(改变了我|改变我的)/,                                          // v2 收紧：删裸 人生/职业/转型/经历/蜕变
  /数字游民|FIRE 退休|Vibe Coding/,                              // v2 新增
  /普通人也能|月入.{1,5}/,                                        // v2 新增
  /副业.{0,6}(月入|赚钱|实现)/,                                   // v2 新增
]

const ASPIRE_PATTERNS_EN = [
  /\b(how i became|my journey|my path|i became|lessons from|what i learned from|i quit|side project|from zero to|six.?figure)\b/i,
]

const LEARN_PATTERNS_CN = [
  /原理|本质|揭秘|内幕|深度解析|讲透|讲清楚|讲明白/,            // v2 删裸 为什么/是什么/理解
  /(深入理解|彻底理解).+/,                                       // v2 新增：必须有"深入/彻底"修饰
  /(入门|进阶|从零开始).{0,6}(指南|教程|课程|笔记)?/,            // v2 新增：入门相关
]

const LEARN_PATTERNS_EN = [
  /\b(understanding|explained|deep dive|internals|how .+ works|introduction to|fundamentals|primer|crash course)\b/i,
]

const TRACK_PATTERNS_CN = [
  /发布|上线|推出|更新|趋势|动态|报告|盘点|榜单|预测|展望|回顾|大事记/,
  /大模型|Agent|智能体|短视频|直播带货/,                          // v2 新增
  /\d{4}.{0,4}(回顾|总结|展望|预测)/,                             // v2 新增："2026 回顾"
]

const TRACK_PATTERNS_EN = [
  /\b(announces|launches|released|releases|new feature|update|roadmap|report|trends?|state of|20\d{2})\b/i,
]

/**
 * INSPIRE 升级（v2 关键修复）：
 * v1：裸字 (孤独|温柔|沉默|生活|日常) 假阳性极高
 * v2：要么文体明确，要么有上下文修饰
 */
const INSPIRE_PATTERNS_CN = [
  /随笔|杂感|碎碎念/,                                          // 文体明确
  /关于.+的(随笔|思考|感悟|沉思)/,                              // "关于 X 的随笔"
  /(一封|写给).+(的信|的话)/,                                   // "一封写给 X 的信"
  /(沉默|孤独|温柔|治愈).{0,4}(诗|故事|时刻|的我|的力量)/,      // "孤独的诗"，不裸字
  /(平凡|普通)的.+(人生|日常|快乐|时光)/,
  /(寻找|追寻).+(意义|自我|可能)/,
]

const INSPIRE_PATTERNS_EN = [
  /\b(beautiful|amazing|essay|poem|reflection|meditation|thoughts on|a love letter to)\b/i,
]

// ═══════════ Negative patterns（v2 新增）══════════════════════
// 含这些词的，即使别的规则命中也排除

/** 公司名 + 这些词 → 排除 job/inspire（员工服务而非招聘/感悟） */
const JOB_INSPIRE_NEGATIVE_CN = /班车|福利|年报|食堂|内部刊物|司庆|员工活动|考勤|出差报销/

/** 这些词出现时 → 一定不是 inspire（即使在 medium / mp.weixin.qq.com） */
const INSPIRE_NEGATIVE_CN = /教程|配置|安装|API|文档|JD|招聘|股票|行情|研报|实战|压测|代码|框架/

// ═══════════ Helpers ═══════════════════════════════════════════

function anyMatch(patterns: RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text))
}

function domainHits(needles: string[], domain: string): boolean {
  return needles.some((d) => domain.includes(d))
}

// ═══════════ 主入口 ═══════════════════════════════════════════

/**
 * 规则引擎判定保存意图。完全离线，无 AI 调用。
 * 返回 null → 让 AI 兜底补判（Sprint A.3）
 */
export function detectIntentByRules(input: IntentInput): SaveIntent | null {
  const { title, domain } = input

  // 1. tool（最高优先级）
  // 强域名独立 / 标题命中任一语言 pattern
  if (
    domainHits(STRONG_TOOL_DOMAINS, domain) ||
    anyMatch(TOOL_PATTERNS_EN, title) ||
    anyMatch(TOOL_PATTERNS_CN, title)
  ) {
    return 'tool'
  }

  // 2. aspire（高于 learn）
  if (anyMatch(ASPIRE_PATTERNS_EN, title) || anyMatch(ASPIRE_PATTERNS_CN, title)) {
    return 'aspire'
  }

  // 3. learn
  if (anyMatch(LEARN_PATTERNS_EN, title) || anyMatch(LEARN_PATTERNS_CN, title)) {
    return 'learn'
  }

  // 4. track（强域名独立）
  if (
    domainHits(STRONG_TRACK_DOMAINS, domain) ||
    anyMatch(TRACK_PATTERNS_EN, title) ||
    anyMatch(TRACK_PATTERNS_CN, title)
  ) {
    return 'track'
  }

  // 5. inspire（v2 关键修复：候选域名必须 + pattern 双命中）
  // 同时尊重 negative pattern：含「教程/招聘/股票」即使域名是 medium 也不是 inspire
  if (INSPIRE_NEGATIVE_CN.test(title) || JOB_INSPIRE_NEGATIVE_CN.test(title)) {
    return null
  }
  const inspireDomainHit = domainHits(CANDIDATE_INSPIRE_DOMAINS, domain)
  const inspirePatternHit = anyMatch(INSPIRE_PATTERNS_EN, title) || anyMatch(INSPIRE_PATTERNS_CN, title)
  if (inspirePatternHit) {
    // pattern 命中无需域名加持（一般 inspire 标题已经够明显）
    return 'inspire'
  }
  if (inspireDomainHit && inspirePatternHit) {
    // 这条逻辑实际上被上面那条覆盖，但保留以表达完整规则
    return 'inspire'
  }
  // v1 老逻辑（只要在 mp.weixin.qq.com 就归 inspire）→ 彻底删除

  return null
}

// ═══════════ Sprint B.1 · 多标签 + 置信度 ═══════════════════

/**
 * 多标签意图打分（Sprint B.1）
 * 跟 detectIntentByRules 不同：所有命中的 intent 都计分，返回 top-2 按 confidence 降序
 *
 * 评分模型：
 *   强域名命中 = 0.6
 *   中文 pattern 命中 = 0.4
 *   英文 pattern 命中 = 0.4
 *   候选域名 + pattern 双命中 = 0.5
 *   negative pattern 命中 = -0.5（基本压死）
 *
 * 每个 intent 的 score 累计后 min(1.0)；得分 > 0.3 才入选 top-2
 */
export function scoreIntents(input: IntentInput): IntentSignal[] {
  const { title, domain } = input
  const scores: Map<SaveIntent, number> = new Map()

  function add(intent: SaveIntent, delta: number) {
    scores.set(intent, (scores.get(intent) ?? 0) + delta)
  }

  // ── tool ────────────────────────────────────
  if (domainHits(STRONG_TOOL_DOMAINS, domain)) add('tool', 0.6)
  if (anyMatch(TOOL_PATTERNS_EN, title)) add('tool', 0.4)
  if (anyMatch(TOOL_PATTERNS_CN, title)) add('tool', 0.4)

  // ── aspire ──────────────────────────────────
  if (anyMatch(ASPIRE_PATTERNS_EN, title)) add('aspire', 0.5)
  if (anyMatch(ASPIRE_PATTERNS_CN, title)) add('aspire', 0.5)

  // ── learn ───────────────────────────────────
  if (anyMatch(LEARN_PATTERNS_EN, title)) add('learn', 0.4)
  if (anyMatch(LEARN_PATTERNS_CN, title)) add('learn', 0.4)

  // ── track ───────────────────────────────────
  if (domainHits(STRONG_TRACK_DOMAINS, domain)) add('track', 0.6)
  if (anyMatch(TRACK_PATTERNS_EN, title)) add('track', 0.4)
  if (anyMatch(TRACK_PATTERNS_CN, title)) add('track', 0.4)

  // ── inspire（最严：negative pattern 直接归 0；候选域名需要 pattern 配合）─
  if (INSPIRE_NEGATIVE_CN.test(title) || JOB_INSPIRE_NEGATIVE_CN.test(title)) {
    // 显式归零（即使其他规则给了分）
    scores.set('inspire', 0)
  } else {
    if (anyMatch(INSPIRE_PATTERNS_EN, title)) add('inspire', 0.5)
    if (anyMatch(INSPIRE_PATTERNS_CN, title)) add('inspire', 0.5)
    // 候选域名 + pattern 双命中加成
    if (domainHits(CANDIDATE_INSPIRE_DOMAINS, domain) && anyMatch(INSPIRE_PATTERNS_CN, title)) {
      add('inspire', 0.2)
    }
  }

  // 排序 + 阈值过滤 + 取 top-2 + 归一化
  return [...scores.entries()]
    .map(([intent, raw]) => ({ intent, confidence: Math.min(1.0, raw), source: 'rule' as const }))
    .filter((s) => s.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 2)
}

// ═══════════ 下游 helpers（向后兼容 saveIntent / saveIntents 双格式）═════

/**
 * 取 item 的主意图。
 * 优先级：saveIntents[0]?.intent > saveIntent（v1 兼容）> null
 *
 * 下游 service 推荐用这个 helper，自动处理新旧数据 fallback。
 */
export function getPrimaryIntent(item: Item): SaveIntent | null {
  if (item.saveIntents && item.saveIntents.length > 0) {
    return item.saveIntents[0]!.intent
  }
  return item.saveIntent ?? null
}

/**
 * 检查 item 的 top-N 意图里是否包含某个 intent。
 * 用于：「这条 item 含有 aspire 信号」（即使不是 top-1）的更敏感检测。
 *
 * 老数据（只有 saveIntent 没有 saveIntents）只看 saveIntent。
 */
export function hasIntent(item: Item, intent: SaveIntent): boolean {
  if (item.saveIntents && item.saveIntents.length > 0) {
    return item.saveIntents.some((s) => s.intent === intent)
  }
  return item.saveIntent === intent
}

/**
 * 取 item 的所有意图列表（含 confidence）
 * 老数据自动 wrap 成单元素数组
 */
export function getAllIntents(item: Item): IntentSignal[] {
  if (item.saveIntents && item.saveIntents.length > 0) {
    return item.saveIntents
  }
  if (item.saveIntent) {
    const src = item.saveIntentSource ?? 'rule'
    return [{
      intent: item.saveIntent,
      confidence: src === 'rule' ? 1.0 : src === 'ai' ? 0.7 : 0.5,
      source: src,
    }]
  }
  return []
}


