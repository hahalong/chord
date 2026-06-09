// Favicon 图片 · 加载失败自动 fallback 到 #icon-article SVG
//
// 背景 (v3.1.30 修破图 bug)：
// 老 getFaviconUrl 直接拼 `${origin}/favicon.ico`，但大量网站 favicon 不在这个路径
//   (用 .svg / .png / CDN 路径 / WordPress 主题路径 / 干脆 404)
// → 浏览器画破图占位符，用户看到一堆破图
//
// 之前 4 处 img tag 只在 `!it.favicon` 时 fallback 到 article SVG，
// 但 img 加载失败 (404/CORS/格式不识别) 不触发那个分支，破图就露出来了
//
// 这个组件用 onError 切到 SVG，统一 fallback 路径
// 不引入任何第三方 favicon service (尊重默认 storageMode='local' 隐私承诺)

import { useState } from 'preact/hooks'

interface Props {
  src?: string | null
  size?: number          // px · 默认 16
  rounded?: number       // border-radius px · 默认 3
  fallbackColor?: string // article SVG 颜色 · 默认 --text-lt
  fallbackScale?: number // fallback svg 相对 size 的缩放 · 默认 1（保持等大）
  class?: string
}

export function Favicon({
  src,
  size = 16,
  rounded = 3,
  fallbackColor = 'var(--text-lt)',
  fallbackScale = 1,
  class: className,
}: Props) {
  const [failed, setFailed] = useState(false)

  if (failed || !src) {
    const svgSize = Math.max(10, Math.round(size * fallbackScale))
    return (
      <svg
        width={svgSize}
        height={svgSize}
        viewBox="0 0 16 16"
        fill="none"
        class={className}
        style={`color:${fallbackColor};display:block`}
      >
        <use href="#icon-article" />
      </svg>
    )
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      class={className}
      style={`border-radius:${rounded}px;object-fit:contain;display:block`}
      onError={() => setFailed(true)}
    />
  )
}
