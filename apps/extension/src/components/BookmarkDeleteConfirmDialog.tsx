/**
 * 「也从 Chrome 书签删除吗？」首次询问 dialog（v2 二向决策）
 *
 * 触发：用户首次放手时（settings.releaseAlsoDeletesBookmark === 'ask'）
 * 用户选择后写入 settings，记住偏好，后续放手不再问。
 *
 * 详见 Chord_二向决策_实施方案.md §5
 */

export interface BookmarkDeleteConfirmDialogProps {
  /** 用户选择"删除" → 触发删 Chrome 书签 + 写入 settings 'always' */
  onAlwaysDelete: () => void
  /** 用户选择"保留" → 不删 Chrome 书签 + 写入 settings 'never' */
  onNeverDelete: () => void
  /** 一次性决定不记住（仅此次）— 可选，不传则隐藏此按钮 */
  onJustThisOnce?: { delete: boolean; cb: () => void }
}

export function BookmarkDeleteConfirmDialog({
  onAlwaysDelete,
  onNeverDelete,
  onJustThisOnce,
}: BookmarkDeleteConfirmDialogProps) {
  return (
    <div class="bdcd-overlay">
      <div class="bdcd-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="bdcd-eyebrow">一个一次性决定</div>
        <h3 class="bdcd-title">放手时也从 Chrome 书签删除吗？</h3>
        <p class="bdcd-body">
          「放手」对你来说意味着什么？<br />
          以后所有放手默认按此偏好执行（随时可在「设置」里改）。
        </p>

        <div class="bdcd-options">
          <button class="bdcd-opt bdcd-opt-strong" onClick={onAlwaysDelete}>
            <div class="bdcd-opt-title">彻底告别</div>
            <div class="bdcd-opt-sub">也从 Chrome 书签删除</div>
          </button>
          <button class="bdcd-opt" onClick={onNeverDelete}>
            <div class="bdcd-opt-title">只从书房移出</div>
            <div class="bdcd-opt-sub">Chrome 书签保留</div>
          </button>
        </div>

        {onJustThisOnce && (
          <button class="bdcd-once" onClick={onJustThisOnce.cb}>
            仅此一次{onJustThisOnce.delete ? '删除' : '保留'}（不改默认）
          </button>
        )}
      </div>
    </div>
  )
}
