/**
 * Storage migrations.
 *
 * 每个 migration 函数是幂等的：可以多次调用，已迁移过的数据不会被重复处理。
 * 调用方（通常是 sw.ts）通过 chrome.storage flag 防止重复执行——但即使不防，
 * 这些 migration 也不会破坏数据。
 *
 * 详见 Chord_二向决策_实施方案.md §1
 */

import type { StorageAdapter, Item, IntentSignal, SaveIntentSource } from '@chord/types'

export interface MigrationResult {
  migratedCount: number
  totalItems: number
}

/**
 * v2 迁移：把所有 status='used' 的 item 改为 status='kept'，并打上 migratedFromUsed=true 标记。
 *
 * 设计：
 * - 二向决策（CR-XXX）只剩 留下来 / 放手，不再有「用过了」状态
 * - 老数据「用过了」 = 用户当时表达"我跟这条有过有意义的交互"——这种意图最接近"还想留着"
 * - 所以 used → kept，但留 migratedFromUsed=true 标记
 * - 下次用户对这条点「放手」时，ReleaseReasonPredictor 会预填 reason='used'（保留语义记忆）
 *
 * 幂等：再次调用时已是 kept 的 item 不会被处理；只挑 status='used' 的处理。
 * 性能：1000 条全表扫一遍 + 局部 putItem，预期 < 200ms。
 */
export async function migrateUsedToKept(adapter: StorageAdapter): Promise<MigrationResult> {
  const all = await adapter.getItems()
  // P1-27 · 改 atomic batch：原先 N×putItem 触发 N×onChanged，配合 P0-5 hydrate 后 listener 每次 getItems → O(N²) IO
  //         改成 map → 一次性 putItems，只触发 1 次 onChanged
  let migratedCount = 0
  const next = all.map((i) => {
    if ((i.status as string) === 'used') {
      migratedCount++
      return { ...i, status: 'kept' as const, migratedFromUsed: true }
    }
    return i
  })
  if (migratedCount > 0) {
    await adapter.putItems(next)
  }

  return {
    migratedCount,
    totalItems: all.length,
  }
}

/**
 * SaveIntent v2 Sprint B.1 迁移：把老 item.saveIntent (单标签) 包装成 saveIntents (多标签)
 *
 * 设计：
 * - 老 item 只有 saveIntent / saveIntentSource，没 saveIntents
 * - 迁移：用单标签构造 [{intent, confidence, source}]，confidence 取决于 source（rule=1.0, ai=0.7）
 * - 新代码读 saveIntents[0]，老代码读 saveIntent，两者保持一致
 *
 * 幂等：已有 saveIntents 的 item 不重复处理
 */
export async function migrateSaveIntentsV2(adapter: StorageAdapter): Promise<MigrationResult> {
  const all = await adapter.getItems()
  // P1-27 · atomic batch（同 migrateUsedToKept）
  let migratedCount = 0
  const next = all.map((i) => {
    if (i.saveIntent && !i.saveIntents) {
      migratedCount++
      const src: SaveIntentSource = i.saveIntentSource ?? 'rule'
      const confidence = src === 'rule' ? 1.0 : src === 'ai' ? 0.7 : 0.5
      const signal: IntentSignal = { intent: i.saveIntent, confidence, source: src }
      return { ...i, saveIntents: [signal] }
    }
    return i
  })
  if (migratedCount > 0) {
    await adapter.putItems(next)
  }

  return {
    migratedCount,
    totalItems: all.length,
  }
}
