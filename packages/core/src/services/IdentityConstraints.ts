/**
 * IdentityConstraints —— §1 身份的**唯一约束源**
 *
 * 设计目的（v3.1.25 根因 2）：
 *   之前每段（§2/§3/§4/§5/§6）都自己维护跟 §1 的一致性约束（banList/skip/hint），导致：
 *   - 新加身份要在 N 个地方加约束，容易漏
 *   - 同个身份在不同段约束不一致（§5 banList vs §6 banList 各写各的）
 *   - 跨段不一致 audit 没有统一字典可用
 *
 * 现在：每个身份的"画像核心 + 允许角度 + 禁止角度 + 推荐 experiment 方向"都集中在这里。
 *   所有下游段从这里读，不再各自维护。
 *
 * 用法：
 *   - §2/§3/§4/§5/§6 的 banList 注入：调 `constraintPromptFragment(id)`
 *   - 跨段 audit 工具：调 `findViolations(text, id)` 扫描身份矛盾词
 *   - 算法 skip 逻辑：检查 IDENTITY_CONSTRAINTS[id].bannedAngles 包含某关键词
 */

export interface IdentityConstraint {
  id: string
  /** 跟 IdentityService 里 makeCard 的 claim 参数一致——身份的核心叙述 */
  coreClaim: string
  /** 一句话画像总结（用作 audit / AI prompt 的概括） */
  oneLiner: string
  /** 允许的描述角度（关键词数组）——下游文案可以用这些词 */
  allowedAngles: string[]
  /**
   * 绝对禁止的描述角度（关键词数组）——下游任何段都不能出现这些词
   * 用作：
   *   - AI prompt 的 banList
   *   - cross-section audit 的关键词扫描器
   *   - 算法 skip 条件判定
   */
  bannedAngles: string[]
  /** 推荐的 experiment 方向（用于 §5 心理引导生成） */
  preferredExperiments: string[]
  /** behaviorState：标记是"活跃 / 已停下 / 整理中"，影响 §5 引导词调性 */
  behaviorState?: 'active' | 'stopped' | 'returning' | 'changing'
}

// ─── Consumption 身份（7）─────────────────────────────────────

export const IDENTITY_CONSTRAINTS: Record<string, IdentityConstraint> = {
  hoarder: {
    id: 'hoarder',
    coreClaim: '你像个不会过期的图书馆——总有新书进来，但很少打开。',
    oneLiner: '保存比处理快、信息囤积型',
    allowedAngles: ['信息囤积', '积累焦虑', '安抚机制', '"以后再说"', '不会过期的图书馆'],
    bannedAngles: ['你懒', '没纪律', '失败者', '应该全部读完', '挑剔', '精挑'],
    preferredExperiments: ['存前问 5 分钟', '每天放手 3 条老收藏', '回看老书房做决定'],
    behaviorState: 'active',
  },

  curator: {
    id: 'curator',
    coreClaim: '你的收藏有明显的"门槛感"——不是什么都存。',
    oneLiner: '精挑细选、克制的精致',
    allowedAngles: ['门槛感', '精挑', '克制', '审美', '过滤'],
    bannedAngles: ['囤积', '积累焦虑', '焦虑保存', '没标准', '什么都存', '信息焦虑'],
    preferredExperiments: ['偶尔降门槛存一条', '检验现在还是不是当年的好'],
    behaviorState: 'active',
  },

  executor: {
    id: 'executor',
    coreClaim: '你保存即用、用即清——保存的不是内容，是把工具放在手边。',
    oneLiner: '行动型、信息为行动服务',
    allowedAngles: ['行动', '存即用', '工具', '把工具放在手边', '实用'],
    bannedAngles: [
      '焦虑保存', '囤积', '幻觉热情', '收藏如山', '保存如山却未触及',
      '没真的看', '基本没看过', '焦虑积累',
    ],
    preferredExperiments: ['保存暂时用不上但有趣的', '给意外灵感留位置'],
    behaviorState: 'active',
  },

  thinker: {
    id: 'thinker',
    coreClaim: '你保存内容是为了滋养想法——不是为了用，是为了让脑子有材料。',
    oneLiner: '思考型、用内容滋养想法',
    allowedAngles: ['启发', '思考原料', '想法滋养', '材料', '翻译成自己的语言'],
    bannedAngles: [
      '完全没读', '知识焦虑', '没真的看', '基本没看过',
      '囤积', '焦虑保存', '收藏如山却未触及',
    ],
    preferredExperiments: ['挑 1 条心动内容写第一步行动', '1 周后回看哪一步真的发生了'],
    behaviorState: 'active',
  },

  slow_reader: {
    id: 'slow_reader',
    coreClaim: '你跟内容是慢慢品——这不是慢半拍，是选择了不一样的速度。',
    oneLiner: '慢节奏、等准备好再消化',
    allowedAngles: ['慢节奏', '等准备好', '慢慢品', '让东西真的进来', '不在一个时区'],
    bannedAngles: [
      '焦虑积累', '没看过', '没读', '太慢了', '应该更快',
      '囤积', '收藏如山却未触及',
    ],
    preferredExperiments: ['允许慢一拍是胜利', '读完这一条再说'],
    behaviorState: 'active',
  },

  minimalist: {
    id: 'minimalist',
    coreClaim: '你不常保存——这是你跟世界相处的节奏。',
    oneLiner: '节制、跟内容关系不喧哗、少而精',
    allowedAngles: ['节制', '少而精', '保存的节奏', '不囤', '少即是多', '签了字'],
    bannedAngles: [
      // v3.1.25 · MINIMALIST 跟"囤积"定义性矛盾——用更精确的词避免误判 MINIMALIST 自己的 "不囤" / "不囤积"
      '在囤积', '陷入囤积', '是囤积者', '信息囤积', '积累焦虑', '信息焦虑回避', '陷入积累', '陷入了信息积累',
      // MINIMALIST ≠ SLOW_READER（不是慢，是少）
      '慢工细活', '深度精读', '注重深度而非广度',
      // 把"未处理"当焦虑——MINIMALIST 用户保存量小，pending 不是堆积
      '基本没看', '没真的看', '收藏如山',
    ],
    preferredExperiments: [
      '观察自己保存的节奏',
      '等书房自然长出几条收藏后再回来看',
      '保存前问"我要它做什么"',
    ],
    behaviorState: 'active',
  },

  balanced: {
    id: 'balanced',
    coreClaim: '你跟内容相处得很均衡——不挣扎也不强求，这其实少见。',
    oneLiner: '稳态、不极端囤也不极端挑',
    allowedAngles: ['稳态', '不挣扎不强求', '距离感', '少见的均衡', '存得稳'],
    bannedAngles: [
      // v3.1.25 用户反馈：AI 不能给 BALANCED 写"看似 X 实则 Y"悖论
      '太佛系', '没特点', '看似均衡实则',
      // BALANCED 不是焦虑画像——用更精确的词避免误判（"不囤积" 含 "囤积" 但是正向的）
      '在囤积', '陷入囤积', '是囤积者', '积累焦虑', '信息焦虑',
    ],
    preferredExperiments: ['偶尔保存跟当下兴趣无关的', '给好奇心松一下'],
    behaviorState: 'active',
  },
}

// ─── Mindset 身份（6）─────────────────────────────────────────

export const MINDSET_CONSTRAINTS: Record<string, IdentityConstraint> = {
  explorer: {
    id: 'explorer',
    coreClaim: '你最近又敢飞了，四处试。',
    oneLiner: '开新方向、多领域涌现',
    allowedAngles: ['敢飞', '四处试', '新方向', '涌现'],
    bannedAngles: ['停下了', '没在变', '深耕在一处'],
    preferredExperiments: ['在最热那个方向多待一周看看'],
    behaviorState: 'active',
  },

  deepener: {
    id: 'deepener',
    coreClaim: '你最近不开新地，在已有的几条路上加深。',
    oneLiner: '不开新方向、在已有路径加深',
    allowedAngles: ['加深', '深挖', '加重', '宽度换深度'],
    bannedAngles: ['到处试', '又开了新方向', '浅尝即试'],
    preferredExperiments: ['挑最看重的那条线只在那条线上保存和处理'],
    behaviorState: 'active',
  },

  seeker: {
    id: 'seeker',
    coreClaim: '你最近被一个方向紧紧抓住。',
    oneLiner: '集中在 top cluster、一个方向深挖',
    allowedAngles: ['紧紧抓住', '一个方向', '聚焦'],
    bannedAngles: ['到处试', '广泛尝试'],
    preferredExperiments: [],
    behaviorState: 'active',
  },

  returner: {
    id: 'returner',
    coreClaim: '你正在翻老收藏，做决定。',
    oneLiner: '正在整理过去的债',
    allowedAngles: ['翻老收藏', '做决定', '跟过去的自己对话', '回看', '整理'],
    bannedAngles: [
      // 用户已经在做整理，不该叫他"开始"
      '开始整理', '开始翻看', '该回头看一眼', '回来一次',
    ],
    preferredExperiments: ['继续这个节奏', '每天 1 条老收藏 + 决定留/放'],
    behaviorState: 'returning',
  },

  settler: {
    id: 'settler',
    coreClaim: '你这一阵新的没存，旧的也没翻。',
    oneLiner: '已经停下了、新的不存旧的不翻',
    allowedAngles: ['停下了', '没新增', '安静', '已经离开', '没在追新'],
    bannedAngles: [
      // 用户已经停了，"存东西的瞬间"语义错位
      // v3.1.25 修：移除 "在追新"——SETTLER 自己 claim 含 "没在追新东西"，会自伤
      '存东西的瞬间', '存东西的那一瞬', '又敢飞了',
    ],
    preferredExperiments: ['不必清完，回来一次决定 5 条留/放'],
    behaviorState: 'stopped',
  },

  dormant: {
    id: 'dormant',
    coreClaim: '你这阵子在沉睡——不是抛弃它，是被生活带走了。',
    oneLiner: '沉睡中、最近 N 天几乎不保存',
    allowedAngles: ['沉睡', '被生活带走', '离开了', '以前的债'],
    bannedAngles: [
      '存东西的瞬间', '存东西的那一瞬', '又敢飞了', '最近又开',
    ],
    preferredExperiments: ['回来一次，挑 5 条决定是否还是当下的你要的'],
    behaviorState: 'stopped',
  },
}

// ─── Radius 身份（3）─────────────────────────────────────────

export const RADIUS_CONSTRAINTS: Record<string, IdentityConstraint> = {
  specialist: {
    id: 'specialist',
    coreClaim: '你的注意力深耕在少数几个领域。',
    oneLiner: '专精、深耕在少数主题',
    allowedAngles: ['深耕', '专精', '聚焦', '一束聚焦的光'],
    bannedAngles: ['广博', '什么都看', '兴趣广泛'],
    preferredExperiments: [],
  },

  generalist: {
    id: 'generalist',
    coreClaim: '你的注意力像一张网撒得很开——兴趣很广泛。',
    oneLiner: '广博、兴趣很广泛',
    allowedAngles: ['广博', '兴趣广泛', '什么都看', '一张网'],
    bannedAngles: ['深耕在一处', '只关心一个领域'],
    preferredExperiments: [],
  },

  switcher: {
    id: 'switcher',
    coreClaim: '你的注意力像潮汐——这阵一群主题，下阵换一群。',
    oneLiner: '跳跃、口味多变',
    allowedAngles: ['潮汐', '切换', '多变', '一阵一群'],
    bannedAngles: ['一直深耕', '从不变'],
    preferredExperiments: [],
  },
}

// ─── 工具函数 ─────────────────────────────────────────────────

/**
 * 获取某个 consumption 身份的约束。找不到返回 null。
 */
export function getConsumptionConstraint(id: string | undefined): IdentityConstraint | null {
  if (!id) return null
  return IDENTITY_CONSTRAINTS[id] ?? null
}

/**
 * 给 AI prompt 注入身份硬约束片段（§5/§6 共用）
 *
 * 用法：
 *   const ban = constraintPromptFragment('minimalist')
 *   prompt += `\n## ⚠️ 身份硬约束\n${ban}\n`
 */
export function constraintPromptFragment(consumptionId: string | undefined): string {
  const c = getConsumptionConstraint(consumptionId)
  if (!c) return ''
  return `
## ⚠️ ${c.id.toUpperCase()} 身份硬约束（生成时必须遵守，优先级高于"个性化"）

身份核心: ${c.coreClaim}（${c.oneLiner}）

✗ **绝对不能说**（这些词跟身份定义矛盾）:
${c.bannedAngles.map((a) => `   - "${a}"`).join('\n')}

✓ **可以说的角度**:
${c.allowedAngles.map((a) => `   - "${a}"`).join('\n')}

✓ **推荐的 experiment 方向**:
${c.preferredExperiments.map((a) => `   - ${a}`).join('\n')}

宁可生成的内容稍微平淡，也不能跟身份画像矛盾。`
}

export interface Violation {
  /** 哪个段触发（如 §5 / §6） */
  section: string
  /** 命中的禁止词 */
  bannedWord: string
  /** 上下文片段（命中词前后各 15 字） */
  context: string
}

/**
 * 扫描一段文本是否违反某身份的 bannedAngles
 *
 * 用于：
 *   - 跨段 audit 工具检测身份矛盾
 *   - unit test 回归校验
 *
 * @param text  要扫描的文本（可含 HTML 标签）
 * @param consumptionId  consumption 身份 id（如 'minimalist'）
 * @param section  来源段标识（用于报告，如 '§5' / '§6'）
 */
export function findViolations(
  text: string,
  consumptionId: string | undefined,
  section = '',
): Violation[] {
  const c = getConsumptionConstraint(consumptionId)
  if (!c) return []
  // 去 HTML 标签便于扫描
  const plain = text.replace(/<[^>]+>/g, '')
  const violations: Violation[] = []
  for (const banned of c.bannedAngles) {
    let idx = 0
    while ((idx = plain.indexOf(banned, idx)) >= 0) {
      const start = Math.max(0, idx - 15)
      const end = Math.min(plain.length, idx + banned.length + 15)
      violations.push({
        section,
        bannedWord: banned,
        context: '…' + plain.slice(start, end) + '…',
      })
      idx += banned.length
    }
  }
  return violations
}

/**
 * 同时扫描 mindset bannedAngles
 *   eg. RETURNER mindset 不该叫用户"开始整理"
 */
export function findMindsetViolations(
  text: string,
  mindsetId: string | undefined,
  section = '',
): Violation[] {
  if (!mindsetId) return []
  const c = MINDSET_CONSTRAINTS[mindsetId]
  if (!c) return []
  const plain = text.replace(/<[^>]+>/g, '')
  const violations: Violation[] = []
  for (const banned of c.bannedAngles) {
    let idx = 0
    while ((idx = plain.indexOf(banned, idx)) >= 0) {
      const start = Math.max(0, idx - 15)
      const end = Math.min(plain.length, idx + banned.length + 15)
      violations.push({
        section,
        bannedWord: banned,
        context: '…' + plain.slice(start, end) + '…',
      })
      idx += banned.length
    }
  }
  return violations
}
