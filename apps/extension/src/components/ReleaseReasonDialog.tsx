/**
 * 单条放手原因选择 dialog（v2 二向决策）
 *
 * 用户点「放手」按钮 → 弹此 dialog → 选 reason → 确认 → 父级触发实际 release
 *
 * 设计：
 * - 6 个 reason chip + 「跳过原因」+ 「自己说」自由文本
 * - 系统可预填 reason（ReleaseReasonPredictor 推断），高亮显示
 * - 用户可改 / 可跳过
 * - 详见 Chord_二向决策_实施方案.md §2
 */

import { useState } from 'preact/hooks'
import type { ReleaseReason } from '@chord/types'

export const RELEASE_REASONS: { code: ReleaseReason; emoji: string; label: string }[] = [
  { code: 'used',           emoji: '✓',  label: '已经用过了' },
  { code: 'not_interested', emoji: '💭', label: '不感兴趣了' },
  { code: 'misjudged',      emoji: '🤷', label: '当时存错了' },
  { code: 'replaced',       emoji: '✨', label: '找到更好的了' },
  { code: 'no_time',        emoji: '⏰', label: '没时间看了' },
  { code: 'custom',         emoji: '✏',  label: '自己说' },
]

export interface ReleaseReasonDialogProps {
  /** item 标题（仅展示用）*/
  itemTitle: string
  /** 系统预填的 reason（可空），高亮选中 */
  predictedReason?: ReleaseReason | null
  /** 用户确认时回调 */
  onConfirm: (reason: ReleaseReason | undefined, customText?: string) => void
  /** 取消（不放手）*/
  onCancel: () => void
}

export function ReleaseReasonDialog({
  itemTitle,
  predictedReason,
  onConfirm,
  onCancel,
}: ReleaseReasonDialogProps) {
  const [selected, setSelected] = useState<ReleaseReason | null>(predictedReason ?? null)
  const [customText, setCustomText] = useState('')

  function handleConfirm() {
    if (selected === 'custom' && !customText.trim()) {
      // custom 必须有文本，否则当作无 reason
      onConfirm(undefined)
      return
    }
    onConfirm(selected ?? undefined, selected === 'custom' ? customText.trim() : undefined)
  }

  function handleSkip() {
    onConfirm(undefined)
  }

  return (
    <div class="rrd-overlay" onClick={onCancel}>
      <div class="rrd-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="rrd-eyebrow">在放手之前</div>
        <h3 class="rrd-title">为什么放手？</h3>
        <div class="rrd-subtitle" title={itemTitle}>
          「{itemTitle.length > 36 ? itemTitle.slice(0, 36) + '…' : itemTitle}」
        </div>
        {predictedReason && (
          <div class="rrd-hint">
            <span style="font-size:11px;color:var(--text-lt)">系统帮你想了一下，确认或修改</span>
          </div>
        )}

        <div class="rrd-grid">
          {RELEASE_REASONS.map((r) => (
            <button
              key={r.code}
              class={`rrd-chip ${selected === r.code ? 'rrd-chip-active' : ''}`}
              onClick={() => setSelected(r.code)}
            >
              <span class="rrd-chip-emoji">{r.emoji}</span>
              <span class="rrd-chip-label">{r.label}</span>
            </button>
          ))}
        </div>

        {selected === 'custom' && (
          <div class="rrd-custom-wrap">
            <input
              class="rrd-custom-input"
              type="text"
              placeholder="一句话说说（30 字内）"
              maxLength={30}
              value={customText}
              autoFocus
              onInput={(e) => setCustomText((e.currentTarget as HTMLInputElement).value)}
            />
          </div>
        )}

        <div class="rrd-actions">
          <button class="rrd-skip" onClick={handleSkip}>
            跳过，直接放手
          </button>
          <div class="rrd-actions-right">
            <button class="rrd-cancel" onClick={onCancel}>
              取消
            </button>
            <button class="rrd-confirm" onClick={handleConfirm}>
              放手 →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
