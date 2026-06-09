export function toDateString(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10) // 'YYYY-MM-DD'
}

export function daysSince(ts: number): number {
  return Math.floor((Date.now() - ts) / 86_400_000)
}

export function monthsSince(ts: number): number {
  return Math.floor(daysSince(ts) / 30)
}

// 计算下一次指定时间的 Date
export function nextOccurrenceOf(hour: number, minute: number): Date {
  const now = new Date()
  const next = new Date(now)
  next.setHours(hour, minute, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  return next
}

export function isSameDay(ts1: number, ts2: number): boolean {
  return toDateString(ts1) === toDateString(ts2)
}
