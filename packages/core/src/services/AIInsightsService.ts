// CR-030：AI 头条洞察生成器
// 把用户的 cluster / visit / 时间 / 处理决策数据汇总成 AI prompt，
// 让 AI 产出 1 句反直觉的"头条洞察" + 1-2 段补充叙事。
// 失败时返回 null，调用方 fallback 到现有 findings[0]。

import type { StorageAdapter, Finding, Item } from '@chord/types'
import type { AIEngine } from '../ai/AIEngine.js'
import { OpenAICompatibleEngine } from '../ai/OpenAICompatibleEngine.js'
import { daysSince } from '../utils/date.js'
import { groupByCluster } from './ClusterBucketService.js'
// v3.1.25 Phase 4 · banList 从 IdentityConstraints 中心源读
import { constraintPromptFragment } from './IdentityConstraints.js'

// 用户对历史洞察的反馈，喂给 prompt 避免重复出错
export interface InsightFeedback {
  feedbackKey: string
  rating: 'accurate' | 'not_accurate' | 'partial'
  claim: string         // 反馈的洞察原文（让 AI 知道"上次说错了什么"）
  at: number
}

/** v3.1.28 · 反馈闭环 ① · §1-§5 用户反馈的轻量结构（避免引 chrome.storage）*/
export interface SectionFeedbackForAI {
  sectionKey: string
  rating: 'accurate' | 'partial' | 'not_accurate'
  context?: string
  customText?: string
}

export async function generateAIHeadline(
  adapter: StorageAdapter,
  engine: AIEngine,
  opts: {
    visitCounts?: Map<string, number>
    feedbackHistory?: InsightFeedback[]   // §6 自身历史反馈
    /** v3.1.28 · §1-§5 用户反馈，喂 prompt 避免重复说错的角度 */
    sectionFeedback?: SectionFeedbackForAI[]
    // v3.1.11 · 加身份 context，让 AI Headline 跟 §1 人设一致
    identityHint?: {
      comboCode?: string       // 如 "EKP"
      comboName?: string       // 如 "目标驱动型专家"
      consumptionId?: string   // 如 "executor"
      consumptionClaim?: string // 如 §1 的 claim 原文
    }
  } = {},
): Promise<Finding | null> {
  // 只在 AI engine 是可用的 OpenAI-compat 时调（TFIDFEngine 没用）
  if (!(engine instanceof OpenAICompatibleEngine)) return null

  const items = await adapter.getItems({ type: ['content'] })
  if (items.length < 20) return null   // 数据太少没有意义

  const summary = summarizeUserData(items, opts.visitCounts)
  const prompt = buildHeadlinePrompt(summary, opts.feedbackHistory ?? [], opts.identityHint, opts.sectionFeedback ?? [])

  try {
    // 复用 OpenAICompatibleEngine 的私有 chat()——但它是 private。
    // 直接借助 generateQuestion()？不行，那个 prompt 不同。
    // 最简洁：让 engine 暴露一个 generic completion，或者新加一个 method。
    // 短期实用做法：跟 ping() 一样自己 fetch。
    const content = await callAIForHeadline(engine, prompt)
    if (!content) return null

    const parsed = parseHeadlineJSON(content)
    if (!parsed) return null

    return {
      type: 'ai_headline',
      claim: parsed.claim,
      evidence: parsed.evidence,
      aiNarrative: parsed.narrative,
      accentColor: 'linear-gradient(180deg,#FDF0EF,#F5C0BE,#D9706A)',
      eyebrow: '今天的发现',
      metricLabel: '可信度',
      metricValue: parsed.confidence ?? 0.7,
      metricText: parsed.metricText ?? '',
      ctaLabel: parsed.ctaLabel,
      ctaTarget: parsed.ctaTarget,
      feedbackKey: `ai_headline:${hashClaim(parsed.claim)}`,
    }
  } catch (e) {
    console.warn('[Chord] AI headline generation failed:', e)
    return null
  }
}

// ─── 数据汇总 ───────────────────────────────────────────────

interface DataSummary {
  totalItems: number
  totalClusters: number
  overallProcessRate: number   // 整体处理率
  clusterStats: Array<{
    name: string
    total: number
    processed: number
    released: number
    processRate: number
    aspireRate: number          // saveIntent='aspire' 占比
    totalVisits: number
    topItem?: { title: string; ageDays: number; visits: number; processed: boolean }
  }>
  totalVisits: number
  longWaitCount: number         // > 365 天未处理
  longWaitWithVisits: number    // 长期未处理但 history 有访问
  zeroVisitCollections: number  // 收藏后 0 次访问
  recentSaveVelocity: number    // 近 30 天保存数
  histSaveVelocity: number      // 历史月均保存数
}

function summarizeUserData(items: Item[], visitCounts?: Map<string, number>): DataSummary {
  // 共享桶契约：cluster 缺失归 UNCLUSTERED_BUCKET 桶
  const clusterMap = groupByCluster(items)

  const clusterStats: DataSummary['clusterStats'] = []
  let totalVisits = 0
  for (const [name, its] of clusterMap) {
    const total = its.length
    const processed = its.filter((i) => i.status !== 'pending').length
    const released = its.filter((i) => i.status === 'released').length
    const aspireCount = its.filter((i) => i.saveIntent === 'aspire').length
    let clusterVisits = 0
    let topItem: DataSummary['clusterStats'][number]['topItem'] = undefined
    let topVisits = -1
    for (const it of its) {
      const v = visitCounts?.get(it.id) ?? 0
      clusterVisits += v
      if (v > topVisits) {
        topVisits = v
        topItem = {
          title: it.title.slice(0, 40),
          ageDays: daysSince(it.savedAt),
          visits: v,
          processed: it.status !== 'pending',
        }
      }
    }
    totalVisits += clusterVisits

    clusterStats.push({
      name,
      total,
      processed,
      released,
      processRate: total > 0 ? processed / total : 0,
      aspireRate: total > 0 ? aspireCount / total : 0,
      totalVisits: clusterVisits,
      topItem,
    })
  }

  // 按收藏数倒序
  clusterStats.sort((a, b) => b.total - a.total)

  const longWait = items.filter((i) => i.status === 'pending' && daysSince(i.savedAt) >= 365)
  const longWaitWithVisits = longWait.filter((i) => (visitCounts?.get(i.id) ?? 0) > 0).length
  const zeroVisit = items.filter((i) => (visitCounts?.get(i.id) ?? 0) === 0).length

  const now = Date.now()
  const recent30 = items.filter((i) => now - i.savedAt <= 30 * 86400000).length
  const histDays = Math.max(30, daysSince(Math.min(...items.map((i) => i.savedAt))))
  const histMonthly = items.length / (histDays / 30)

  return {
    totalItems: items.length,
    totalClusters: clusterMap.size,
    overallProcessRate: items.length > 0 ? items.filter((i) => i.status !== 'pending').length / items.length : 0,
    clusterStats,
    totalVisits,
    longWaitCount: longWait.length,
    longWaitWithVisits,
    zeroVisitCollections: zeroVisit,
    recentSaveVelocity: recent30,
    histSaveVelocity: histMonthly,
  }
}

// ─── Prompt 构造 ───────────────────────────────────────────

function buildHeadlinePrompt(
  s: DataSummary,
  feedback: InsightFeedback[],
  identityHint?: {
    comboCode?: string
    comboName?: string
    consumptionId?: string
    consumptionClaim?: string
    // v3.1.24 · 加 mindset/radius 完整画像，避免 §6 跟 §1 当下行为矛盾
    //   案例：用户 mindset=RETURNER（最近翻老收藏做决定），AI 不知道这点
    //   生成 headline 时可能说"你最近又开了新方向"，跟 §1 直接打架
    mindsetId?: string
    mindsetClaim?: string
    radiusId?: string
    radiusClaim?: string
  },
  sectionFeedback: SectionFeedbackForAI[] = [],
): string {
  const topClusters = s.clusterStats.slice(0, 6).map((c) =>
    `- 「${c.name}」: 收藏 ${c.total}, 处理 ${c.processed} (${Math.round(c.processRate * 100)}%), aspire 占比 ${Math.round(c.aspireRate * 100)}%, 过去 90 天访问 ${c.totalVisits} 次`
    + (c.topItem ? `，其中访问最多的「${c.topItem.title}」收藏 ${c.topItem.ageDays} 天，访问 ${c.topItem.visits} 次${c.topItem.processed ? '（已处理）' : '（未处理）'}` : '')
  ).join('\n')

  const feedbackSection = feedback.length > 0
    ? `\n\n## 用户对历史 §6 洞察的反馈（避免重复犯错）\n${feedback.map((f) => `- ${f.rating === 'accurate' ? '✓ 准确' : f.rating === 'not_accurate' ? '✗ 不准' : '~ 部分对'}: "${f.claim.slice(0, 80)}"`).join('\n')}`
    : ''

  // v3.1.28 · 反馈闭环 ① · 把 §1-§5 反馈也喂进来 → AI 知道哪些角度被否过
  const SECTION_LABEL_CN: Record<string, string> = {
    identity: '§1 你是谁', insight: '§2 数字反差', terrain: '§3 兴趣地形',
    timeline: '§4 你正在变成', guidance: '§5 心理引导',
  }
  const sectionFbSection = sectionFeedback.length > 0
    ? `\n\n## §1-§5 用户反馈（这次的 §6 不要重复被说"不准"的角度）\n${sectionFeedback.slice(-15).map((f) => {
        const label = SECTION_LABEL_CN[f.sectionKey] ?? f.sectionKey
        const ratingTxt = f.rating === 'accurate' ? '✓ 准' : f.rating === 'not_accurate' ? '✗ 不准' : '~ 部分对'
        const ctx = f.context ? `（${f.context.slice(0, 30)}）` : ''
        const custom = f.customText ? ` —— 用户写："${f.customText.slice(0, 60)}"` : ''
        return `- ${ratingTxt} ${label}${ctx}${custom}`
      }).join('\n')}`
    : ''

  // v3.1.25 Phase 4 · banList 从 IdentityConstraints 中心源读
  //   之前每个段各自维护 banList，导致 §5 跟 §6 的 banList 不同步，新增身份要多处补。
  //   现在统一从 IdentityConstraints[consumption].bannedAngles 拿。
  let identityRules = ''
  if (identityHint?.consumptionId) {
    const identityLabel = identityHint.comboName
      ? `${identityHint.comboCode ?? ''} · ${identityHint.comboName}`
      : identityHint.consumptionId
    // mindset/radius claim 也喂给 AI，确保跟当下行为不矛盾
    const mindsetLine = identityHint.mindsetClaim ? `\n- §1 当下心境（mindset）: "${identityHint.mindsetClaim}"` : ''
    const radiusLine = identityHint.radiusClaim ? `\n- §1 注意力半径（radius）: "${identityHint.radiusClaim}"` : ''
    // 从中心源拿身份硬约束
    const centralBanList = constraintPromptFragment(identityHint.consumptionId)

    identityRules = `

## ⚠️ 跟 §1 身份保持一致

用户的 §1 主画像是: **${identityLabel}**
${identityHint.consumptionClaim ? `- §1 的消费风格 claim: "${identityHint.consumptionClaim}"` : ''}${mindsetLine}${radiusLine}

→ 你的 AI Headline **不能跟 §1 的任意一个维度矛盾**。尤其要尊重 mindset 描述的"当下行为"——
比如用户当下是"翻老收藏做决定"（RETURNER），就别说他"最近又开了新方向"。
${centralBanList}
`
  }

  return `你是一位敏锐的"自我观察助手"。你的任务是从用户的收藏行为数据中，找出**一个反直觉的发现**，跟用户对话。

⚠️ 不要说空话——必须基于具体数字。**不要说「你可能在焦虑」「这是真实的你」这种泛泛而谈**。要像朋友指出"你没意识到的模式"那样具体。

⚠️ v3.1.25 三条硬约束：
1. **只能用下面"用户数据"section 里提供的具体数字**——不能编造、不能近似、不能"约 X 条"。如果数据里没有的角度（比如保存时段），就不要谈那个角度。
2. **禁止"看似 X，实则 Y"这种悖论句式**——这种句式 95% 会跟 §1 主画像打架（"看似均衡，实则未知"就是反例）。反直觉发现是在 §1 画像**内**找一个具体 cluster 或具体行为的反直觉，不是反 §1 整体画像。
3. **如果整体处理率高，就不要说"你收藏了 N 条却从未打开"这种总量级断言**——这跟 §1 画像直接矛盾。处理率高的用户，反差点在**某个具体 cluster**（如"你 90% 都消化了，但「X」这一块例外"），不在总量。

## 用户数据

- 总收藏: ${s.totalItems} 条
- 主题数: ${s.totalClusters} 个
- 整体处理率: ${Math.round(s.overallProcessRate * 100)}%
- 过去 90 天总访问: ${s.totalVisits} 次
- 长期未处理（>1年）: ${s.longWaitCount} 条，其中 ${s.longWaitWithVisits} 条用户其实有访问
- 从未访问过的收藏: ${s.zeroVisitCollections} 条
- 近 30 天保存速度: ${s.recentSaveVelocity} 条
- 历史月均保存速度: ${Math.round(s.histSaveVelocity)} 条

## 主要主题（按收藏量倒序，前 6 个）

${topClusters}
${identityRules}
${feedbackSection}${sectionFbSection}

## 输出要求

找出**一个最戏剧性、最反直觉、最能让用户停下来想 3 秒的发现**。例如：
- "你保存了 N 篇 X，但只访问过 M 篇——你拥有知识但没真的学"
- "你最常在周日深夜保存，但周二中午才打开——焦虑型保存 vs 工作日实际消费"
- "你对 X 处理率最高 Y%，但保存最多的却是 Z——'真在做'和'想成为'是不一样的"
- "X 是你 90 天访问最多的主题，但你只收藏过 N 条——它在你心里很重要"

避免：
- "你可能在焦虑"（泛泛）
- "这是真实的你"（套话）
- 罗列所有主题（要聚焦 1 个）

返回 JSON：
\`\`\`json
{
  "claim": "一句话主标题（不超过 30 字，反直觉、具体到数字）",
  "evidence": "1-2 句证据说明，引用具体数据（不超过 80 字）",
  "narrative": ["补充段落 1（可选）", "补充段落 2（可选）"],
  "confidence": 0.0-1.0,
  "metricText": "关键数字（如 '23 次访问 · 8 条收藏'）",
  "ctaLabel": "可选行动按钮文字",
  "ctaTarget": "可选跳转 hash（如 #terrain?cluster=X）"
}
\`\`\`

只返回 JSON，不要其他文字。`
}

interface ParsedHeadline {
  claim: string
  evidence: string
  narrative?: string[]
  confidence?: number
  metricText?: string
  ctaLabel?: string
  ctaTarget?: string
}

function parseHeadlineJSON(raw: string): ParsedHeadline | null {
  let cleaned = raw.trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
  const fb = cleaned.indexOf('{')
  const lb = cleaned.lastIndexOf('}')
  if (fb < 0 || lb < fb) return null
  cleaned = cleaned.slice(fb, lb + 1)
  try {
    const obj = JSON.parse(cleaned) as ParsedHeadline
    if (!obj.claim || !obj.evidence) return null
    return obj
  } catch {
    return null
  }
}

// ─── AI 调用 ────────────────────────────────────────────────

interface OpenAICompatibleEngineWithCfg extends OpenAICompatibleEngine {
  // 复用 engine 配置访问；OpenAICompatibleEngine 把 cfg 设为 private。
  // 借助 generateQuestion path 跑——但 prompt 不一样。这里直接复用 chat() 也是 private。
  // 解决方法：让 OpenAICompatibleEngine 暴露 generic chat method（见 patch）
}

async function callAIForHeadline(engine: OpenAICompatibleEngine, prompt: string): Promise<string | null> {
  // OpenAICompatibleEngine 暴露 generic completion 方法 chatCompletion
  // 见 OpenAICompatibleEngine.ts CR-030 patch
  const ext = engine as unknown as { chatCompletion?: (prompt: string, opts: { maxTokens: number; temperature: number }) => Promise<string> }
  if (typeof ext.chatCompletion !== 'function') {
    console.warn('[Chord] OpenAICompatibleEngine.chatCompletion not available')
    return null
  }
  return ext.chatCompletion(prompt, { maxTokens: 2048, temperature: 0.7 })
}

function hashClaim(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return h.toString(36)
}

// ─── 反馈存储 ───────────────────────────────────────────────

const FEEDBACK_KEY = 'chord_insights_feedback'

export async function saveInsightFeedback(
  feedback: InsightFeedback,
): Promise<void> {
  // 用 chrome.storage.local（在 extension 侧）；纯 core 库不应直接用，所以接受 adapter？
  // 简化：让调用方（UI 层）处理 storage 读写，本服务只负责类型。
  // 此函数仅占位——后续如果搬到 core 内部，可接 adapter.batch
  throw new Error('saveInsightFeedback should be called via extension storage layer')
}
