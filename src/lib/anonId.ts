/** 把 visitor_id 稳定映射为可读匿名号，同一设备始终同号 */
export function anonVisitorLabel(visitorId: string | null | undefined): string {
  if (!visitorId || !visitorId.trim()) return '未知访客'
  let h = 2166136261
  for (let i = 0; i < visitorId.length; i++) {
    h ^= visitorId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const code = (h >>> 0).toString(16).padStart(8, '0').slice(-4).toUpperCase()
  return `访客·${code}`
}
