/**
 * 批量放手 dialog（v2 二向决策）
 *
 * 三档模式（按数量自动切换）：
 * - 1-15 条：列表展开 + 每条系统预填 reason + 用户可单独改
 * - 16-100 条：统一模式（一个 reason 应用全部）+ "我要一条条选" 切换
 * - 100+ 条：二次确认 → 强制统一模式（不许逐条）
 *
 * 详见 Chord_二向决策_实施方案.md §4
 */

import { useState } from 'preact/hooks'
import type { Item, ReleaseReason } from '@chord/types'
import { RELEASE_REASONS } from './ReleaseReasonDialog.js'

export interface BatchReleaseItem {
  item: Item
  /** 系统预填的 reason，可被用户覆盖 */
  predictedReason: ReleaseReason | null
}

export interface BatchReleaseDialogProps {
  items: BatchReleaseItem[]
  /** 用户确认放手；inputs 是每条 item 最终的 reason */
  onConfirm: (inputs: { itemId: string; reason?: ReleaseReason; reasonCustom?: string }[]) => void
  onCancel: () => void
}

type Mode = 'expand' | 'unified' | 'forced_unified'
type Phase = 'main' | 'oversize_confirm' | 'unified_custom_input'

function chooseMode(count: number): Mode {
  if (count <= 15) return 'expand'
  if (count <= 100) return 'unified'
  return 'forced_unified'
}

export function BatchReleaseDialog({ items, onConfirm, onCancel }: BatchReleaseDialogProps) {
  const total = items.length
  const initialMode = chooseMode(total)
  const [mode, setMode] = useState<Mode>(initialMode)
  // 100+ 条强制先走 oversize 确认页
  const [phase, setPhase] = useState<Phase>(initialMode === 'forced_unified' ? 'oversize_confirm' : 'main')
  // 列表展开模式：每条 item 的当前 reason 选择
  const [perItemReason, setPerItemReason] = useState<Map<string, ReleaseReason | null>>(
    new Map(items.map((bi) => [bi.item.id, bi.predictedReason ?? null])),
  )
  // 统一模式：选中的 reason
  const [unifiedReason, setUnifiedReason] = useState<ReleaseReason | null>(null)
  const [unifiedCustomText, setUnifiedCustomText] = useState('')

  function updatePerItem(itemId: string, reason: ReleaseReason | null) {
    setPerItemReason((prev) => {
      const next = new Map(prev)
      next.set(itemId, reason)
      return next
    })
  }

  function submitExpand() {
    const inputs = items.map((bi) => ({
      itemId: bi.item.id,
      reason: perItemReason.get(bi.item.id) ?? undefined,
    }))
    onConfirm(inputs)
  }

  function submitUnified(reason: ReleaseReason, customText?: string) {
    const inputs = items.map((bi) => ({
      itemId: bi.item.id,
      reason,
      ...(reason === 'custom' && customText ? { reasonCustom: customText } : {}),
    }))
    onConfirm(inputs)
  }

  function submitNoReason() {
    onConfirm(items.map((bi) => ({ itemId: bi.item.id })))
  }

  // ──── Oversize 二次确认页 ────
  if (phase === 'oversize_confirm') {
    return (
      <div class="brd-overlay" onClick={onCancel}>
        <div class="brd-dialog brd-dialog-narrow" onClick={(e) => e.stopPropagation()}>
          <div class="brd-eyebrow">慢一下</div>
          <h3 class="brd-title">你正要放手 {total} 条收藏</h3>
          <p class="brd-body">这是个大动作 — 确定吗？</p>
          <div class="brd-actions">
            <button class="brd-cancel" onClick={onCancel}>取消，让我再想想</button>
            <button class="brd-confirm" onClick={() => setPhase('main')}>我想清楚了，继续</button>
          </div>
        </div>
      </div>
    )
  }

  // ──── 统一模式自由文本输入页 ────
  if (phase === 'unified_custom_input') {
    return (
      <div class="brd-overlay" onClick={onCancel}>
        <div class="brd-dialog brd-dialog-narrow" onClick={(e) => e.stopPropagation()}>
          <h3 class="brd-title">说一句</h3>
          <p class="brd-body">这一批 {total} 条都会用这句话作为放手原因。</p>
          <input
            class="brd-custom-input"
            type="text"
            placeholder="一句话说说（30 字内）"
            maxLength={30}
            autoFocus
            value={unifiedCustomText}
            onInput={(e) => setUnifiedCustomText((e.currentTarget as HTMLInputElement).value)}
          />
          <div class="brd-actions">
            <button class="brd-cancel" onClick={() => setPhase('main')}>返回</button>
            <button
              class="brd-confirm"
              disabled={!unifiedCustomText.trim()}
              onClick={() => submitUnified('custom', unifiedCustomText.trim())}
            >
              放手 {total} 条 →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ──── 主页面：根据 mode 渲染 ────
  return (
    <div class="brd-overlay" onClick={onCancel}>
      <div class="brd-dialog" onClick={(e) => e.stopPropagation()}>
        {mode === 'expand' && (
          <>
            <div class="brd-eyebrow">一次放手 {total} 条</div>
            <h3 class="brd-title">系统帮你想了原因，确认下</h3>
            <div class="brd-list">
              {items.map((bi) => (
                <div key={bi.item.id} class="brd-row">
                  <div class="brd-row-title" title={bi.item.title}>
                    {bi.item.title.length > 28 ? bi.item.title.slice(0, 28) + '…' : bi.item.title}
                  </div>
                  <select
                    class="brd-row-select"
                    value={perItemReason.get(bi.item.id) ?? ''}
                    onChange={(e) => {
                      const v = (e.currentTarget as HTMLSelectElement).value
                      updatePerItem(bi.item.id, v ? (v as ReleaseReason) : null)
                    }}
                  >
                    <option value="">— 不说原因 —</option>
                    {RELEASE_REASONS.map((r) => (
                      <option key={r.code} value={r.code}>{r.emoji} {r.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div class="brd-actions">
              <button class="brd-skip" onClick={submitNoReason}>全部跳过原因</button>
              <div class="brd-actions-right">
                <button class="brd-cancel" onClick={onCancel}>取消</button>
                <button class="brd-confirm" onClick={submitExpand}>确认放手 {total} 条 →</button>
              </div>
            </div>
          </>
        )}

        {(mode === 'unified' || mode === 'forced_unified') && (
          <>
            <div class="brd-eyebrow">一次放手 {total} 条</div>
            <h3 class="brd-title">选个原因应用到全部？</h3>
            <div class="brd-grid">
              {RELEASE_REASONS.map((r) => (
                <button
                  key={r.code}
                  class={`brd-chip ${unifiedReason === r.code ? 'brd-chip-active' : ''}`}
                  onClick={() => {
                    if (r.code === 'custom') {
                      setPhase('unified_custom_input')
                    } else {
                      setUnifiedReason(r.code)
                      submitUnified(r.code)
                    }
                  }}
                >
                  <span class="brd-chip-emoji">{r.emoji}</span>
                  <span class="brd-chip-label">都{r.label.startsWith('已') ? r.label : r.label}</span>
                </button>
              ))}
            </div>
            <div class="brd-separator">— 或者 —</div>
            <div class="brd-actions">
              {mode === 'unified' && (
                <button class="brd-switch" onClick={() => setMode('expand')}>
                  我要一条条选（{total} 条）
                </button>
              )}
              <div class="brd-actions-right">
                <button class="brd-skip" onClick={submitNoReason}>跳过原因，直接放手</button>
                <button class="brd-cancel" onClick={onCancel}>取消</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
