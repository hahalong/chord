/**
 * PsychGuidanceService —— §5 心理引导文案生成器
 *
 * 这是隐性自我升级最特别的层（4 个变体都缺）。
 * 4 槽文案：
 *   1. 命名模式 (naming)        —— 用心理学语言给行为起名字，不评判
 *   2. 指出代价 (cost)          —— 用具体数字看见成本
 *   3. 小实验邀请 (experiment)  —— 7 天 / 30 分钟级别可执行，可逆
 *   4. 重构叙事 (reframe)       —— 从"我有问题"变成"我看见自己的模式"
 *
 * 设计原则（详见 plan §二、§二·补）：
 *   - 不评判：不说"你有问题"，说"我看见这个模式"
 *   - 具体：用用户实际数据（"487 条" "6 个月"）
 *   - 温柔但敢戳痛点：D 隐喻 + B 诚实 + CBT 命名
 *   - 小实验而非大决心：行动门槛 < 7 天 / 30 分钟
 *   - 重构而非批判：每个"问题模式"背后都有合理心理需求
 *
 * 文案纪律：活人感 + 触动感（plan §二·补）——
 *   ✗ 数据报告腔 / 道理空话 / AI 总结腔 / 学术装腔
 *   ✓ 像懂你的朋友在说话 / 具体到让人发笑 / 温柔反讽 / 承认背后的合理性
 */

import type { Item, IdentityCard, IdentityId } from '@chord/types'
// v3.1.25 Phase 4 · banList 从 IdentityConstraints 中心源读
import { constraintPromptFragment } from './IdentityConstraints.js'

const DAY = 86_400_000

export interface PsychGuidance {
  /** 组合命名，如「信息焦虑囤积家」 */
  comboName: string
  /** 4 槽文案，已 fill 好用户实际数字 */
  slots: {
    naming: string
    cost: string
    experiment: string
    reframe: string
  }
}

export interface PsychGuidanceInput {
  cards: IdentityCard[]
  items: Item[]
  visitCounts?: Map<string, number>
  now?: number
}

// ─── 主入口 ─────────────────────────────────────────────

export function generateGuidance(input: PsychGuidanceInput): PsychGuidance | null {
  const { cards, items, now = Date.now() } = input
  if (cards.length === 0) return null

  // 关键数据点（4 槽里多处会用到）
  const data = computeDataPoints(items, now)
  if (data.total < 10) return null

  // 1. 算组合名
  const comboName = deriveComboName(cards)
  // 2. 按组合 / 主身份查模板
  //    v3.1.22 · lookup 顺序：
  //      a) 3 维精确 key（如 'dormant+generalist+hoarder' = 沉睡的囤积家）
  //      b) "stopped:{consumption}" — 当 mindset = dormant/settler（已停下）时
  //         强制走"停下来"视角的模板，避免 hoarder UNIVERSAL_FALLBACK 误说"存东西的那一瞬..."
  //    v3.1.24 加：
  //      c) "returning:{consumption}" — 当 mindset = returner（已经在翻老收藏整理）时
  //         走"已经在做"视角的模板，引导词不该再叫他开始（他已经在做了）
  //      d) primary:{cards[0].id} 单维度兜底
  //      e) UNIVERSAL_FALLBACK
  const key = makeComboKey(cards)
  const mindset = cards.find((c) => c.dimension === 'mindset')
  const consumption = cards.find((c) => c.dimension === 'consumption')
  const isStopped = mindset && (mindset.id === 'dormant' || mindset.id === 'settler')
  const isReturning = mindset && mindset.id === 'returner'
  const stoppedKey = isStopped && consumption ? `stopped:${consumption.id}` : undefined
  const returningKey = isReturning && consumption ? `returning:${consumption.id}` : undefined
  // v3.1.25 修：primary fallback 必须用 consumption.id 而非 cards[0].id
  //   原 bug：cards 按 extremity 排，cards[0] 可能是 mindset（如 SETTLER）
  //   → 'primary:settler' 未定义 → UNIVERSAL_FALLBACK → 出现 "存东西的瞬间" 跟 SETTLER 状态矛盾
  const primaryKey = consumption ? `primary:${consumption.id}` : `primary:${cards[0]!.id}`
  const template
    = COMBO_TEMPLATES[key]
    ?? (stoppedKey ? COMBO_TEMPLATES[stoppedKey] : undefined)
    ?? (returningKey ? COMBO_TEMPLATES[returningKey] : undefined)
    ?? COMBO_TEMPLATES[primaryKey]
    ?? UNIVERSAL_FALLBACK

  return {
    comboName,
    slots: {
      naming: fillTemplate(template.naming, data),
      cost: fillTemplate(template.cost, data),
      experiment: fillTemplate(template.experiment, data),
      reframe: fillTemplate(template.reframe, data),
    },
  }
}

// ─── v3.1.25 · AI 动态生成（千人千面）─────────────────────
//
// 设计目的：模板路径（generateGuidance）只能从 27 个静态模板里挑——千人千面做不到。
// AI 路径：基于完整三维身份 + 用户实际数据 + §2 反差信号，按 CBT 4 槽框架动态生成。
//
// 调用模式（参考 §6 AIInsightsService.generateAIHeadline）：
//   1. Profile.tsx 先调 generateGuidance()（同步模板，立即渲染保证 §5 不空白）
//   2. Profile.tsx 异步调 generateGuidanceAI()，AI 成功 → 无缝替换 §5 内容
//   3. AI 失败/无 key → 保留模板版本（不破 base 体验）

/** v3.1.28 · 反馈闭环 ① · §1-§5 用户反馈的轻量结构（避免引 chrome.storage）*/
export interface SectionFeedbackForAI {
  /** 'identity' / 'insight' / 'terrain' / 'timeline' / 'guidance' */
  sectionKey: string
  rating: 'accurate' | 'partial' | 'not_accurate'
  /** 反馈对象的内容指纹（如 §1 用 comboCode "HDG"）—— 让 AI 知道反馈针对什么 */
  context?: string
  /** 「+ 我来说」自定义文本 */
  customText?: string
}

export interface GuidanceAIInput extends PsychGuidanceInput {
  /** §2 触发的反差洞察文本（让 §5 跟 §2 接住但不重复）*/
  dramaticInsightTexts?: string[]
  /** §4 触发的行为变化文本（让 §5 接住当下行为变化）*/
  changeSignalTexts?: string[]
  /** v3.1.28 · §1-§5 用户反馈，喂 prompt 避免重复说错的角度 */
  sectionFeedback?: SectionFeedbackForAI[]
}

export async function generateGuidanceAI(
  engine: unknown,
  input: GuidanceAIInput,
): Promise<PsychGuidance | null> {
  // 1. 引擎类型守卫：必须是 OpenAI-compat engine 且暴露 chatCompletion
  const eng = engine as { chatCompletion?: (prompt: string, opts: { maxTokens: number; temperature: number }) => Promise<string> }
  if (typeof eng?.chatCompletion !== 'function') return null

  const { cards, items, now = Date.now() } = input
  if (cards.length === 0) return null

  // 2. 收集 prompt 需要的数据
  const data = computeDataPoints(items, now)
  if (data.total < 10) return null

  // 3. 三维身份描述
  const consumption = cards.find((c) => c.dimension === 'consumption')
  const mindset = cards.find((c) => c.dimension === 'mindset')
  const radius = cards.find((c) => c.dimension === 'radius')

  // 4. chip 分布
  const chipCount: Record<string, number> = {}
  for (const it of items) {
    if (it.usageChip) chipCount[it.usageChip] = (chipCount[it.usageChip] ?? 0) + 1
  }
  const totalChips = Object.values(chipCount).reduce((s, n) => s + n, 0)
  const chipLines = Object.entries(chipCount)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  · ${k}: ${v} 条 (${Math.round(v / Math.max(1, data.total) * 100)}%)`)
    .join('\n')

  // 5. cluster top 5
  const clusterCounts = new Map<string, { total: number; processed: number }>()
  for (const it of items) {
    if (!it.cluster) continue
    const b = clusterCounts.get(it.cluster) ?? { total: 0, processed: 0 }
    b.total++
    if (it.status !== 'pending') b.processed++
    clusterCounts.set(it.cluster, b)
  }
  const topClusterLines = [...clusterCounts.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([name, b]) =>
      `  · 「${name}」: ${b.total} 条 (处理率 ${Math.round(b.processed / b.total * 100)}%)`,
    )
    .join('\n')

  // 6. 私注密度
  const noted = items.filter((i) => !!i.privateNote && i.privateNote.trim().length > 0).length
  const noteRate = data.total > 0 ? noted / data.total : 0

  // 7. 构造 prompt
  const prompt = buildGuidancePrompt({
    cards: { consumption, mindset, radius },
    data,
    chipLines,
    totalChips,
    topClusterLines,
    noted,
    noteRate,
    dramaticInsightTexts: input.dramaticInsightTexts ?? [],
    changeSignalTexts: input.changeSignalTexts ?? [],
    sectionFeedback: input.sectionFeedback ?? [],
  })

  // 8. 调 AI
  try {
    const raw = await eng.chatCompletion(prompt, { maxTokens: 2048, temperature: 0.7 })
    if (!raw) return null
    const parsed = parseGuidanceJSON(raw)
    if (!parsed) return null
    return parsed
  } catch (e) {
    console.warn('[Chord] AI guidance generation failed:', e)
    return null
  }
}

interface BuildGuidanceArgs {
  cards: {
    consumption: IdentityCard | undefined
    mindset: IdentityCard | undefined
    radius: IdentityCard | undefined
  }
  data: DataPoints
  chipLines: string
  totalChips: number
  topClusterLines: string
  noted: number
  noteRate: number
  dramaticInsightTexts: string[]
  changeSignalTexts: string[]
  sectionFeedback: SectionFeedbackForAI[]
}

function buildGuidancePrompt(args: BuildGuidanceArgs): string {
  const { cards, data, chipLines, totalChips, topClusterLines, noted, noteRate, dramaticInsightTexts, changeSignalTexts, sectionFeedback } = args

  const identityLines = [
    cards.consumption ? `  - 消费风格 (${cards.consumption.id}): ${cards.consumption.claim}` : '',
    cards.mindset ? `  - 当下心境 (${cards.mindset.id}): ${cards.mindset.claim}` : '',
    cards.radius ? `  - 注意力半径 (${cards.radius.id}): ${cards.radius.claim}` : '',
  ].filter(Boolean).join('\n')

  const insightSection = dramaticInsightTexts.length > 0
    ? `\n## §2 已经告诉用户的数字反差（§5 不要重复同样的句子）\n${dramaticInsightTexts.map((t) => `  · ${t}`).join('\n')}`
    : ''

  const changeSection = changeSignalTexts.length > 0
    ? `\n## §4 已经告诉用户的行为变化（§5 可以接住但不重复）\n${changeSignalTexts.map((t) => `  · ${t}`).join('\n')}`
    : ''

  // v3.1.28 · 反馈闭环 ① · §1-§5 用户反馈（让 AI 知道哪些角度被用户说过"不准"，避免再撞）
  const SECTION_LABEL_CN: Record<string, string> = {
    identity: '§1 你是谁', insight: '§2 数字反差', terrain: '§3 兴趣地形',
    timeline: '§4 你正在变成', guidance: '§5 心理引导',
  }
  const fbSection = sectionFeedback.length > 0
    ? `\n## §1-§5 用户对历史内容的反馈（§5 生成时必须避免被说"不准"的角度）\n${sectionFeedback.slice(-15).map((f) => {
        const label = SECTION_LABEL_CN[f.sectionKey] ?? f.sectionKey
        const ratingTxt = f.rating === 'accurate' ? '✓ 准' : f.rating === 'not_accurate' ? '✗ 不准' : '~ 部分对'
        const ctx = f.context ? `（${f.context.slice(0, 30)}）` : ''
        const custom = f.customText ? ` —— 用户写："${f.customText.slice(0, 60)}"` : ''
        return `  · ${ratingTxt} ${label}${ctx}${custom}`
      }).join('\n')}`
    : ''

  // v3.1.25 Phase 4 · banList 从 IdentityConstraints 中心源读（不再各自维护）
  const banLines = constraintPromptFragment(cards.consumption?.id)

  return `你是一位 CBT（认知行为疗法）取向的"自我观察助手"。基于用户的完整三维身份 + 实际数据，按 CBT 4 槽框架生成一段**专属于这个用户**的心理引导。

## 用户的三维身份（§1 主画像）

${identityLines}

## 用户实际数据

  - 总收藏: ${data.total} 条（处理 ${data.processed}，待处理 ${data.pending}，放手 ${data.released}）
  - 整体处理率: ${Math.round(data.processRate * 100)}%
  - 最老收藏来自: ${data.oldestMonthsAgo} 个月前
  - 主题数: ${data.clusterCount} 个

  Top 5 主题：
${topClusterLines || '  · （无 cluster 数据）'}

  Chip 分布（用户给收藏盖的章 · 共 ${totalChips} 条标过）：
${chipLines || '  · （无 chip 数据）'}

  私注: 写过一句话的 ${noted} 条（${Math.round(noteRate * 100)}%）
${insightSection}${changeSection}${fbSection}

## CBT 4 槽框架（严格遵守）

1. **看见模式 (naming)**：用心理学/行为学语言**命名**用户的核心行为模式
   - 命名一个模式，不只描述数字（如「信息焦虑回避」「行动型囤积」「审美的克制」）
   - 让用户感到"被准确观察"，不被评判
   - 短句 + 用 <strong>包住命名关键词</strong>

2. **它的代价 (cost)**：用用户**实际数字**让代价可见
   - 必须引用具体数字（用上面"实际数据"的真实值，**不能编造**）
   - 不评判，只看见。用 <em>包住代价细节</em>
   - 不能跟整体处理率打架（如处理率 75% 就不要说"基本没看过"）

3. **一个小实验 (experiment)**：7 天/30 分钟可执行的**具体动作**
   - 必须具体到打开几条、写几句话、做什么动作
   - 必须明确"做完能看见什么"（让用户知道这步的意义）
   - 用 <strong>试试这一周/这 7 天</strong> 开头
   - 不是"想一想"，是"打开/写/做"

4. **重构 (reframe)**：拆掉做 experiment 的心理阻碍
   - **重构不软化 experiment**——是给行动合法化、拆"我有问题"的自责框架
   - 肯定用户的身份特质 + 给行动新视角
   - 用 <strong>包住正向重构句</strong>

## 千人千面纪律

- **每条都要用用户的具体数字 / 具体 cluster 名 / 具体 chip 信号**——不写泛泛文案
- **跟 §1 三维身份都不矛盾**：尤其要尊重 mindset 描述的"当下行为"（如 RETURNER=正在翻老收藏，那 experiment 就别叫他"开始整理"，要说"继续这个节奏"）
- **跟 §2 §4 不重复**：那是数字反差和行为变化的陈述，§5 是心理引导的命名 + 行动 + 重构
- **语气：活人感 + 温柔反讽 + 具体到让人发笑**——不要数据报告腔/道理空话/AI 总结腔${banLines}

## 输出格式

返回 JSON：
\`\`\`json
{
  "comboName": "(用户的画像名，如果三维都齐就拼一个 4-5 字精炼画像名，否则留空字符串)",
  "slots": {
    "naming": "命名+短解释，含 <strong>",
    "cost": "具体数字+代价描述，含 <em>",
    "experiment": "<strong>试试这一周</strong>+具体动作+明确产出",
    "reframe": "<strong>正向重构</strong>+拆自责框架"
  }
}
\`\`\`

只返回 JSON，不要其他文字。`
}

function parseGuidanceJSON(raw: string): PsychGuidance | null {
  let cleaned = raw.trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
  const fb = cleaned.indexOf('{')
  const lb = cleaned.lastIndexOf('}')
  if (fb < 0 || lb < fb) return null
  cleaned = cleaned.slice(fb, lb + 1)
  try {
    const obj = JSON.parse(cleaned)
    const slots = obj?.slots
    if (!slots || !slots.naming || !slots.cost || !slots.experiment || !slots.reframe) {
      return null
    }
    return {
      comboName: typeof obj.comboName === 'string' ? obj.comboName : '',
      slots: {
        naming: String(slots.naming),
        cost: String(slots.cost),
        experiment: String(slots.experiment),
        reframe: String(slots.reframe),
      },
    }
  } catch {
    return null
  }
}

// ─── 数据计算 ───────────────────────────────────────────

interface DataPoints {
  total: number
  processed: number
  pending: number
  released: number
  processRate: number
  oldestMonthsAgo: number
  monthsSpan: number
  /** 总的 cluster 数（不是 top cluster 的 item 数）*/
  clusterCount: number
  /** top cluster 名 + 条数 */
  topClusterName?: string
  topClusterCount?: number
  topClusterRate?: number
  /** 0 访问的 cluster 名 + 条数（最大的）*/
  illusionClusterName?: string
  illusionClusterCount?: number
}

function computeDataPoints(items: Item[], now: number): DataPoints {
  const total = items.length
  const processed = items.filter((i) => i.status !== 'pending').length
  const pending = items.filter((i) => i.status === 'pending').length
  const released = items.filter((i) => i.status === 'released').length
  const processRate = total > 0 ? processed / total : 0

  const oldestSavedAt = total > 0 ? Math.min(...items.map((i) => i.savedAt)) : now
  const oldestMonthsAgo = Math.floor((now - oldestSavedAt) / DAY / 30)
  const monthsSpan = Math.max(1, oldestMonthsAgo)

  // top cluster
  const counts = new Map<string, number>()
  for (const i of items) {
    if (!i.cluster) continue
    counts.set(i.cluster, (counts.get(i.cluster) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted[0]

  return {
    total,
    processed,
    pending,
    released,
    processRate,
    oldestMonthsAgo,
    monthsSpan,
    clusterCount: counts.size,
    topClusterName: top?.[0],
    topClusterCount: top?.[1],
    topClusterRate: top ? top[1] / total : undefined,
  }
}

// ─── 文案模板 ───────────────────────────────────────────

interface GuidanceTemplate {
  naming: string
  cost: string
  experiment: string
  reframe: string
}

const UNIVERSAL_FALLBACK: GuidanceTemplate = {
  naming: '存东西的那一瞬，<strong>大脑误以为已经完成了学习</strong>——这不是骗你，是个小小的安抚，对未来不确定性的安抚。',
  cost: '过去 {{monthsSpan}} 个月你存了 <strong>{{total}} 条</strong>，每条都在收藏夹里挂着。每次打开是 {{total}} 次微小的"我还没完成"提醒。',
  experiment: '<strong>试试这 7 天</strong>：每次想保存前，问自己一句"现在能不能读 5 分钟？"——能就读，不能就放弃，不收藏。<em>不为了减少，为了看清自己到底在保存什么。</em>',
  // v3.1.23 · 旧 reframe "看见它，比批判它有用" 跟 exp 的"做选择"动作弱反——暗示用户不必行动。
  //   新 reframe：把"看见"接到 exp 的"问 5 分钟"动作上——看见的瞬间已经在替代自动保存了。
  reframe: '你不是懒。<strong>每条保存都是一次小小的「以后再说」</strong>——这是大脑对"我可能错过什么"的安抚。<em>看见它的那一瞬，你已经少了一次自动保存。</em>',
}

const COMBO_TEMPLATES: Record<string, GuidanceTemplate> = {
  // ─── 信息焦虑囤积家 · HOARDER + EXPLORER + GENERALIST ───────
  'explorer+generalist+hoarder': {
    naming: '存东西的那一瞬，<strong>大脑误以为已经完成了学习</strong>——这不是骗你，是个小小的安抚。你又好奇又害怕错过，三股力同时拉扯你。',
    cost: '过去 {{monthsSpan}} 个月你存了 <strong>{{total}} 条</strong>，处理了 {{processed}} 条。每次打开收藏夹，是 {{pending}} 次微小的"我还没完成"提醒。<em>一年累计大概 {{annualReminders}} 次。</em>',
    experiment: '<strong>试试这 7 天</strong>：每次想保存前，问自己一句"现在能不能读 5 分钟？"——能就读，不能就放弃，不收藏。<em>不为了减少，为了看清自己到底在保存什么。</em>',
    // v3.1.23 · 同 UNIVERSAL_FALLBACK 修法——reframe 直接接 exp 的"问 5 分钟"动作
    reframe: '你不是懒。<strong>每条保存都是一次小小的「以后再说」</strong>——这是大脑对"我可能错过什么"的安抚。<em>看见它的那一瞬，你已经少了一次自动保存。</em>',
  },

  // ─── 深耕策展人 · CURATOR + SETTLER + SPECIALIST ──────────
  'curator+settler+specialist': {
    naming: '你的注意力像聚光灯——不是越亮越好，是<strong>对的位置才亮</strong>。这是种克制的奢侈，不是每个人都做得到。',
    cost: '你的书房没那么吵，{{total}} 条里 {{processed}} 条你都真的翻看过、做过决定了。<em>代价不是焦虑，是错过——那些你从来没让自己看到的世界。</em>',
    experiment: '<strong>试试这一周</strong>：故意保存一个你"觉得没什么意思"的领域 1-2 条。不是要你喜欢，是给好奇心一个出口。',
    reframe: '深耕不是窄。<strong>是你已经知道自己在哪条河里。</strong>偶尔尝一口别的水，不会让你迷路。',
  },

  // ─── 目标驱动型专家 · EXECUTOR + SEEKER + SPECIALIST ──────
  'executor+seeker+specialist': {
    naming: '你保存的不是内容，是<strong>把工具放在手边</strong>——存即用，用即清，干净利落。',
    cost: '<strong>{{processRate}}% 的处理率</strong>是惊人的数字——但你可能错过了"看似无用"的那些。最不实用的内容有时是给未来留的种子。',
    experiment: '<strong>试试这一周</strong>：保存一条你<em>暂时用不上</em>但觉得"有趣"的——只是为了好奇而存，不为了某个项目。',
    reframe: '你的目标感是优势。<strong>但有些值得的东西要等几年才显形。</strong>给它们一点空间。',
  },

  // ─── 反思型杂食回归者 · THINKER + RETURNER + GENERALIST ────
  'generalist+returner+thinker': {
    naming: '你跟过去的自己<strong>有未完成的对话</strong>——每次翻老收藏，都是问"3 个月前的我为什么存这个"。这是一种慢但深的学习方式。',
    cost: '<strong>{{pending}} 条还在等你回头</strong>，最老的来自 {{oldestMonthsAgo}} 个月前。它们不催你，但每次想起都有一点重量。',
    experiment: '<strong>试试这一周</strong>：每天处理 1 条 6 个月以上的老收藏——不一定留下来，决定本身就是动作。',
    reframe: '你不是没在前进。<strong>反思型的人是把过去当镜子在走。</strong>这条路慢一些，但留下的脚印更深。',
  },

  // ─── 慢品大师 · SLOW_READER + SETTLER + SPECIALIST ────────
  'settler+slow_reader+specialist': {
    naming: '你的节奏跟<strong>"高效率"那个口号不在一个时区</strong>。这不是慢半拍，是你选择了不一样的速度。',
    cost: '世界很急。你保存的 {{total}} 条里 {{processed}} 条都真的看过、做过决定，<em>但偶尔会有"我是不是太慢了"的疑虑。</em>这是噪音，不是真相。',
    experiment: '<strong>试试这一周</strong>：不要催自己。允许"读完这一条再说"成为今天的小胜利。',
    reframe: '慢不是缺点。<strong>慢是为了让东西真的进来。</strong>快读 10 条不如慢读 1 条进入你。',
  },

  // ─── 怀旧型醒悟者 · HOARDER + RETURNER + SPECIALIST ───────
  'hoarder+returner+specialist': {
    naming: '你<strong>正在跟过去的囤积谈判</strong>——意识到那些"以后会读"很多不会发生了。这是醒来的时刻，不是失败的时刻。',
    cost: '你存了 {{total}} 条，最老的来自 {{oldestMonthsAgo}} 个月前。<em>它们见证了你以前在意的，但你已经不是那个人了。</em>',
    experiment: '<strong>试试这一周</strong>：每天放手 3 条 1 年前的收藏——只放手，不补新的。让书房瘦下来。',
    reframe: '你不是在丢东西。<strong>你是在确认自己变成了谁。</strong>放手是承认成长，不是浪费。',
  },

  // ─── 短时实验家 · EXECUTOR + EXPLORER + SWITCHER ──────────
  'executor+explorer+switcher': {
    naming: '你像个<strong>主题的策展型试水者</strong>——一周一个领域，浅尝即试，不留尾巴。这是创业者/自由职业者的常态。',
    cost: '<strong>切换是有代价的</strong>——每次新方向都要重新建立基础认知。{{total}} 条收藏分散在你的实验里，没有一处特别深。',
    experiment: '<strong>试试这一周</strong>：选你最近最热的那个主题，<em>故意</em>多待 7 天，不切换。看看深一点是什么感觉。',
    reframe: '跳跃不是浅薄。<strong>是你在地形里扫描可能性。</strong>等找到对的位置，扎根会很快。',
  },

  // ─── 审美型杂食家 · CURATOR + EXPLORER + GENERALIST ───────
  'curator+explorer+generalist': {
    naming: '你的收藏夹像<strong>一个有品味的杂志栏</strong>——什么都看，但只留精品。这是双重门槛：好奇心 + 审美。',
    cost: '杂食的人偶尔会有<em>"我是不是没在精进什么"</em>的怀疑。{{total}} 条都是好东西，但加起来你想做的事是什么？',
    experiment: '<strong>试试这一周</strong>：在你最近收藏里找 3 条"如果只能留下"的——这个练习会让你看见自己的方向。',
    reframe: '杂食不是分散。<strong>是你在用品味画自己的地图。</strong>地图有了，方向自然就来了。',
  },

  // ─── 多线深挖型囤积家 · HOARDER + DEEPENER + GENERALIST ────
  'deepener+generalist+hoarder': {
    naming: '你<strong>同时在好几条路上往深里走</strong>——不开新方向，但每条都加重。这是种沉下来的好奇心，但保存的速度始终在快过处理速度。',
    cost: '<strong>{{total}} 条收藏分布在 {{clusterCount}} 个老主题上同时推进</strong>。每条路你都没真的走到头——加重的代价是没有一条特别深。',
    experiment: '<strong>试试这一周</strong>：挑你最看重的那一条线，<em>只在那一条线上保存和处理</em>——其他主题暂时不动。看看专注一周会有什么不同。',
    reframe: '多线深挖不是浅尝。<strong>是你在用宽度换深度的试错。</strong>等其中一条真长出来，你会知道下一步往哪走。',
  },

  // ─── 沉睡的囤积家 · HOARDER + DORMANT + GENERALIST ─────────
  // v3.1.22 · 之前没模板 → 走 primary:hoarder → UNIVERSAL_FALLBACK
  //   语义错位：fallback 是给"活跃囤积者"写的（"存东西的那一瞬..."）
  //   但 DORMANT 的人最近根本没在存，当下面对的是"以前的债"
  //   重写视角：从"该不该保存" → "以前的债该不该回去看"
  'dormant+generalist+hoarder': {
    naming: '你不是在拖延，<strong>你已经离开了</strong>——但还没回头看一眼。书房里那些没读完的东西，是另一个版本的你许下的诺。',
    cost: '过去 {{monthsSpan}} 个月你存了 <strong>{{total}} 条</strong>，最近这段时间几乎没新增。<em>{{pending}} 条还在等你回头——以前的你许的诺，今天的你已经不太记得了。</em>',
    experiment: '<strong>不必清完，回来一次</strong>：随手打开 5 条 3 个月以上的老收藏，只决定一件事——"这还是当下的我要的吗？"是就留，不是就放手。',
    // v3.1.23 · reframe 不再说"看见比读完重要"（跟 experiment 矛盾），改成支持"放手"行动 + 拆掉浪费框架
    reframe: '<strong>放手不是浪费</strong>——是你承认自己长成了别的样子。当年存它们的不是今天的你；放下那些不再相关的，比硬撑着读完更接近真实。',
  },

  // ─── v3.1.22 · "已停下"层兜底（mindset=dormant/settler 时优先用这里的模板）─────
  //   用户当下不在保存，引导视角从"该不该保存" → "以前的债该不该回头看"

  'stopped:hoarder': {
    naming: '你不是在拖延，<strong>你已经停下了</strong>——但还没回头看一眼。书房里那些没读完的东西，是另一个版本的你许下的诺。',
    cost: '过去 {{monthsSpan}} 个月你存了 <strong>{{total}} 条</strong>，这阵子几乎没新增。<em>{{pending}} 条还在等你回头——以前的你许的诺，今天的你已经不太记得了。</em>',
    experiment: '<strong>不必清完，回来一次</strong>：随手打开 5 条 3 个月以上的老收藏，只决定一件事——"这还是当下的我要的吗？"是就留，不是就放手。',
    // v3.1.23 · 旧 reframe "看见它们，比硬读完重要" 跟 experiment "是就留不是就放手"矛盾——
    //   等于鼓励用户继续囤着。CBT reframe 设计目的不是软化实验，是拆掉自责框架，让 experiment 的行动变轻松。
    // 新 reframe：明确支持 experiment 的"放手"行动 + 拆掉"放手 = 浪费"的内疚。
    reframe: '<strong>放手不是浪费</strong>——是你承认自己变了。当年存它们的那个你，跟今天的你不是同一个人；放下那些不再相关的，是给当下的你腾出地方。',
  },

  'stopped:executor': {
    naming: '你以前是"<strong>存即用</strong>"的人——这阵子停了下来，可能项目结束了，也可能在等下一个方向。',
    cost: '{{total}} 条收藏曾经都是为某个目的存的。<em>现在那些目的有的已经完成，有的悄悄过期了——但它们还在书房里占位置。</em>',
    experiment: '<strong>试试</strong>：挑 3 条 3 个月前存的，问自己"那个项目还活着吗？"——不活着的就放手，给当下的你腾位置。',
    reframe: '行动型停下来不是失败。<strong>是在等下一个值得动的方向</strong>。书房瘦下来，你也会更容易看见它来了。',
  },

  'stopped:curator': {
    naming: '你的门槛一直很高，<strong>这阵子干脆不挑了</strong>——可能不是没好东西，是你这段时间没有"接收的心情"。',
    cost: '{{total}} 条精品都还在。<em>但当你不再添新的，旧的那些会慢慢变成"以前我喜欢的"——审美也是会过期的。</em>',
    experiment: '<strong>试试</strong>：打开 5 条 6 个月以上的老收藏，看哪些当下还能让你停一下——能停的就留，停不下来的就放手。',
    // v3.1.23 · 旧 reframe "等它来时你会知道" 是 wait-and-see，跟 exp 的主动"打开 5 条"略反。
    //   新 reframe：把"眼光更新"接到 exp 的"回看老收藏"动作上——回看是重新认领的机会。
    reframe: '审美的停顿不是失去品味。<strong>是你的眼光在更新</strong>——回看老收藏，是给当下的你<em>重新认领什么</em>的机会。',
  },

  'stopped:thinker': {
    naming: '你保存内容是<strong>为了滋养想法</strong>——这阵子停了，可能不是不再思考，是思考转向内部了。',
    cost: '{{total}} 条思想原料在等你。<em>当外部输入停下来，内部消化才有空间——但消化完的，要承认它，不然就一直在书房里"假装在想"。</em>',
    experiment: '<strong>试试</strong>：挑 3 条 3 个月前让你心动的内容，问自己"那个想法后来变成什么了？"——有去处的留，没去处的也可以放手。',
    reframe: '思考的停顿不是浪费。<strong>是想法在你身上结晶</strong>。等它析出来，你会知道哪些原料已经用过，哪些可以放下。',
  },

  // ─── v3.1.24 · "returning" 层 · mindset=returner（最近翻老收藏做决定）时优先 ─────
  //   用户已经在做整理。引导词不该再叫他开始，而是支持当下这个动作 + 拆"为什么我现在才做"的自责
  //
  //   注：跟 'hoarder+returner+specialist'（怀旧型醒悟者）3 维精确 key 并行：
  //     - 3 维 key 命中 → 用 hand-written
  //     - 3 维 key 不命中 → 走这里的 returning:{consumption} 通用模板

  'returning:hoarder': {
    naming: '你<strong>正在跟过去的囤积谈判</strong>——意识到那些"以后会读"很多不会发生了。这是醒来的时刻，不是失败的时刻。',
    cost: '{{total}} 条堆了多年，<em>每条都见证了你以前在意的——但你已经不是那个人了。</em>',
    experiment: '<strong>继续这个节奏</strong>：每天放手 3 条 1 年前的，只放手不补新——书房瘦下来一点，今天的你就清晰一点。',
    reframe: '<strong>放手不是浪费</strong>——你以前没扔，是因为曾经真的在乎过。今天能放手，是因为今天的你已经不需要它来证明什么。',
  },

  'returning:thinker': {
    naming: '你<strong>正在翻老收藏，跟过去的自己对话</strong>——每打开一条都是问"3 个月前的我为什么留下它"。这是一种慢但深的整理。',
    cost: '{{pending}} 条还在等你回头。<em>翻每一条都要花心力——但不翻，它们会继续替过去的你占着今天的位置。</em>',
    experiment: '<strong>继续这个节奏</strong>：每天 1 条老收藏 + 写一行私注「这跟今天的我是什么关系」。决定本身就是动作。',
    reframe: '<strong>反思不是没在前进</strong>——是把过去当镜子在走。决定留下的，比当初存下的更属于你。',
  },

  'returning:executor': {
    naming: '你<strong>正在清理过去的项目库</strong>——以前为某个目的存的内容，现在回过头来盘。这是行动者的"自我审计"。',
    cost: '{{total}} 条曾经都是为某个目的存的。<em>有的目的已经完成，有的悄悄过期了——但它们还占着今天的注意力。</em>',
    experiment: '<strong>继续这个节奏</strong>：每天问 3 条"那个项目还活着吗"——不活着的就放手，给当下的你腾地方。',
    reframe: '<strong>放手不是浪费时间</strong>——是确认哪些事已经完成。完成要被承认，不然行动力会被旧任务的影子拖着。',
  },

  'returning:curator': {
    naming: '你<strong>正在重审你的精品库</strong>——这阵子打开老收藏，看哪些当下还能让你停一下。这是审美的自我更新。',
    cost: '{{total}} 条精挑细选的还在。<em>但当年觉得好的，跟今天的眼光未必是同一件事——审美也会过期。</em>',
    experiment: '<strong>继续这个节奏</strong>：每天 5 条 6 个月以上的老收藏，能让你停下的留，停不下来的放手——给精品库做一次断舍离。',
    reframe: '<strong>放手不是否认过去</strong>——是承认你的眼光在长。能放下从前的"好"，才有位置接今天的"更好"。',
  },

  // ─── 单维度兜底（按主身份 ID 查）─────────────────────────
  'primary:hoarder': UNIVERSAL_FALLBACK,
  'primary:curator': {
    naming: '你的收藏有<strong>明显的"门槛感"</strong>——不是什么都存。这是种克制的精致。',
    cost: '克制有代价：<em>偶尔会错过那些一开始不够格、但后来被你想起的内容</em>。{{processRate}}% 的处理率说明你存的都真的看过、用过——但你没看见的，也是真的没看见。',
    experiment: '<strong>试试这一周</strong>：当你犹豫"这条够不够格存"时——存下来。<em>一周后回头看，你以为不够格的，可能不是你以为的样子。</em>',
    // v3.1.23 · 旧 reframe "挑剔是知道什么值得" 跟 exp 的"降门槛存下来"直接矛盾。
    //   新 reframe：肯定挑剔是优点，但接住 exp 的"暂时降门槛" 不等于放弃挑剔——给它一周休息。
    reframe: '<strong>挑剔是优点——但偶尔让它休息一下</strong>。你已经知道什么值得自己时间；但有些好东西要先放进来，才有机会被你发现。',
  },
  'primary:executor': {
    naming: '你存东西的标准是<strong>"能用上"</strong>——这是工程师/产品经理的脑回路：信息为行动服务。',
    cost: '过于实用主义的代价是<em>错过那些"看似没用"的灵感</em>。最好的想法常常没目的——只是某天突然变得有用。',
    experiment: '<strong>试试这一周</strong>：看到一条「你被吸引但用不上」的内容——别跳过，存下来。<em>给意外的灵感一个落脚处。</em>',
    reframe: '行动力不是单纯——<strong>是你已经知道如何把想法变事实</strong>。但留点空间给"还没用"的想法，它们以后会变成行动的种子。',
  },
  'primary:thinker': {
    // v3.1.25 · 针对"多启发少行动"型 THINKER 改造（用户反馈 edge-05 这类场景）
    //   旧版 experiment "写出来给人看" 偏抽象；新版引导：启发→具体一步→落地后看见的收获
    naming: '你保存内容是<strong>为了滋养想法</strong>——但"启发"如果不落到一个具体的动作上，会一直停留在脑子里。',
    cost: '<em>启发是有保质期的。</em>当时让你心动的那些内容，回头看你可能记不起它具体让你想到了什么——想法只在被实践时才长得出来。',
    experiment: '<strong>试试这一周</strong>：挑 1 条最近让你心动的内容，问自己「<em>如果今天就开始做，第一步是什么？</em>」——把第一步写下来，<strong>真的去做这一步</strong>（哪怕只是发一条消息、写半页草稿）。一周后回来看：哪一步真的发生了？',
    reframe: '<strong>一个想法被实践 1 次，比被收藏 100 次更接近真实的你</strong>——启发只是种子，落到行动才能看见它在你身上长成什么。',
  },
  'primary:slow_reader': {
    naming: '你的速度跟<strong>"高效率"不在一个时区</strong>——这不是慢，是另一种节奏。',
    cost: '慢的代价是世界不会等你。但你也不需要赶上每个潮流。',
    experiment: '<strong>试试这一周</strong>：允许"读完这一条再说"是今天的胜利。',
    reframe: '慢不是缺点。<strong>慢是为了让东西真的进来。</strong>',
  },

  // v3.1.5 新增 · MINIMALIST + BALANCED + DORMANT 等
  'primary:minimalist': {
    naming: '你跟内容的关系是<strong>节制</strong>——存下的不多，每一条都像签了字。',
    cost: '{{total}} 条收藏。<em>你的代价不是焦虑——是有时怀疑自己是不是错过了什么。但你又知道，错过比塞满更轻盈。</em>',
    experiment: '<strong>试试</strong>：保存前问自己「我要它做什么」，能答上来就存。',
    reframe: '你不是不爱学。<strong>你只是不愿意囤。</strong>',
  },

  'primary:balanced': {
    naming: '你跟内容的关系是<strong>稳态</strong>——不挣扎也不强求，这其实少见。',
    cost: '{{total}} 条收藏静静地在那。<em>你不焦虑，也不需要它们证明什么——但偶尔会想"我是不是缺了点什么"。这是噪音，不是真相。</em>',
    experiment: '<strong>试试这一周</strong>：偶尔保存一条「跟自己当下兴趣无关」的内容——给好奇心松一点。',
    // v3.1.23 · 旧 reframe "已经知道距离感" 强化距离，跟 exp 的"偶尔越界" 弱反。
    //   新 reframe：肯定距离感同时给越界合法化——稳态足够稳，偶尔松一下不会失衡。
    reframe: '稳态不是封闭。<strong>是你已经知道跟世界要保持的距离感</strong>——所以偶尔松一下、跑远一点，你也不会失衡。',
  },

  'primary:dormant': {
    naming: '你不是抛弃它——<strong>你是被生活带走了</strong>。',
    cost: '{{longWaitCount}} 条收藏在等你回来。<em>每条都是一次小小的「以前的你说要看」。</em>',
    experiment: '<strong>回来一次</strong>，不必清完——选 1 条看是否还想要。',
    reframe: '回来不需要补 30 天的进度。<strong>只需要回来。</strong>',
  },
}

// ─── 工具函数 ───────────────────────────────────────────

/** 把 cards 排序后用 id 拼成 key（如 "explorer+generalist+hoarder"）*/
function makeComboKey(cards: IdentityCard[]): string {
  return [...cards.map((c) => c.id)].sort().join('+')
}

/** 组合命名（按 3 维度查表）—— 跟 Profile.tsx 的 deriveComboName 重复，保留一份在这里方便独立调用 */
function deriveComboName(cards: IdentityCard[]): string {
  if (cards.length === 0) return ''
  const ids = makeComboKey(cards)
  const table: Record<string, string> = {
    'explorer+generalist+hoarder': '信息焦虑囤积家',
    'deepener+generalist+hoarder': '多线深挖型囤积家',
    'curator+settler+specialist': '深耕策展人',
    'executor+seeker+specialist': '目标驱动型专家',
    'generalist+returner+thinker': '反思型杂食回归者',
    'settler+slow_reader+specialist': '慢品大师',
    'hoarder+returner+specialist': '怀旧型醒悟者',
    'executor+explorer+switcher': '短时实验家',
    'curator+explorer+generalist': '审美型杂食家',
  }
  return table[ids] ?? cards.map((c) => c.name).join(' · ')
}

/** 把 {{key}} 替换为 data 里的对应值 */
function fillTemplate(text: string, data: DataPoints): string {
  const annual = Math.round(data.pending * 26)  // 365/14 ≈ 26 次/年
  const replacements: Record<string, string | number> = {
    total: data.total,
    processed: data.processed,
    pending: data.pending,
    released: data.released,
    processRate: Math.round(data.processRate * 100),
    oldestMonthsAgo: data.oldestMonthsAgo,
    monthsSpan: data.monthsSpan,
    annualReminders: annual,
    clusterCount: data.clusterCount,
    topClusterName: data.topClusterName ?? '',
    topClusterCount: data.topClusterCount ?? 0,
    topClusterRate: data.topClusterRate ? Math.round(data.topClusterRate * 100) : 0,
  }
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = replacements[key]
    return v !== undefined ? String(v) : `{{${key}}}`
  })
}
