// 「派上用场了？」共用 chip 行：用户点了「用过了」后展示
// - 4 个预设 chip + ＋自己说 + 输入框
// - chip 单选；可空（用户可不选就跳下一条）
// - 内部维护 selection 与 input；通过 onChange 把变化通知给宿主
//
// 用在两处：
//   - Popup DailyResuface（已接入）
//   - Options Process 处理界面（Batch 3 接入）

import { signal } from '@preact/signals'

export const USED_CHIPS = ['启发思路', '实际用到了', '分享出去了', '仅此一读，够了'] as const

interface Props {
  itemId: string
  /** chip 或自定义文字变化时通知宿主。chip=null 表示取消，customNote=空字符串表示清空。 */
  onChange?: (state: { chip: string | null; customNote: string }) => void
  /** 入场动画样式 class 选择。默认 'chips-area' 与现有 Popup 样式一致。 */
  variant?: 'popup' | 'process'
}

export function UsedChips({ itemId, onChange, variant = 'popup' }: Props) {
  // 每个 itemId 独立 signal，避免不同 item 间状态串扰
  const state = getStateForItem(itemId)
  const wrapClass = variant === 'process' ? 'chips-area chips-area-process' : 'chips-area'

  return (
    <div class={wrapClass}>
      <p class="chips-label">派上用场了？</p>
      <div class="chips-row">
        {USED_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            class={`chip ${state.chipSelected.value === c ? 'chip-active' : ''}`}
            onClick={() => {
              state.chipSelected.value = state.chipSelected.value === c ? null : c
              // 通过 SW 桥接事件日志，宿主组件不需要关心这个
              chrome.runtime.sendMessage({
                type: 'RECORD_CHIP',
                itemId,
                chip: state.chipSelected.value,
              })
              onChange?.({ chip: state.chipSelected.value, customNote: state.customNote.value })
            }}
          >{c}</button>
        ))}
        <button
          type="button"
          class={`chip ${state.showCustomInput.value ? 'chip-active' : ''}`}
          onClick={() => { state.showCustomInput.value = !state.showCustomInput.value }}
        >＋ 自己说</button>
      </div>
      {state.showCustomInput.value && (
        <input
          class="custom-input"
          placeholder="随便写，一句话就好"
          value={state.customNote.value}
          onInput={(e) => {
            state.customNote.value = (e.target as HTMLInputElement).value
            onChange?.({ chip: state.chipSelected.value, customNote: state.customNote.value })
          }}
        />
      )}
    </div>
  )
}

// ─── 内部 state 管理：按 itemId 缓存 signals ───────────────────────

interface ChipState {
  chipSelected: ReturnType<typeof signal<string | null>>
  customNote: ReturnType<typeof signal<string>>
  showCustomInput: ReturnType<typeof signal<boolean>>
}

const stateByItem = new Map<string, ChipState>()

function getStateForItem(itemId: string): ChipState {
  let s = stateByItem.get(itemId)
  if (!s) {
    s = {
      chipSelected: signal<string | null>(null),
      customNote: signal(''),
      showCustomInput: signal(false),
    }
    stateByItem.set(itemId, s)
  }
  return s
}

/** 清理特定 item 的本地状态（item 处理完跳走时调用） */
export function clearChipState(itemId: string) {
  stateByItem.delete(itemId)
}
