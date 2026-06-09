/**
 * TerrainClassifier · v3.1.29
 *
 * 共享地形分类算法 · 同一个 cluster 在两处复用：
 *   - 兴趣地图气泡角标（每个 cluster 都标）
 *   - §3 隐性自我地形 4 块（每种 type 挑 score 最高的代表）
 *
 * 取代 InterestStateService（active 兜底有 anti-pattern · 概念清晰度优先）。
 *
 * 5 类 enum：
 *   - ember (新冒火苗 / 兴趣地图角标: 萌芽中 紫): 最近爆发涌现
 *   - sleep (沉睡之地 / 兴趣地图角标: 休眠 玫瑰): 长期无动作
 *   - forest (真实热情之林 / 兴趣地图角标: 活跃 绿): 在用 + 常态
 *   - swamp (焦虑沼泽 / 兴趣地图角标: 积压中 灰红): 不在用 + 还在保存
 *   - middle (中间态 / 无角标): 不归任何类
 *
 * 判定顺序（先匹配先赢）：
 *   1. items < TERRAIN_FOREST_MIN_ITEMS → middle（太小没意义）
 *   2. 最近爆发？ → ember
 *   3. 长期无动作？ → sleep
 *   4. 在用度高 ≥ 50% → forest
 *   5. 在用度低 < 30% + 体量 ≥ 10 → swamp
 *   6. 其他（20-50% 在用度，半积压）→ middle
 */

import { IDENTITY_CONFIG as CFG } from './IdentityConfig.js'
import type { Item } from '@chord/types'

const DAY = 86_400_000

export type TerrainType = 'forest' | 'swamp' | 'ember' | 'sleep' | 'middle'

export interface TerrainResult {
  /** 分类结果 */
  type: TerrainType
  /** "代表性"分（0-1）—— §3 用来在同 type 内挑代表 cluster */
  score: number
  /** 真用过率（reallyUsedRate）= chip='实际用到了' OR visitCount>0 OR lastVisitedAt 近 90d */
  reallyUsedRate: number
  /** 真用过的 items 数 */
  reallyUsedCount: number
  /** 累计 visit 次数（chrome.history 总和）*/
  visitTotal: number
  /** 最近 30 天 saves 数 */
  recent30: number
  /** 30-90 天 saves 数 */
  prev30to90: number
  /** 最近一条 save 距今天数 */
  lastSaveDays: number
  /** 最老一条 save 距今天数 */
  oldestSaveDays: number
  /** 主题总条数 */
  total: number
}

export interface ClassifyInput {
  /** cluster 内所有 items */
  items: Item[]
  /** chrome.history visitCount 字典（itemId → count）*/
  visitCounts?: Map<string, number>
  /** 当前时间（测试可注入）*/
  now?: number
}

/**
 * 把一个 cluster 分到 5 种地形之一。
 * 输入 cluster 的所有 items + visit 数据 + now。
 * 输出地形 type + 代表性 score + 细节指标。
 */
export function classifyTerrain(input: ClassifyInput): TerrainResult {
  const { items, visitCounts, now = Date.now() } = input
  const total = items.length

  // 计算基础指标
  let reallyUsedCount = 0
  let visitTotal = 0
  const RECENT_USE_MS = CFG.TERRAIN_RECENT_USE_WINDOW_DAYS_V2 * DAY
  for (const it of items) {
    const v = visitCounts?.get(it.id) ?? 0
    visitTotal += v
    const isUsed =
      it.usageChip === '实际用到了' ||
      v > 0 ||
      (it.lastVisitedAt != null && now - it.lastVisitedAt < RECENT_USE_MS)
    if (isUsed) reallyUsedCount++
  }
  const reallyUsedRate = total > 0 ? reallyUsedCount / total : 0

  const savedAts = items.map((i) => i.savedAt)
  const newest = savedAts.length > 0 ? Math.max(...savedAts) : now
  const oldest = savedAts.length > 0 ? Math.min(...savedAts) : now
  const lastSaveDays = (now - newest) / DAY
  const oldestSaveDays = (now - oldest) / DAY

  const recent30 = savedAts.filter((t) => now - t < 30 * DAY).length
  const prev30to90 = savedAts.filter((t) => {
    const age = now - t
    return age >= 30 * DAY && age < 90 * DAY
  }).length

  const detail = {
    reallyUsedRate, reallyUsedCount, visitTotal,
    recent30, prev30to90, lastSaveDays, oldestSaveDays, total,
  }

  // 判定 Step 1：太小不归任何类
  if (total < CFG.TERRAIN_FOREST_MIN_ITEMS) {
    return { type: 'middle', score: 0, ...detail }
  }

  // 判定 Step 2：ember（最近爆发涌现）
  //   - recent30 ≥ 3
  //   - recent30 > prev30to90 × 1.5
  if (
    recent30 >= CFG.TERRAIN_EMBER_MIN_RECENT30 &&
    recent30 > prev30to90 * CFG.TERRAIN_EMBER_RATIO_OVER_PREV
  ) {
    // score: recent burst 越强 score 越高
    const ratio = recent30 / Math.max(1, prev30to90 + 1)  // +1 避免除 0
    const score = Math.min(1, ratio / 5)
    return { type: 'ember', score, ...detail }
  }

  // 判定 Step 3：sleep（长期无动作 + 体量够）
  //   - lastSaveDays > 90
  //   - items ≥ 5
  if (
    lastSaveDays > CFG.TERRAIN_SLEEP_MIN_DAYS_SINCE &&
    total >= CFG.TERRAIN_SLEEP_MIN_ITEMS
  ) {
    // score: 越老越休眠 + 体量越大代表性越高
    const ageScore = Math.min(1, lastSaveDays / 365)
    const sizeScore = Math.min(1, total / 20)
    const score = 0.6 * ageScore + 0.4 * sizeScore
    return { type: 'sleep', score, ...detail }
  }

  // 判定 Step 4：forest（真在用 + 常态）
  //   - reallyUsedRate ≥ 50%
  //   - items ≥ 5
  if (reallyUsedRate >= CFG.TERRAIN_FOREST_MIN_USED_RATE) {
    // score: 真用过率 + 体量
    const score = 0.7 * reallyUsedRate + 0.3 * Math.min(1, total / 30)
    return { type: 'forest', score, ...detail }
  }

  // 判定 Step 5：swamp（不在用 + 体量大）
  //   - reallyUsedRate < 30%（v3.1.29 用户决策 B）
  //   - items ≥ 10
  if (
    reallyUsedRate < CFG.TERRAIN_SWAMP_MAX_USED_RATE &&
    total >= CFG.TERRAIN_SWAMP_MIN_ITEMS
  ) {
    // score: 体量越大、未用率越高 → 越典型
    const unusedRate = 1 - reallyUsedRate
    const score = 0.5 * unusedRate + 0.5 * Math.min(1, total / 30)
    return { type: 'swamp', score, ...detail }
  }

  // 判定 Step 6：middle（中间态 · 半积压）
  return { type: 'middle', score: 0, ...detail }
}

/**
 * 给定一组 (cluster name, items)，对每个 cluster 分类。
 * 返回 map: cluster name → TerrainResult。
 */
export function classifyAllClusters(
  clusterMap: Map<string, Item[]>,
  visitCounts?: Map<string, number>,
  now: number = Date.now(),
): Map<string, TerrainResult> {
  const result = new Map<string, TerrainResult>()
  for (const [name, items] of clusterMap) {
    result.set(name, classifyTerrain({ items, visitCounts, now }))
  }
  return result
}

/**
 * 从一堆 cluster 分类结果里挑出每种 type 的"代表"（score 最高的那个）。
 * §3 4 块地形用这个：forest 取 score 最高 cluster 当真实热情之林、swamp 同理...
 */
export function pickRepresentatives(
  results: Map<string, TerrainResult>,
): {
  forest: { cluster: string; result: TerrainResult } | null
  swamp: { cluster: string; result: TerrainResult } | null
  ember: { cluster: string; result: TerrainResult } | null
  sleep: { cluster: string; result: TerrainResult } | null
  middleCount: number
} {
  const byType: Record<TerrainType, { cluster: string; result: TerrainResult }[]> = {
    forest: [], swamp: [], ember: [], sleep: [], middle: [],
  }
  for (const [cluster, result] of results) {
    byType[result.type].push({ cluster, result })
  }
  function top(type: TerrainType) {
    const list = byType[type]
    if (list.length === 0) return null
    return list.sort((a, b) => b.result.score - a.result.score)[0] ?? null
  }
  return {
    forest: top('forest'),
    swamp: top('swamp'),
    ember: top('ember'),
    sleep: top('sleep'),
    middleCount: byType.middle.length,
  }
}

/** UI 文案 · 兴趣地图角标名（保留生命状态语义）*/
export const TERRAIN_LABELS_MAP: Record<TerrainType, string> = {
  forest: '活跃',
  ember: '萌芽中',
  swamp: '积压中',
  sleep: '休眠',
  middle: '',
}

/** UI 文案 · §3 隐性自我地形名（保留隐喻语义） */
export const TERRAIN_LABELS_PROFILE: Record<TerrainType, string> = {
  forest: '真实热情之林',
  ember: '新冒火苗',
  swamp: '焦虑沼泽',
  sleep: '沉睡之地',
  middle: '',
}

/** 角标颜色（跟旧 InterestState 保持视觉一致）*/
export const TERRAIN_COLORS: Record<TerrainType, string> = {
  forest: '#5AB870',   // 绿
  ember: '#9CA3D4',    // lav
  swamp: '#B89098',    // text-lt 灰红
  sleep: '#D9706A',    // rose
  middle: '',
}
