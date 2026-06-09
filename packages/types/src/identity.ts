// 三维身份系统类型定义
// 详见 产品文档/Chord_身份系统设计.md
//
// 设计哲学：
//   每个用户同时被 3 个维度的身份描述（消费风格 / 心境 / 注意力半径）
//   3 张身份卡在 Profile 顶部叠加显示（A 堆卡视觉）
//   组合空间 5 × 4 × 3 = 60 种独特画像（实际约 20-30 个有意义组合）

import type { ConsumptionStyle } from './analytics.js'

/** 三个维度 */
export type IdentityDimension = 'consumption' | 'mindset' | 'radius'

/**
 * mindset 维度的 6 个身份（当下心境，4-8 周尺度）
 * - explorer：多方向涌现，求知爆发（开新主题）
 * - deepener：保存爆发但在已有主题上加深（不开新方向，多线深挖）
 * - seeker：单一主题深挖，访问集中
 * - returner：主动处理 + 放手老收藏，清理过去
 * - settler：进入平静，无新主题，收敛内敛
 * - dormant：曾活跃，近 30 天几乎不保存——被生活带走（v3.1 新增）
 *
 * 设计文档原版只有 4 个，DEEPENER 在 2026-05-21 实施时发现真实用户数据
 * 经常落在"保存爆发但 Jaccard 高、主题集合稳定"这种夹缝里——4 个都不命中。
 * v3.1 又加 DORMANT 覆盖"曾活跃现已离开"状态（跟 SETTLER 区分：SETTLER 主动慢下来仍在用，DORMANT 已离开）。
 */
export type MindsetIdentity = 'explorer' | 'deepener' | 'seeker' | 'returner' | 'settler' | 'dormant'

/**
 * radius 维度的 3 个身份（注意力半径，季度/90 天尺度）
 * - specialist：深耕少数领域（max cluster > 40%）
 * - generalist：杂食广博（max < 25%、cluster > 10）
 * - switcher：主题周期短，热点驱动（Jaccard < 0.3）
 */
export type RadiusIdentity = 'specialist' | 'generalist' | 'switcher'

/** 15 身份的并集 ID（v3.1: 消费 6 + 心境 6 + 半径 3）*/
export type IdentityId = ConsumptionStyle | MindsetIdentity | RadiusIdentity

/** 置信度档位（low/medium/high）—— UI 用来决定是否显示 "也有点像" 这种弱标注 */
export type IdentityConfidenceLevel = 'low' | 'medium' | 'high'

/**
 * 单张身份卡——3 维度每维度产出 1 张
 * Profile UI 把同一用户的 3 张卡叠加显示
 */
export interface IdentityCard {
  /** 哪个维度 */
  dimension: IdentityDimension
  /** 身份 ID（小写如 'hoarder' / 'explorer' / 'generalist'）*/
  id: IdentityId
  /** 用户看的中文标签，如 "收藏家"/"探索者"/"广博派" */
  name: string
  /** 英文大写身份名，如 "HOARDER"/"EXPLORER"/"GENERALIST" */
  enName: string
  /** 一句话画像，活人感的 claim（"你像个不会过期的图书馆..."）*/
  claim: string
  /** 数据支撑文案，如 "487 条 · 处理率 1.8% · 30 天新增 42 条" */
  evidence: string
  /** 置信度 0-1（数据足且信号显著 = 高）*/
  confidence: number
  /** 置信度档位 */
  confidenceLevel: IdentityConfidenceLevel
  /**
   * v3.1 新增 · 极端度 0-1（用户在该维度有多突出）
   *
   * 跟 confidence 拆分:
   *   - confidence: 算法把握 → 决定"要不要显示卡 / 标'还看不清'"
   *   - extremity:  用户突出度 → 决定"显示顺序"（主卡 = max extremity）
   *
   * 计算方式: (user_signal - threshold_min) / (threshold_max - threshold_min)
   *   - 刚踩触发线 → 0
   *   - 饱和极端 → 1
   *   - clip to [0, 1]
   *
   * 详见 产品文档/Chord_隐性自我v3.1_主画像算法设计.md §5.E
   */
  extremity: number
}

/**
 * 计算输入：除 items 外可选注入 visitCounts（Chrome history 推断的访问频率）
 * 设计为可选——visitCount 没给时部分身份用 fallback 数据判定（如 saved count）
 */
export interface IdentityComputeInput {
  items: import('./item.js').Item[]
  /** itemId → 90 天访问次数；可选 */
  visitCounts?: Map<string, number>
  /** 当前时间戳，默认 Date.now()；测试可注入 */
  now?: number
}
