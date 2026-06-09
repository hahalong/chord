/**
 * v3.1.26 · audit CLI · 跑所有 cases.ts 的 case 输出 expected vs 实际对比表
 * 命令: pnpm test -- audit-cli
 */
import { describe, it } from 'vitest'
import { generateMockData } from './MockFactory.js'
import { computeAllIdentities } from '../services/IdentityService.js'

// 内联 17 个 case spec（避免跨 package import）
const CASES: Array<{ id: string; mbti: string; spec: Parameters<typeof generateMockData>[0]; expected: { consumption?: string | null; mindset?: string | null; radius?: string | null } }> = [
  // 12 named combo
  { id: 'combo-01', mbti: 'HXG', spec: { caseId: 'cb01', name: 'HXG', clusterDistribution: [{ name: 'A', count: 8 }, { name: 'B', count: 8 }, { name: 'C', count: 8 }, { name: 'D', count: 7 }, { name: 'E', count: 7 }, { name: 'F', count: 7 }, { name: 'G', count: 6 }, { name: 'H', count: 6 }, { name: 'I', count: 6 }, { name: 'J', count: 6 }, { name: 'K', count: 5 }], processRate: 0.10, ageRange: { oldestDaysAgo: 220, newestDaysAgo: 40 }, recentBurst: { recentCount: 18, brandNewClusters: 3, brandNewPrefix: '新方向' } }, expected: { consumption: 'hoarder', mindset: 'explorer', radius: 'generalist' } },
  { id: 'combo-02', mbti: 'CLP', spec: { caseId: 'cb02', name: 'CLP', clusterDistribution: [{ name: '建筑', count: 50 }, { name: '艺术', count: 25 }, { name: '城市', count: 15 }, { name: '摄影', count: 10 }], processRate: 0.65, releaseShare: 0.05, ageRange: { oldestDaysAgo: 200, newestDaysAgo: 5 }, chipDistribution: { oneRead: 0.50 }, declineFactor: 0.4 }, expected: { consumption: 'curator', mindset: 'settler', radius: 'specialist' } },
  { id: 'combo-03', mbti: 'EKP', spec: { caseId: 'cb03', name: 'EKP', clusterDistribution: [{ name: '产品', count: 50 }, { name: '团队', count: 18 }, { name: '商业', count: 12 }, { name: '增长', count: 10 }], processRate: 0.78, releaseShare: 0.05, ageRange: { oldestDaysAgo: 200, newestDaysAgo: 5 }, chipDistribution: { used: 0.55 } }, expected: { consumption: 'executor', mindset: 'seeker', radius: 'specialist' } },
  { id: 'combo-04', mbti: 'TRG', spec: { caseId: 'cb04', name: 'TRG', clusterDistribution: [{ name: '心理', count: 15 }, { name: '哲学', count: 14 }, { name: '文学', count: 13 }, { name: '社会', count: 12 }, { name: '历史', count: 11 }, { name: '艺术', count: 10 }, { name: '人物', count: 9 }, { name: '日记', count: 9 }, { name: '诗歌', count: 8 }, { name: '随笔', count: 8 }, { name: '思想', count: 7 }, { name: '宗教', count: 6 }], processRate: 0.65, ageRange: { oldestDaysAgo: 150, newestDaysAgo: 3 }, chipDistribution: { inspire: 0.50 }, noteRate: 0.40, releaseShare: 0.30, recentReleaseCount: 10 }, expected: { consumption: 'thinker', mindset: 'returner', radius: 'generalist' } },
  { id: 'combo-05', mbti: 'SLP', spec: { caseId: 'cb05', name: 'SLP', clusterDistribution: [{ name: '茶', count: 50 }, { name: '美学', count: 20 }, { name: '园艺', count: 15 }, { name: '陶瓷', count: 12 }], processRate: 0.45, ageRange: { oldestDaysAgo: 360, newestDaysAgo: 5 }, declineFactor: 0.4 }, expected: { consumption: 'slow_reader', mindset: 'settler', radius: 'specialist' } },
  { id: 'combo-06', mbti: 'HRP', spec: { caseId: 'cb06', name: 'HRP', clusterDistribution: [{ name: '编程', count: 60 }, { name: '系统', count: 18 }, { name: 'DevOps', count: 12 }, { name: '数据库', count: 10 }], processRate: 0.06, ageRange: { oldestDaysAgo: 800, newestDaysAgo: 10 }, releaseShare: 0.35, recentReleaseCount: 12 }, expected: { consumption: 'hoarder', mindset: 'returner', radius: 'specialist' } },
  { id: 'combo-07', mbti: 'EXW', spec: { caseId: 'cb07', name: 'EXW', clusterDistribution: [{ name: 'A', count: 12 }, { name: 'B', count: 10 }, { name: 'C', count: 8 }, { name: 'D', count: 7 }], processRate: 0.65, releaseShare: 0.1, ageRange: { oldestDaysAgo: 150, newestDaysAgo: 35 }, chipDistribution: { used: 0.55 }, recentBurst: { recentCount: 15, brandNewClusters: 3, brandNewPrefix: '新尝试' } }, expected: { consumption: 'executor', mindset: 'explorer', radius: 'switcher' } },
  { id: 'combo-08', mbti: 'CXG', spec: { caseId: 'cb08', name: 'CXG', clusterDistribution: [{ name: '电影', count: 10 }, { name: '音乐', count: 9 }, { name: '插画', count: 9 }, { name: '建筑', count: 8 }, { name: '时装', count: 8 }, { name: '艺术', count: 7 }, { name: '摄影', count: 7 }, { name: '诗歌', count: 6 }, { name: '电视', count: 6 }, { name: '播客', count: 6 }, { name: '城市', count: 5 }], processRate: 0.75, releaseShare: 0.05, ageRange: { oldestDaysAgo: 200, newestDaysAgo: 5 }, chipDistribution: { oneRead: 0.55 }, recentBurst: { recentCount: 14, brandNewClusters: 4, brandNewPrefix: '新发现' } }, expected: { consumption: 'curator', mindset: 'explorer', radius: 'generalist' } },
  { id: 'combo-09', mbti: 'HDG', spec: { caseId: 'cb09', name: 'HDG', clusterDistribution: [{ name: 'A', count: 18 }, { name: 'B', count: 15 }, { name: 'C', count: 12 }, { name: 'D', count: 11 }, { name: 'E', count: 10 }, { name: 'F', count: 9 }, { name: 'G', count: 8 }, { name: 'H', count: 8 }, { name: 'I', count: 7 }, { name: 'J', count: 6 }, { name: 'K', count: 6 }], processRate: 0.12, ageRange: { oldestDaysAgo: 150, newestDaysAgo: 5 }, recentBurst: { recentCount: 30, brandNewClusters: 0 } }, expected: { consumption: 'hoarder', mindset: 'deepener', radius: 'generalist' } },
  { id: 'combo-10', mbti: 'MXG', spec: { caseId: 'cb10', name: 'MXG', clusterDistribution: Array.from({ length: 11 }, (_, i) => ({ name: `主题${i + 1}`, count: 1 })), processRate: 0.75, releaseShare: 0.5, ageRange: { oldestDaysAgo: 85, newestDaysAgo: 30 }, recentBurst: { recentCount: 12, brandNewClusters: 3, brandNewPrefix: '新方向' } }, expected: { consumption: 'minimalist', mindset: 'explorer', radius: 'generalist' } },
  { id: 'combo-11', mbti: 'MLP', spec: { caseId: 'cb11', name: 'MLP', clusterDistribution: [{ name: '木工', count: 10 }, { name: '手工', count: 4 }, { name: '材料', count: 4 }, { name: '工具', count: 3 }], processRate: 0.75, releaseShare: 0.45, ageRange: { oldestDaysAgo: 200, newestDaysAgo: 30 }, declineFactor: 0.3 }, expected: { consumption: 'minimalist', mindset: 'settler', radius: 'specialist' } },
  { id: 'combo-12', mbti: 'HZG', spec: { caseId: 'cb12', name: 'HZG', clusterDistribution: [{ name: 'A', count: 12 }, { name: 'B', count: 10 }, { name: 'C', count: 10 }, { name: 'D', count: 9 }, { name: 'E', count: 8 }, { name: 'F', count: 8 }, { name: 'G', count: 7 }, { name: 'H', count: 7 }, { name: 'I', count: 7 }, { name: 'J', count: 7 }, { name: 'K', count: 7 }], processRate: 0.08, ageRange: { oldestDaysAgo: 130, newestDaysAgo: 5 }, idleDays: 35 }, expected: { consumption: 'hoarder', mindset: 'dormant', radius: 'generalist' } },
  { id: 'combo-13', mbti: 'B__', spec: { caseId: 'cb13', name: 'B', clusterDistribution: [{ name: '阅读', count: 18 }, { name: '工作', count: 16 }, { name: '科技', count: 16 }, { name: '生活', count: 15 }, { name: '思考', count: 15 }], processRate: 0.35, ageRange: { oldestDaysAgo: 240, newestDaysAgo: 5 } }, expected: { consumption: 'balanced' } },
  // edge
  { id: 'edge-01', mbti: 'H__', spec: { caseId: 'eg01', name: 'edge1', clusterDistribution: [{ name: '设计', count: 14 }, { name: '编程', count: 12 }, { name: 'AI', count: 10 }, { name: '阅读', count: 8 }, { name: '工具', count: 6 }], processRate: 0.10, ageRange: { oldestDaysAgo: 90, newestDaysAgo: 5 } }, expected: { consumption: 'hoarder', mindset: null, radius: null } },
  { id: 'edge-02', mbti: 'HZ_', spec: { caseId: 'eg02', name: 'edge2', clusterDistribution: [{ name: '设计', count: 14 }, { name: '编程', count: 12 }, { name: 'AI', count: 10 }, { name: '阅读', count: 8 }, { name: '工具', count: 6 }], processRate: 0.10, ageRange: { oldestDaysAgo: 250, newestDaysAgo: 5 }, idleDays: 60 }, expected: { consumption: 'hoarder', mindset: 'dormant', radius: null } },
  // exc
  { id: 'exc-01', mbti: 'M__', spec: { caseId: 'ex01', name: 'ex1', clusterDistribution: [], ageRange: { oldestDaysAgo: 0, newestDaysAgo: 0 } }, expected: { consumption: 'minimalist' } },
  { id: 'exc-02', mbti: 'M__', spec: { caseId: 'ex02', name: 'ex2', clusterDistribution: [{ name: '随便', count: 8 }], ageRange: { oldestDaysAgo: 20, newestDaysAgo: 2 } }, expected: { consumption: 'minimalist' } },
  { id: 'exc-03', mbti: 'H__', spec: { caseId: 'ex03', name: 'ex3', clusterDistribution: [{ name: '工作', count: 12 }, { name: '阅读', count: 10 }, { name: '其他', count: 8 }], processRate: 0, ageRange: { oldestDaysAgo: 365, newestDaysAgo: 30 } }, expected: { consumption: 'hoarder' } },
]

describe('v3.1.26 全 case 触发对比', () => {
  it('print', () => {
    console.log('\n')
    console.log('┌' + '─'.repeat(94) + '┐')
    console.log('│ ' + 'Case ID'.padEnd(22) + 'MBTI  ' + 'expected'.padEnd(30) + 'actual'.padEnd(30) + '│ ')
    console.log('├' + '─'.repeat(94) + '┤')
    let okCount = 0
    let warnCount = 0
    for (const c of CASES) {
      const data = generateMockData(c.spec)
      const cards = computeAllIdentities(data.chord_items)
      const actual = {
        consumption: cards.find(x => x.dimension === 'consumption')?.id ?? null,
        mindset: cards.find(x => x.dimension === 'mindset')?.id ?? null,
        radius: cards.find(x => x.dimension === 'radius')?.id ?? null,
      }
      const ok = (c.expected.consumption === undefined || c.expected.consumption === actual.consumption)
        && (c.expected.mindset === undefined || c.expected.mindset === actual.mindset)
        && (c.expected.radius === undefined || c.expected.radius === actual.radius)
      const expectedStr = [c.expected.consumption ?? '·', c.expected.mindset ?? '·', c.expected.radius ?? '·'].join('/')
      const actualStr = [actual.consumption ?? '·', actual.mindset ?? '·', actual.radius ?? '·'].join('/')
      console.log('│ ' + c.id.padEnd(22) + c.mbti.padEnd(6) + expectedStr.padEnd(30) + actualStr.padEnd(30) + (ok ? '✓' : '✗') + '│ ')
      if (ok) okCount++; else warnCount++;
    }
    console.log('└' + '─'.repeat(94) + '┘')
    console.log(`总: ${CASES.length}, ✓ ${okCount}, ✗ ${warnCount}`)
    console.log('\n')
  })
})
