// 统一的 SVG sprite 引用组件
// Sprite 在两个入口 HTML 顶部内联（popup/index.html、options/index.html）
// 通过 `color` 控制颜色（currentColor），通过 `size` 控制尺寸（默认 16）

export type ChordIconName = 'keep' | 'used' | 'sakura' | 'article' | 'check-sm'

interface ChordIconProps {
  name: ChordIconName
  size?: number
  color?: string
  class?: string
}

export function ChordIcon({ name, size = 16, color = 'currentColor', class: cls = '' }: ChordIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={`color:${color};flex-shrink:0`}
      class={`chord-icon ${cls}`.trim()}
      aria-hidden="true"
    >
      <use href={`#icon-${name}`} />
    </svg>
  )
}
