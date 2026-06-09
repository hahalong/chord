// 轻量 nanoid 替代：不引入外部依赖，纯 crypto API
export function nanoid(size = 21): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  return Array.from(bytes, (b) => chars[b & 63]).join('')
}

export function generateUserId(): string {
  return `u_${nanoid(16)}`
}

export function generateDeviceId(): string {
  return `d_${nanoid(16)}`
}
