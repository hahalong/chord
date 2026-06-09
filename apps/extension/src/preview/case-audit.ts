/**
 * Case Audit · 跨段一致性自动检查
 *
 * 设计目的（v3.1.25 根因 2 + 3）：
 *   - 跨段不一致以前要靠用户截图反馈才发现。现在每个 case 启动时自动跑全段，
 *     用 IdentityConstraints.bannedAngles 扫描身份矛盾词，标红问题 case
 *   - 同时校验 case 数据 expected vs 实际触发——case 漂移当即可见
 *
 * 运行模式：
 *   - preview 启动时一次性跑全部 case，结果缓存在 signal
 *   - case 列表项渲染时根据 audit 结果显示 ✅ / ⚠️N
 *   - 点击 case 进入详情时，audit 详情显示在顶部
 */

import {
  IdentityService,
  AnalyticsService,
  DramaticInsightService,
  BehavioralChangeService,
  PsychGuidanceService,
  IdentityConstraints,
  type Violation,
} from '@chord/core'
import type { CaseDef } from './cases.js'
import { generateMockData } from './factory.js'

export interface CaseAuditReport {
  caseId: string

  // ─── 校验：身份是否如 expected 触发 ───
  /** expected.consumption === 实际算出 consumption.id */
  consumptionMatch: 'match' | 'expected_missing' | 'actual_missing' | 'mismatch'
  expectedConsumption: string | null
  actualConsumption: string | null

  mindsetMatch: 'match' | 'expected_missing' | 'actual_missing' | 'mismatch'
  expectedMindset: string | null
  actualMindset: string | null

  radiusMatch: 'match' | 'expected_missing' | 'actual_missing' | 'mismatch'
  expectedRadius: string | null
  actualRadius: string | null

  // ─── 检查：跨段身份矛盾词 ───
  /** 所有段的 banned-words 命中（按段分组） */
  violations: Violation[]

  // ─── v3.1.25 · 6 段调性检查 ───
  /**
   * §5 实际命中的模板 key（如 'explorer+generalist+hoarder' / 'stopped:hoarder' / 'primary:hoarder' / 'UNIVERSAL_FALLBACK'）
   * 用来回归校验：是否走到了该身份对应的专属模板
   */
  guidanceTemplateKey: string
  /** §5 模板是否是 UNIVERSAL_FALLBACK（说明该身份没有专属模板，可能需要补） */
  guidanceFellThrough: boolean

  /** §2 触发的 insight templates */
  insightTemplates: string[]
  /** §3 触发的 finding types */
  findingTypes: string[]
  /** §4 触发的 change kinds */
  changeKinds: string[]

  // ─── 总评 ───
  /** 总 warning 数 = identity mismatch + violations + guidance fell through */
  totalWarnings: number
  /** OK = 0 warnings */
  ok: boolean
}

/**
 * 跑一个 case 的完整 audit
 *
 * 注意：只跑模板路径（不调 AI），AI 路径在 runtime 才有
 *   §5 AI 增强是另一层；模板 fallback 是这层
 */
export async function auditCase(caseDef: CaseDef): Promise<CaseAuditReport> {
  // 1. 生成 mock 数据
  const data = generateMockData(caseDef.spec)
  const items = data.chord_items
  const visitCounts = new Map(Object.entries(data.chord_history).map(([k, v]) => [k, v as number]))

  // 2. 跑 IdentityService 算实际身份
  const cards = IdentityService.computeAllIdentities(items, visitCounts)
  const consumption = cards.find((c) => c.dimension === 'consumption')
  const mindset = cards.find((c) => c.dimension === 'mindset')
  const radius = cards.find((c) => c.dimension === 'radius')

  // 3. expected vs actual 校验
  const expected = caseDef.expected
  const consumptionMatch = compareIdentity(expected.consumption, consumption?.id)
  const mindsetMatch = compareIdentity(expected.mindset, mindset?.id)
  const radiusMatch = compareIdentity(expected.radius, radius?.id)

  // 4. 跑各段算法收集所有 user-visible 文本
  const sectionTexts: { section: string; text: string }[] = []

  // §1 身份 claim
  for (const card of cards) {
    sectionTexts.push({ section: `§1 ${card.dimension}`, text: card.claim })
  }

  // §2 数字反差
  const insights = DramaticInsightService.generateDramaticInsights({
    items,
    visitCounts,
    consumptionId: consumption?.id,
  })
  for (const insight of insights.slice(0, 2)) {
    sectionTexts.push({ section: '§2 insight.text', text: insight.text })
    if (insight.quiet) sectionTexts.push({ section: '§2 insight.quiet', text: insight.quiet })
    if (insight.identityHook) sectionTexts.push({ section: '§2 identityHook', text: insight.identityHook })
  }

  // §3 findings（通过 mock adapter 跑——这里直接用 items 跑简化版）
  // §3 的关键检查：MINIMALIST 用户不该触发 illusion_anxiety
  // 这部分需要 adapter，先 skip——audit 会在用户进入 case 详情时跑
  // 简化版：直接调一个内部 helper

  // §4 行为变化
  const changes = BehavioralChangeService.detectAllChanges(items)
  for (const change of changes) {
    sectionTexts.push({ section: '§4 change.narrative', text: change.narrative })
    if (change.title) sectionTexts.push({ section: '§4 change.title', text: change.title })
  }
  const changeKinds = changes.map((c) => c.kind)

  // §5 心理引导（模板路径，AI 路径需要 engine 跑不了）
  const guidance = PsychGuidanceService.generateGuidance({ cards, items, visitCounts })
  if (guidance) {
    sectionTexts.push({ section: '§5 naming', text: guidance.slots.naming })
    sectionTexts.push({ section: '§5 cost', text: guidance.slots.cost })
    sectionTexts.push({ section: '§5 experiment', text: guidance.slots.experiment })
    sectionTexts.push({ section: '§5 reframe', text: guidance.slots.reframe })
  }
  // v3.1.25 · 推测 §5 实际走到的模板 key
  const guidanceTemplateKey = inferGuidanceTemplateKey(cards)
  const guidanceFellThrough = guidanceTemplateKey === 'UNIVERSAL_FALLBACK'

  const insightTemplates = insights.slice(0, 2).map((i) => i.template)
  // §3 findings 类型——这里用 cluster-based 启发，没跑 AnalyticsService 是因为它需要 adapter
  // 简化：根据 cards 推测应该触发的 finding types
  const findingTypes: string[] = []  // TODO: 接入 AnalyticsService 后填

  // §6 AI Headline 是 runtime AI 生成，audit 跑不了——skip

  // 5. 跨段扫描 bannedAngles 关键词
  const violations: Violation[] = []
  for (const { section, text } of sectionTexts) {
    if (consumption?.id) {
      violations.push(...IdentityConstraints.findViolations(text, consumption.id, section))
    }
    if (mindset?.id) {
      violations.push(...IdentityConstraints.findMindsetViolations(text, mindset.id, section))
    }
  }

  // 6. 总评
  const identityMismatches = [consumptionMatch, mindsetMatch, radiusMatch]
    .filter((m) => m === 'mismatch' || m === 'actual_missing' || m === 'expected_missing').length
  // v3.1.25 · §5 fell through 计入 warning（说明该身份没有专属模板，UX 体验同质化）
  const fellThroughWarning = guidanceFellThrough ? 1 : 0
  const totalWarnings = identityMismatches + violations.length + fellThroughWarning
  const ok = totalWarnings === 0

  return {
    caseId: caseDef.id,
    consumptionMatch,
    expectedConsumption: expected.consumption ?? null,
    actualConsumption: consumption?.id ?? null,
    mindsetMatch,
    expectedMindset: expected.mindset ?? null,
    actualMindset: mindset?.id ?? null,
    radiusMatch,
    expectedRadius: expected.radius ?? null,
    actualRadius: radius?.id ?? null,
    violations,
    guidanceTemplateKey,
    guidanceFellThrough,
    insightTemplates,
    findingTypes,
    changeKinds,
    totalWarnings,
    ok,
  }
}

/**
 * v3.1.25 · 推测 §5 PsychGuidance 实际命中的模板 key
 * 跟 PsychGuidanceService.generateGuidance 的 lookup 顺序一致
 */
function inferGuidanceTemplateKey(cards: ReturnType<typeof IdentityService.computeAllIdentities>): string {
  if (cards.length === 0) return 'UNIVERSAL_FALLBACK'
  const mindset = cards.find((c) => c.dimension === 'mindset')
  const consumption = cards.find((c) => c.dimension === 'consumption')

  // 3D key（按 makeComboKey 规则）
  if (cards.length >= 3) {
    const ids = cards.map((c) => c.id).sort().join('+')
    // PsychGuidanceService 里 hand-written 的 12 个 named combos
    const NAMED_3D_KEYS = new Set([
      'explorer+generalist+hoarder',
      'curator+settler+specialist',
      'executor+seeker+specialist',
      'generalist+returner+thinker',
      'settler+slow_reader+specialist',
      'hoarder+returner+specialist',
      'executor+explorer+switcher',
      'curator+explorer+generalist',
      'deepener+generalist+hoarder',
      'dormant+generalist+hoarder',
      // 'explorer+generalist+minimalist',  // MXG 还没 hand-written 模板（仅命名）
      'minimalist+settler+specialist',
    ])
    if (NAMED_3D_KEYS.has(ids)) return ids
  }

  // stopped / returning 层
  const isStopped = mindset && (mindset.id === 'dormant' || mindset.id === 'settler')
  const isReturning = mindset && mindset.id === 'returner'
  const KNOWN_STOPPED = new Set(['hoarder', 'executor', 'curator', 'thinker'])
  const KNOWN_RETURNING = new Set(['hoarder', 'executor', 'curator', 'thinker'])
  if (isStopped && consumption && KNOWN_STOPPED.has(consumption.id)) {
    return `stopped:${consumption.id}`
  }
  if (isReturning && consumption && KNOWN_RETURNING.has(consumption.id)) {
    return `returning:${consumption.id}`
  }

  // primary:{first card's id}
  const KNOWN_PRIMARY = new Set(['hoarder', 'curator', 'executor', 'thinker', 'slow_reader', 'minimalist', 'balanced', 'dormant'])
  if (cards[0] && KNOWN_PRIMARY.has(cards[0].id)) {
    return `primary:${cards[0].id}`
  }

  return 'UNIVERSAL_FALLBACK'
}

function compareIdentity(
  expected: string | null | undefined,
  actual: string | undefined,
): 'match' | 'expected_missing' | 'actual_missing' | 'mismatch' {
  // expected null = 不预期触发；actual 应该是 undefined
  if (expected === null || expected === undefined) {
    if (actual === undefined) return 'match'
    return 'actual_missing'  // 实际触发了但预期不触发——"actual extra"
  }
  // expected 有值：actual 必须匹配
  if (actual === undefined) return 'expected_missing'  // 预期触发但实际没触发
  if (expected !== actual) return 'mismatch'  // 触发了不同身份
  return 'match'
}

/**
 * 跑全部 case
 */
export async function auditAllCases(cases: CaseDef[]): Promise<Map<string, CaseAuditReport>> {
  const reports = new Map<string, CaseAuditReport>()
  for (const c of cases) {
    try {
      const report = await auditCase(c)
      reports.set(c.id, report)
    } catch (e) {
      console.error(`[Audit] Case ${c.id} failed:`, e)
    }
  }
  return reports
}
