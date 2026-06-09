/**
 * MilestoneService —— 仪式时刻通知
 *
 * 极少触发，每个 milestone 一辈子只 fire 1 次。
 * fired log 持久化在 chrome.storage（即使用户清空数据 milestone 不重置，避免恶意刷）。
 *
 * 详见 plan: 五层「主动出现」体系 §Layer 3.5
 *
 * 7 种 milestone（plan §Layer 3.5 表格）：
 *   items_100   收藏达到 100 条
 *   items_500   收藏达到 500 条
 *   items_1000  收藏达到 1000 条
 *   processed_100  处理（kept/released）达到 100 条
 *   streak_7    streak 达到 7 天
 *   streak_30   streak 达到 30 天
 *   streak_100  streak 达到 100 天
 */

export type MilestoneId =
  | 'items_100' | 'items_500' | 'items_1000'
  | 'processed_100'
  | 'streak_7' | 'streak_30' | 'streak_100'

export interface MilestoneFiredLog {
  [id: string]: number   // milestone id → timestamp
}

export interface MilestoneNotification {
  id: MilestoneId
  title: string
  message: string
  /** 点击通知后跳转的 hash 路径，如 '#terrain'，'#dashboard' */
  ctaPath?: string
}

/**
 * 文案池
 */
const MILESTONES: Record<MilestoneId, Omit<MilestoneNotification, 'id'>> = {
  items_100: {
    title: '书房里第 100 条了 🌸',
    message: '感谢你信任 Chord 帮你保管这些念头',
    ctaPath: '#dashboard',
  },
  items_500: {
    title: '500 条收藏 —— 这是一座小图书馆',
    message: '要不要花一下午整理一下兴趣地形？看看你真正在意什么',
    ctaPath: '#terrain',
  },
  items_1000: {
    title: '1000 条 · 你是真正的探索者',
    message: '这份收藏密度告诉我们：你对世界保持着深度好奇',
    ctaPath: '#profile',
  },
  processed_100: {
    title: '已处理 100 条 ✓',
    message: '不是每个人都能跟 100 条收藏认真对话过。你做到了',
    ctaPath: '#profile',
  },
  streak_7: {
    title: 'streak 7 天 🌸',
    message: '一周了。一个习惯正在长出来',
    ctaPath: '#dashboard',
  },
  streak_30: {
    title: '30 天连续 · 真稳',
    message: '这是真实的仪式感。回响成了你日常的一部分',
    ctaPath: '#profile',
  },
  streak_100: {
    title: '100 天 · 这是承诺',
    message: '回响成了你跟自己的对话。我们很荣幸陪伴你',
    ctaPath: '#profile',
  },
}

/**
 * 计算应该 fire 哪些 milestone（一次可能多个，比如同时达到 items_500 + streak_30）
 *
 * 注意：从 prev → current 的"跨越"判定
 * - items_500 触发条件：prevTotal < 500 && currentTotal >= 500
 *
 * 调用方应该在 saveItem / processItem / streakUpdate 之后立刻调用此函数，
 * 把变化前后的数字都传入。
 */
export interface MilestoneInput {
  prevItemsTotal?: number
  currentItemsTotal?: number
  prevProcessed?: number
  currentProcessed?: number
  prevStreak?: number
  currentStreak?: number
}

export function evaluate(input: MilestoneInput, fired: MilestoneFiredLog): MilestoneNotification[] {
  const ms: MilestoneNotification[] = []

  // items 三档
  for (const [n, id] of [
    [100, 'items_100'],
    [500, 'items_500'],
    [1000, 'items_1000'],
  ] as [number, MilestoneId][]) {
    if (
      input.currentItemsTotal !== undefined &&
      input.currentItemsTotal >= n &&
      (input.prevItemsTotal ?? 0) < n &&
      !fired[id]
    ) {
      ms.push({ id, ...MILESTONES[id] })
    }
  }

  // processed 100
  if (
    input.currentProcessed !== undefined &&
    input.currentProcessed >= 100 &&
    (input.prevProcessed ?? 0) < 100 &&
    !fired['processed_100']
  ) {
    ms.push({ id: 'processed_100', ...MILESTONES['processed_100'] })
  }

  // streak 三档
  for (const [n, id] of [
    [7, 'streak_7'],
    [30, 'streak_30'],
    [100, 'streak_100'],
  ] as [number, MilestoneId][]) {
    if (
      input.currentStreak !== undefined &&
      input.currentStreak >= n &&
      (input.prevStreak ?? 0) < n &&
      !fired[id]
    ) {
      ms.push({ id, ...MILESTONES[id] })
    }
  }

  return ms
}

/** 记录已 fired，不可变 */
export function recordFired(fired: MilestoneFiredLog, id: MilestoneId, now: number = Date.now()): MilestoneFiredLog {
  return { ...fired, [id]: now }
}
