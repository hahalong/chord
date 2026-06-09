/**
 * Mock case 定义 —— preview 工具读这里生成用例
 *
 * v3.1 设计原则：**一组数据对应一个三维组合身份**
 *   - 主画像 = (consumption + mindset + radius) 组合（如「信息焦虑囤积家」）
 *   - 每个 case 都要同时触发 3 个维度（除 NEWCOMER 与边缘组）
 *   - case 数量按"已命名的组合身份 + 边缘情况"组织，不是按单维度排列
 *
 * 组织结构：
 *   - 主组：12 个已命名的三维组合（v3.0 9 个 + v3.1 新增 MINIMALIST/DORMANT 相关 3 个）
 *   - 边缘组：3 个单维度 / 双维度触发场景（验证缺数据态）
 *   - 异常组：3 个 NEWCOMER / 三维平衡 / 脏数据
 */

import type { MockUserSpec } from './factory.js'

export interface CaseDef {
  id: string
  name: string
  comboName?: string  // 三维组合的命名身份（如「信息焦虑囤积家」）
  category: '已命名组合' | 'v3.1 新增组合' | '边缘场景' | '异常'
  spec: MockUserSpec
  expected: {
    consumption?: string | null
    mindset?: string | null
    radius?: string | null
    /** @deprecated v3.1.5 起 MINIMALIST 兜底 → NEWCOMER 不再触发；字段保留兼容老 case */
    newcomer?: boolean
    mainDimension?: 'consumption' | 'mindset' | 'radius'
    balanced?: 'deep' | 'vivid' | 'subtle' | null
  }
}

// ─── 主组：已命名的三维组合 ─────────────────────────────────

export const CASES: CaseDef[] = [
  // 1️⃣ 信息焦虑囤积家 = HOARDER + EXPLORER + GENERALIST
  {
    id: 'combo-01-anxiety-hoarder',
    name: '信息焦虑囤积家',
    comboName: 'HOARDER + EXPLORER + GENERALIST',
    category: '已命名组合',
    spec: {
      caseId: 'cb01',
      name: '信息焦虑囤积家',
      // 历史 80 条分布在 11 个主题（GENERALIST: clusterCount > 10, top1Share < 25%）
      clusterDistribution: [
        { name: 'AI 应用与工具', count: 8 },
        { name: '健身与训练', count: 8 },
        { name: '投资与金融市场', count: 8 },
        { name: '心理与自我管理', count: 7 },
        { name: '设计与美学', count: 7 },
        { name: '编程与软件开发', count: 7 },
        { name: '历史与人文', count: 6 },
        { name: '商业与创业', count: 6 },
        { name: '科普与科学', count: 6 },
        { name: '生活方式', count: 6 },
        { name: '写作与表达', count: 5 },
      ],
      processRate: 0.10,  // HOARDER: < 20%
      ageRange: { oldestDaysAgo: 220, newestDaysAgo: 40 },
      recentBurst: {
        recentCount: 18,  // recent 30 天保存量爆发
        brandNewClusters: 3,  // EXPLORER: brandNew >= 2
        brandNewPrefix: '新方向',
      },
    },
    expected: { consumption: 'hoarder', mindset: 'explorer', radius: 'generalist' },
  },

  // 2️⃣ 深耕策展人 = CURATOR + SETTLER + SPECIALIST
  {
    id: 'combo-02-curator-deep',
    name: '深耕策展人',
    comboName: 'CURATOR + SETTLER + SPECIALIST',
    category: '已命名组合',
    spec: {
      caseId: 'cb02',
      name: '深耕策展人',
      // SPECIALIST: top1 > 40%, top3 > 70%, clusters < 8
      clusterDistribution: [
        { name: '建筑与设计', count: 50 },  // top1 = 50/100 = 50%
        { name: '艺术史', count: 25 },
        { name: '城市规划', count: 15 },
        { name: '摄影', count: 10 },
      ],
      processRate: 0.65,  // CURATOR: > 50%
      releaseShare: 0.05,  // v3.1.27: 少 release 避免 RETURNER 抢
      // v3.1.27: ageRange 400→200 让 prev60 涨到 30 条覆盖所有 4 个 cluster → brandNew=0
      //          推 SETTLER 触发（之前 400-5 + decline 让 recent30 才 3 条，某 cluster 落到只在 recent30
      //          却没在 prev60 出现 → brandNew=1 阻断 SETTLER）
      ageRange: { oldestDaysAgo: 200, newestDaysAgo: 5 },
      chipDistribution: { oneRead: 0.50 },
      declineFactor: 0.4,
    },
    expected: { consumption: 'curator', mindset: 'settler', radius: 'specialist' },
  },

  // 3️⃣ 目标驱动型专家 = EXECUTOR + SEEKER + SPECIALIST
  {
    id: 'combo-03-executor-focused',
    name: '目标驱动型专家',
    comboName: 'EXECUTOR + SEEKER + SPECIALIST',
    category: '已命名组合',
    spec: {
      caseId: 'cb03',
      name: '目标驱动型专家',
      clusterDistribution: [
        { name: '产品管理', count: 50 },  // top1 主题
        { name: '团队管理', count: 18 },
        { name: '商业策略', count: 12 },
        { name: '增长方法', count: 10 },
      ],
      processRate: 0.78,
      releaseShare: 0.05,  // v3.1.27: 减少 release 避免 RETURNER 抢 SEEKER
      ageRange: { oldestDaysAgo: 200, newestDaysAgo: 5 },
      chipDistribution: { used: 0.55 },  // EXECUTOR
      // SEEKER: recent 30 自然集中在 top cluster（产品 50% 占比）
      // v3.1.27 removed recentBurst：factory 改后 brandNew=0 会注入 top3 触发 DEEPENER 抢 SEEKER
    },
    expected: { consumption: 'executor', mindset: 'seeker', radius: 'specialist' },
  },

  // 4️⃣ 反思型杂食回归者 = THINKER + RETURNER + GENERALIST
  {
    id: 'combo-04-thinker-returner',
    name: '反思型杂食回归者',
    comboName: 'THINKER + RETURNER + GENERALIST',
    category: '已命名组合',
    spec: {
      caseId: 'cb04',
      name: '反思型杂食回归者',
      clusterDistribution: [
        { name: '心理学', count: 15 },
        { name: '哲学', count: 14 },
        { name: '文学', count: 13 },
        { name: '社会学', count: 12 },
        { name: '历史', count: 11 },
        { name: '艺术评论', count: 10 },
        { name: '人物访谈', count: 9 },
        { name: '日记与札记', count: 9 },
        { name: '诗歌', count: 8 },
        { name: '随笔', count: 8 },
        { name: '思想史', count: 7 },
        { name: '宗教与精神', count: 6 },
      ],
      processRate: 0.65,
      // v3.1.27: 150-3 让 RETURNER 有"老 items"（>90 天）+ 大部分 items 在 recent 90 内触发 GENERALIST
      ageRange: { oldestDaysAgo: 150, newestDaysAgo: 3 },
      chipDistribution: { inspire: 0.50 },
      noteRate: 0.40,
      releaseShare: 0.30,
      recentReleaseCount: 10,  // 显式触发 RETURNER 的 release 信号
    },
    expected: { consumption: 'thinker', mindset: 'returner', radius: 'generalist' },
  },

  // 5️⃣ 慢品大师 = SLOW_READER + SETTLER + SPECIALIST
  {
    id: 'combo-05-slow-master',
    name: '慢品大师',
    comboName: 'SLOW_READER + SETTLER + SPECIALIST',
    category: '已命名组合',
    spec: {
      caseId: 'cb05',
      name: '慢品大师',
      clusterDistribution: [
        { name: '茶道与器物', count: 50 },
        { name: '日本美学', count: 20 },
        { name: '园艺', count: 15 },
        { name: '陶瓷', count: 12 },
      ],
      processRate: 0.45,
      // v3.1.27: ageRange 720-10 → 360-5 同样满足 SLOW_READER（avgLag 仍 ~90 天 > 60）
      //          但让 prev60 涨到 16 条覆盖所有 4 cluster，brandNew=0 推 SETTLER
      //          newestDaysAgo 改 5 让 declineFactor 真生效（之前 10 也 OK，但 5 更稳）
      ageRange: { oldestDaysAgo: 360, newestDaysAgo: 5 },
      declineFactor: 0.4,
    },
    expected: { consumption: 'slow_reader', mindset: 'settler', radius: 'specialist' },
  },

  // 6️⃣ 怀旧型醒悟者 = HOARDER + RETURNER + SPECIALIST
  {
    id: 'combo-06-nostalgic',
    name: '怀旧型醒悟者',
    comboName: 'HOARDER + RETURNER + SPECIALIST',
    category: '已命名组合',
    spec: {
      caseId: 'cb06',
      name: '怀旧型醒悟者',
      clusterDistribution: [
        { name: '编程与软件开发', count: 60 },  // SPECIALIST: top1 高
        { name: '系统架构', count: 18 },
        { name: 'DevOps', count: 12 },
        { name: '数据库', count: 10 },
      ],
      // v3.1.18 平衡数字：HOARDER(processRate<20%) + RETURNER(oldProcessRate>12%) 同时触发
      // base processRate 0.06 (6 条) + recentReleaseCount 12 (12 条强制 release 老 item)
      // 总 processRate = 18/100 = 18% < 20% ✓ HOARDER
      // oldProcessRate ≈ 12/90 = 13.3% > 12% ✓ RETURNER
      processRate: 0.06,
      ageRange: { oldestDaysAgo: 800, newestDaysAgo: 10 },
      releaseShare: 0.35,
      recentReleaseCount: 12,
    },
    expected: { consumption: 'hoarder', mindset: 'returner', radius: 'specialist' },
  },

  // 7️⃣ 短时实验家 = EXECUTOR + EXPLORER + SWITCHER
  {
    id: 'combo-07-experimenter',
    name: '短时实验家',
    comboName: 'EXECUTOR + EXPLORER + SWITCHER',
    category: '已命名组合',
    spec: {
      caseId: 'cb07',
      name: '短时实验家',
      clusterDistribution: [
        { name: '旧主题A', count: 12 },
        { name: '旧主题B', count: 10 },
        { name: '旧主题C', count: 8 },
        { name: '旧主题D', count: 7 },
      ],
      processRate: 0.65,
      releaseShare: 0.1,  // v3.1.27: 减少 release 避免 RETURNER 抢 EXPLORER
      ageRange: { oldestDaysAgo: 150, newestDaysAgo: 35 },
      chipDistribution: { used: 0.55 },  // EXECUTOR
      recentBurst: {
        recentCount: 15,  // v3.1.27: 提高让 recent monthly > 1.3 × 历史均值（EXPLORER 触发条件）
        brandNewClusters: 3,
        brandNewPrefix: '新尝试',
      },
    },
    expected: { consumption: 'executor', mindset: 'explorer', radius: 'switcher' },
  },

  // 8️⃣ 审美型杂食家 = CURATOR + EXPLORER + GENERALIST
  {
    id: 'combo-08-aesthete',
    name: '审美型杂食家',
    comboName: 'CURATOR + EXPLORER + GENERALIST',
    category: '已命名组合',
    spec: {
      caseId: 'cb08',
      name: '审美型杂食家',
      clusterDistribution: [
        { name: '电影', count: 10 },
        { name: '音乐', count: 9 },
        { name: '插画', count: 9 },
        { name: '建筑', count: 8 },
        { name: '时装', count: 8 },
        { name: '当代艺术', count: 7 },
        { name: '摄影', count: 7 },
        { name: '诗歌', count: 6 },
        { name: '电视剧', count: 6 },
        { name: '播客', count: 6 },
        { name: '城市观察', count: 5 },
      ],
      // v3.1.27: 调让 CURATOR + EXPLORER + GENERALIST 全触发
      processRate: 0.75,           // active processRate > 50% 触发 CURATOR
      releaseShare: 0.05,           // 少 release 避免 RETURNER 抢
      // v3.1.27: ageRange 120→200 扩大 base 时间跨度，让每个 base cluster 只有 ~30% 在 recent30
      //          recent30 base 覆盖率从 9/11 降到 ~5/11，jaccard 从 0.69 降到 ~0.4 < 0.5 触发 EXPLORER
      ageRange: { oldestDaysAgo: 200, newestDaysAgo: 5 },
      chipDistribution: { oneRead: 0.55 },  // 提高 oneRead 稳触发 CURATOR
      recentBurst: {
        recentCount: 14,            // 加大 recent burst 触发 EXPLORER (1.3× 历史)
        brandNewClusters: 4,        // v3.1.27 2→4：union 涨到 15，jaccard 7/15=0.47 < 0.5 触发 EXPLORER
        brandNewPrefix: '新发现',
      },
    },
    expected: { consumption: 'curator', mindset: 'explorer', radius: 'generalist' },
  },

  // 9️⃣ 多线深挖型囤积家 = DEEPENER + GENERALIST + HOARDER
  {
    id: 'combo-09-deepener-hoarder',
    name: '多线深挖型囤积家',
    comboName: 'HOARDER + DEEPENER + GENERALIST',
    category: '已命名组合',
    spec: {
      caseId: 'cb09',
      name: '多线深挖型囤积家',
      clusterDistribution: [
        { name: 'AI 工程', count: 18 },
        { name: 'Rust 与系统编程', count: 15 },
        { name: '产品设计', count: 12 },
        { name: '神经科学', count: 11 },
        { name: '组织管理', count: 10 },
        { name: '语言学习', count: 9 },
        { name: '心理治疗', count: 8 },
        { name: '哲学史', count: 8 },
        { name: '宏观经济', count: 7 },
        { name: '数学基础', count: 6 },
        { name: '工业设计', count: 6 },
      ],
      processRate: 0.12,  // HOARDER
      ageRange: { oldestDaysAgo: 150, newestDaysAgo: 5 },  // v3.1.27 缩短让 recent 30 内 base items 多 + Jaccard 高
      recentBurst: {
        recentCount: 30,  // v3.1.27 加大确保 DEEPENER 触发（recent monthly > 1.3× 历史）
        brandNewClusters: 0,
        brandNewPrefix: '',
      },
    },
    expected: { consumption: 'hoarder', mindset: 'deepener', radius: 'generalist' },
  },

  // ─── v3.1 新增组合：MINIMALIST 系 ───────────────────────────

  // 🔟 轻盈漫游者 = MINIMALIST + EXPLORER + GENERALIST
  // v3.1.26 改：MINIMALIST 阈值降到 active≤15，数据重设让 active≈12（含 release 后）
  //   11 cluster × 1 = 11 + recentBurst 4 (2 brandNew × 2) = 15 total → release ~3 → active ~12 ✓
  //   所有 cluster ageRange < 90 天 → recent90 内 cluster count = 13 > 10 → GENERALIST ✓
  {
    id: 'combo-10-light-wanderer',
    name: '轻盈漫游者',
    comboName: 'MINIMALIST + EXPLORER + GENERALIST',
    category: 'v3.1 新增组合',
    spec: {
      caseId: 'cb10',
      name: '轻盈漫游者',
      clusterDistribution: [
        { name: '城市漫步', count: 1 },
        { name: '美食', count: 1 },
        { name: '电影', count: 1 },
        { name: '小众音乐', count: 1 },
        { name: '插画', count: 1 },
        { name: '咖啡', count: 1 },
        { name: '旅行', count: 1 },
        { name: '诗歌', count: 1 },
        { name: '设计', count: 1 },
        { name: '展览', count: 1 },
        { name: '播客', count: 1 },
      ],
      // v3.1.27: 调让 MINIMALIST + EXPLORER + GENERALIST 同时触发
      //   - processRate 0.6 + releaseShare 0.5 让 burst items 也走 release（factory v3.1.27 改）
      //     burst 10 + base 11 = 21 total，~6 released → active = 15 触顶 MINIMALIST_STRICT
      //   - recentCount 4→10 让 recent monthly = 10 > 月均 7.4 × 1.3 = 9.6 触发 EXPLORER
      //   - brandNew=2 + 11 base = 13 cluster > 10 触发 GENERALIST
      processRate: 0.75,
      releaseShare: 0.5,
      ageRange: { oldestDaysAgo: 85, newestDaysAgo: 30 },  // base 全在 30-85d，recent30 只有 burst
      recentBurst: {
        recentCount: 12,            // v3.1.27 10→12：让 ratio = 12/8.1 = 1.48 > 1.3 触发 EXPLORER
        brandNewClusters: 3,        // v3.1.27 2→3：每 cluster 4 items，top1 = 4/23 = 17% < 25% 救 GENERALIST
        brandNewPrefix: '新方向',
      },
    },
    expected: { consumption: 'minimalist', mindset: 'explorer', radius: 'generalist' },
  },

  // 1️⃣1️⃣ 静默深耕者 = MINIMALIST + SETTLER + SPECIALIST
  // v3.1.26 改：active ≤ 15 + mindset 用 full items (≥ 20 触发 SETTLER)
  //   21 items + releaseShare 0.45 → 9 released → active = 12 ≤ 15 ✓
  //   SETTLER 用 full items(21) 计算 ≥ 20 ✓
  //   top1 = 10/21 = 48% > 40% + cluster=4 < 8 → SPECIALIST ✓
  {
    id: 'combo-11-quiet-master',
    name: '静默深耕者',
    comboName: 'MINIMALIST + SETTLER + SPECIALIST',
    category: 'v3.1 新增组合',
    spec: {
      caseId: 'cb11',
      name: '静默深耕者',
      clusterDistribution: [
        { name: '木工', count: 10 },
        { name: '手工艺', count: 4 },
        { name: '材料学', count: 4 },
        { name: '工具', count: 3 },
      ],
      processRate: 0.75,
      releaseShare: 0.45,  // 大量 release，让 active ≤ 15
      ageRange: { oldestDaysAgo: 200, newestDaysAgo: 30 },
      declineFactor: 0.3,
    },
    expected: { consumption: 'minimalist', mindset: 'settler', radius: 'specialist' },
  },

  // 1️⃣2️⃣ 沉睡的囤积家 = HOARDER + DORMANT + GENERALIST
  {
    id: 'combo-12-sleeping-hoarder',
    name: '沉睡的囤积家',
    comboName: 'HOARDER + DORMANT + GENERALIST',
    category: 'v3.1 新增组合',
    spec: {
      caseId: 'cb12',
      name: '沉睡的囤积家',
      clusterDistribution: [
        { name: 'AI 应用与工具', count: 12 },
        { name: '健身', count: 10 },
        { name: '投资', count: 10 },
        { name: '心理学', count: 9 },
        { name: '编程', count: 8 },
        { name: '设计', count: 8 },
        { name: '历史', count: 7 },
        { name: '语言学习', count: 7 },
        { name: '商业', count: 7 },
        { name: '科普', count: 7 },
        { name: '生活方式', count: 7 },
      ],
      processRate: 0.08,  // HOARDER
      // v3.1.27: 缩到 130-5 让 recent 90 内全部 cluster 覆盖触发 GENERALIST
      ageRange: { oldestDaysAgo: 130, newestDaysAgo: 5 },
      idleDays: 35,  // DORMANT > 30 即可触发，不必很大
    },
    expected: { consumption: 'hoarder', mindset: 'dormant', radius: 'generalist' },
  },

  // ─── 边缘场景：单/双维度触发 ──────────────────────────

  {
    id: 'edge-01-consumption-only',
    name: '仅消费风格 · HOARDER',
    category: '边缘场景',
    spec: {
      caseId: 'eg01',
      name: '仅消费风格 HOARDER',
      // v3.1.23 修：原数据（3 clusters 均匀分布 5-300 天）经 rand() 后实际 recent30 < monthlyAvg*0.6 → SETTLER 触发
      // 现设计落到 mindset + radius 双间隙带：
      //   mindset 全失败：recent30 ≈ monthlyAvg（无 decline）+ 0 brandNew + 无 burst + 无 idle + 无 force release
      //     - SETTLER: 50/(90/30)=16.7 monthly, recent30 ≈ 16.7，> 10 (0.6 阈值)，fail ✓
      //     - 其他 mindset 都需要明确信号（brandNew/idle/chip/burst），都缺
      //   radius 全失败：top1=14/50=28%，clusterCount=5
      //     - SPECIALIST: top1>40% fail
      //     - GENERALIST: clusterCount>10 fail
      //     - SWITCHER: recent30Clusters.size 跟 prev60Clusters.size jaccard 高 → fail
      clusterDistribution: [
        { name: '设计', count: 14 },
        { name: '编程', count: 12 },
        { name: 'AI', count: 10 },
        { name: '阅读', count: 8 },
        { name: '工具', count: 6 },
      ],
      processRate: 0.10,  // HOARDER < 20% + items=50 ≥ 50
      ageRange: { oldestDaysAgo: 90, newestDaysAgo: 5 },  // 紧时窗，让 recent30 ≈ monthlyAvg
    },
    expected: { consumption: 'hoarder', mindset: null, radius: null },
  },

  {
    id: 'edge-02-consumption-mindset',
    name: '双维度 · HOARDER + DORMANT (无半径)',
    category: '边缘场景',
    spec: {
      caseId: 'eg02',
      name: '双维度 HOARDER + DORMANT',
      // v3.1.22 修：原数据（3 clusters，top1=40%）经 idleDays 推移后实际触发 SPECIALIST
      //   → 跟 case 名"(无半径)"矛盾。
      // 现在用 radius 算法的间隙带：
      //   - clusters = 5（>=8 失败 SPECIALIST 的 clusterCount<8 不严格但被 top1 < 40% 拦住；
      //                 也 < 11 失败 GENERALIST 的 clusterCount > 10）
      //   - top1 = 14/50 = 28%（< 40% 失败 SPECIALIST；> 25% 失败 GENERALIST）
      //   - DORMANT 让 recent30 为空 → SWITCHER 也失败（recent30Clusters.size < 2）
      clusterDistribution: [
        { name: '设计', count: 14 },
        { name: '编程', count: 12 },
        { name: 'AI', count: 10 },
        { name: '阅读', count: 8 },
        { name: '工具', count: 6 },
      ],
      processRate: 0.10,
      ageRange: { oldestDaysAgo: 250, newestDaysAgo: 5 },  // v3.1.27: 延长跨度让 monthlyAvg ≥ 5（DORMANT 触发条件）
      idleDays: 60,  // 加大 idle → DORMANT 抢 SETTLER
    },
    expected: { consumption: 'hoarder', mindset: 'dormant', radius: null },
  },

  // ─── 异常场景 ─────────────────────────────────────────────

  // v3.1.21 · NEWCOMER 已废弃（task #36 / v3.1.5 起 MINIMALIST 兜底接住所有 items<=50）
  //   这两个 case 改名为 zero-data / very-few，验证 MINIMALIST 兜底渲染（含"未显形"卡 + 邀请态）
  {
    id: 'exc-01-zero-data',
    name: 'MINIMALIST 兜底 · 空数据（0 条）',
    category: '异常',
    spec: {
      caseId: 'ex01',
      name: 'MINIMALIST 空',
      clusterDistribution: [],
      ageRange: { oldestDaysAgo: 0, newestDaysAgo: 0 },
    },
    // v3.1.5 后 consumption 永远兜底为 minimalist；mindset/radius 因数据为 0 不触发
    expected: { consumption: 'minimalist', mindset: null, radius: null },
  },

  {
    id: 'exc-02-very-few',
    name: 'MINIMALIST 兜底 · 少数据（8 条）',
    category: '异常',
    spec: {
      caseId: 'ex02',
      name: 'MINIMALIST 少',
      clusterDistribution: [{ name: '随便', count: 8 }],
      ageRange: { oldestDaysAgo: 20, newestDaysAgo: 2 },
    },
    expected: { consumption: 'minimalist', mindset: null, radius: null },
  },

  {
    id: 'combo-13-balanced-stable',
    name: '稳态平衡者（v3.1.5 BALANCED 兜底）',
    comboName: 'BALANCED + (mindset null) + (radius null)',
    category: 'v3.1 新增组合',
    spec: {
      caseId: 'cb13',
      name: '稳态平衡者',
      // 80 条收藏，处理率 35%（中等），分布 5 个主题（中等专注度）
      // 无 chip / 无爆发 / 无衰退 → 所有其他身份都不触发 → BALANCED 兜底
      clusterDistribution: [
        { name: '阅读', count: 18 },
        { name: '工作', count: 16 },
        { name: '科技', count: 16 },
        { name: '生活', count: 15 },
        { name: '思考', count: 15 },
      ],
      processRate: 0.35,
      ageRange: { oldestDaysAgo: 240, newestDaysAgo: 5 },
    },
    expected: { consumption: 'balanced' },
  },

  {
    id: 'exc-03-imported-no-engagement',
    name: 'HOARDER · 刚导入未活动（v3.1.27 新规则）',
    category: '异常',
    spec: {
      caseId: 'ex03',
      name: '刚导入 + 未活动',
      // 30 条 Chrome 书签全 pending
      // v3.1.4: items<=50 → MINIMALIST 兜底
      // v3.1.27 改: active 30 + 真用过率低 + pending 多 → HOARDER 中量路径触发
      //   "30 条堆着 + 几乎没真打开" 本质就是积压
      clusterDistribution: [
        { name: '工作', count: 12 },
        { name: '阅读', count: 10 },
        { name: '其他', count: 8 },
      ],
      processRate: 0,
      ageRange: { oldestDaysAgo: 365, newestDaysAgo: 30 },
    },
    expected: { consumption: 'hoarder' },  // v3.1.27 新规则
  },

  // ─── v3.1.21 新增：未命名组合（验证 synthesizeComboName + 叙事感 narrative）

  // 14 · MKG = MINIMALIST + SEEKER + GENERALIST → "轻盈追寻家"
  // 期望 narrative: "不轻易保存的你兴趣很广泛，但是最近你被一个方向紧紧抓住。"
  {
    id: 'combo-14-minimalist-seeker',
    name: '轻盈追寻家（MKG，未命名 → 算法合成）',
    comboName: 'MINIMALIST + SEEKER + GENERALIST',
    category: 'v3.1 新增组合',
    spec: {
      caseId: 'cb14',
      name: '轻盈追寻家',
      // MINIMALIST: items <= 50 触发兜底；故意控制在 40 条让 mindset/radius 还能算
      // SEEKER: recent 30 集中在 top cluster，无 brandNew
      // GENERALIST: clusters >= 8（让 radius 走 GENERALIST 分支）
      clusterDistribution: [
        { name: '极简主义', count: 12 },  // top1 是 SEEKER 的方向
        { name: '哲学', count: 4 },
        { name: '建筑', count: 4 },
        { name: '诗', count: 4 },
        { name: '音乐', count: 4 },
        { name: '电影', count: 4 },
        { name: '生活方式', count: 4 },
        { name: '心理', count: 4 },
      ],
      processRate: 0.55,
      ageRange: { oldestDaysAgo: 180, newestDaysAgo: 3 },
      // SEEKER：近 30 天集中在 top cluster
      recentBurst: { recentCount: 8, brandNewClusters: 0 },
    },
    expected: { consumption: 'minimalist', mindset: 'seeker', radius: 'generalist' },
  },

  // 15 · CRG = CURATOR + RETURNER + GENERALIST → "精挑回望家"
  {
    id: 'combo-15-curator-returner',
    name: '精挑回望家（CRG，未命名 → 算法合成）',
    comboName: 'CURATOR + RETURNER + GENERALIST',
    category: 'v3.1 新增组合',
    spec: {
      caseId: 'cb15',
      name: '精挑回望家',
      clusterDistribution: [
        { name: '当代艺术', count: 15 },
        { name: '建筑', count: 12 },
        { name: '诗歌', count: 10 },
        { name: '哲学', count: 9 },
        { name: '电影', count: 8 },
        { name: '设计', count: 8 },
        { name: '音乐', count: 7 },
        { name: '城市观察', count: 6 },
        { name: '插画', count: 5 },
      ],
      processRate: 0.55,
      ageRange: { oldestDaysAgo: 500, newestDaysAgo: 5 },
      chipDistribution: { oneRead: 0.50 },  // CURATOR
      releaseShare: 0.30,
      recentReleaseCount: 10,  // RETURNER: 近 30 天处理多条老 item
    },
    expected: { consumption: 'curator', mindset: 'returner', radius: 'generalist' },
  },

  // 16 · EDP = EXECUTOR + DEEPENER + SPECIALIST → "实战深挖者"
  //   叙事预期是"一致型"——三个维度都偏深耕方向，narrative connector 用"，"不用"但是"
  {
    id: 'combo-16-executor-deepener',
    name: '实战深挖者（EDP，未命名 → 算法合成 · 一致叙事）',
    comboName: 'EXECUTOR + DEEPENER + SPECIALIST',
    category: 'v3.1 新增组合',
    spec: {
      caseId: 'cb16',
      name: '实战深挖者',
      clusterDistribution: [
        { name: 'Rust 系统编程', count: 45 },
        { name: '编译原理', count: 18 },
        { name: '操作系统', count: 12 },
        { name: '性能优化', count: 10 },
      ],
      processRate: 0.78,
      ageRange: { oldestDaysAgo: 280, newestDaysAgo: 4 },
      chipDistribution: { used: 0.55 },  // EXECUTOR
      // DEEPENER: 近 30 天保存爆发 + 不开新方向
      recentBurst: { recentCount: 18, brandNewClusters: 0 },
    },
    expected: { consumption: 'executor', mindset: 'deepener', radius: 'specialist' },
  },

  // 17 · BXG = BALANCED + EXPLORER + GENERALIST → "稳态漫游家"
  //   验证 BALANCED 兜底跟其他维度组合时的合成名 + narrative
  {
    id: 'combo-17-balanced-explorer',
    name: '稳态漫游家（BXG，未命名 → 算法合成）',
    comboName: 'BALANCED + EXPLORER + GENERALIST',
    category: 'v3.1 新增组合',
    spec: {
      caseId: 'cb17',
      name: '稳态漫游家',
      clusterDistribution: [
        { name: '阅读', count: 12 },
        { name: '工作方法', count: 10 },
        { name: '思考', count: 10 },
        { name: '科技', count: 9 },
        { name: '生活', count: 9 },
        { name: '电影', count: 8 },
        { name: '设计', count: 7 },
        { name: '历史', count: 6 },
      ],
      processRate: 0.35,  // 中等 → BALANCED 兜底
      ageRange: { oldestDaysAgo: 240, newestDaysAgo: 3 },
      // EXPLORER: 近 30 天 brandNew >= 2
      recentBurst: { recentCount: 10, brandNewClusters: 3, brandNewPrefix: '新方向' },
    },
    expected: { consumption: 'balanced', mindset: 'explorer', radius: 'generalist' },
  },

  // ─── v3.1.20 新增：§2 意外维度（验证 5 个新模板触发 + identityHook）─────
  //
  // v3.1.23 删除 edge-03-source-twitter：factory 默认 sourceDomain='example.com'，
  //   所有 item 都同域名 → source_concentration 一定触发（top1=100%）。
  //   但跟 edge-01 实际渲染重叠（edge-01 也会触发 source_concentration）。
  //   要真正测有意义的来源集中度，需要 factory 支持 sourceDomainDistribution。
  //   留作 factory v3.1.24 增强后再补 case。

  // edge-04 · 私注静默 note_silence
  // 期望 §2: "你留下了 N 条——写过一句话的只有 0 条"+ THINKER identityHook 反差
  {
    id: 'edge-04-note-silent',
    name: '§2 私注静默 · THINKER 反差（留多写少）',
    category: '边缘场景',
    spec: {
      caseId: 'eg04',
      name: 'THINKER 静默',
      clusterDistribution: [
        { name: '心理学', count: 20 },
        { name: '哲学', count: 18 },
        { name: '文学', count: 16 },
        { name: '社会学', count: 14 },
      ],
      processRate: 0.70,
      // v3.1.24 修：原 ageRange 320-4 让 avgLag ≈ 81 满足 SLOW_READER（avgLag>60+processRate>30%）
      //   + factory rand() seed 偏导致 chip 命中不足 5 条 → chip-based 失败 → SLOW_READER 抢
      // 现在缩到 180-4 让 avgLag ≈ 46 < 60，SLOW_READER 失败；chip 提到 0.85 保证 totalChips >> 5
      ageRange: { oldestDaysAgo: 180, newestDaysAgo: 4 },
      chipDistribution: { inspire: 0.85 },  // THINKER chip · 提高保证 chip-based 稳定触发
      noteRate: 0.02,  // 几乎没人写私注 → note_silence 触发
    },
    expected: { consumption: 'thinker' },
  },

  // edge-05 · chip 分布 chip_distribution
  // 期望 §2: "你打过的 chip 里 X% 都是『启发思路』" + EXECUTOR 反差 hook
  // 注：factory chipDistribution 用累积区间随机，启发思路占 60% 应足够触发
  {
    id: 'edge-05-chip-inspire',
    name: '§2 Chip 分布 · EXECUTOR 反差（多启发少行动）',
    category: '边缘场景',
    spec: {
      caseId: 'eg05',
      name: 'EXECUTOR chip 反差',
      clusterDistribution: [
        { name: '产品方法', count: 30 },
        { name: '增长', count: 15 },
        { name: '管理', count: 10 },
        { name: '商业', count: 8 },
      ],
      processRate: 0.75,
      ageRange: { oldestDaysAgo: 240, newestDaysAgo: 3 },
      // 大量"启发思路" + 少量"实际用到了" → chip_distribution 触发 + EXECUTOR contrast
      chipDistribution: { inspire: 0.60, used: 0.10 },
    },
    expected: { consumption: 'thinker' },  // 实际会被判 thinker（inspire 占主），但 §2 应触发 chip_distribution
  },

  // edge-06 · 爆发期 burst_period
  // 期望 §2: "你 X% 的收藏都来自 ... 那 30 天"
  // factory 默认 ageRange 是均匀分布，没法直接做爆发期——这个 case 暂时只验证不触发
  // （需要 factory 加 burstWindow 支持，留作未来增强）
  {
    id: 'edge-06-burst-period-placeholder',
    name: '§2 爆发期 · 占位（factory 不支持窗口分布）',
    category: '边缘场景',
    spec: {
      caseId: 'eg06',
      name: '爆发期 placeholder',
      clusterDistribution: [
        { name: '主题 A', count: 40 },
        { name: '主题 B', count: 20 },
        { name: '主题 C', count: 15 },
      ],
      processRate: 0.45,
      ageRange: { oldestDaysAgo: 365, newestDaysAgo: 5 },
    },
    expected: { consumption: 'balanced' },
  },

  // edge-07 · 沉默主题 stale_topic
  // 期望 §2: "「某主题」你存过 N 条——但最后一条是 X 个月前"
  // 通过 recentBurst 让某些 cluster 只出现在 ageRange 老端
  {
    id: 'edge-07-stale-topic',
    name: '§2 沉默主题 · HOARDER 老主题久未访问',
    category: '边缘场景',
    spec: {
      caseId: 'eg07',
      name: '沉默主题',
      clusterDistribution: [
        // 老主题：oldestDaysAgo=600 一端，靠 ageRange 推断"最后一条" 很久之前
        { name: '学日语', count: 18 },
        { name: '健身', count: 12 },
        // 当前主题
        { name: '编程', count: 25 },
        { name: 'AI', count: 20 },
      ],
      processRate: 0.10,
      // ageRange 跨度很大，旧主题在老端，新主题在近端——factory 均匀分布会让"学日语"也有近期保存
      // 真实触发 stale_topic 需要 cluster 跟 ageRange 解耦，留作 factory v3.1.22 增强
      ageRange: { oldestDaysAgo: 600, newestDaysAgo: 3 },
    },
    expected: { consumption: 'hoarder' },
  },
]
