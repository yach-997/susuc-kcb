/** 累计访问：锚点 + 按日虚增(20–50) + Supabase 真实独立访客天数 */

/** 2026-08-12 起展示锚点（当天虚增为 0） */
export const VISIT_BASE = 5836

/** 虚增起始日（上海日历）；当天不算虚增，次日开始加 */
export const VISIT_FAKE_START = '2026-08-12'

/**
 * 每日虚增 20–50，不规律循环。
 * 自起始日次日起按序累加。
 */
export const VISIT_FAKE_PATTERN = [
  23, 41, 28, 35, 47, 22, 39, 31, 45, 26, 38, 50, 21, 33, 44, 29, 42, 36, 48,
  24, 40, 27, 46, 32, 49, 25, 37, 30, 43, 34, 20,
] as const

export const VISIT_CACHE_TOTAL_KEY = 'susuc-visit-total-v3'
export const VISIT_CACHE_REAL_KEY = 'susuc-visit-real-v3'
export const VISIT_CACHE_TODAY_KEY = 'susuc-visit-today-v3'

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function parseLocalDate(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number)
  return new Date(y, m - 1, day)
}

/** 自起始日到今天已过去的整天数（今天尚未计入虚增） */
export function daysElapsedSinceStart(
  startIso: string = VISIT_FAKE_START,
  now: Date = new Date(),
): number {
  const start = startOfLocalDay(parseLocalDate(startIso))
  const today = startOfLocalDay(now)
  const diff = Math.floor((today.getTime() - start.getTime()) / 86_400_000)
  return Math.max(0, diff)
}

/** 不规律虚增累计（不含基础数、不含真实访问） */
export function fakeVisitGrowth(
  days: number = daysElapsedSinceStart(),
): number {
  let sum = 0
  const n = VISIT_FAKE_PATTERN.length
  for (let i = 0; i < days; i++) {
    sum += VISIT_FAKE_PATTERN[i % n]!
  }
  return sum
}

export function formatVisitCount(n: number): string {
  return n.toLocaleString('zh-CN')
}

export function readStoredNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

export function writeStoredNumber(key: string, n: number) {
  try {
    localStorage.setItem(key, String(n))
  } catch {
    /* ignore */
  }
}

export function computeVisitTotal(realTotal: number, now: Date = new Date()): number {
  return VISIT_BASE + fakeVisitGrowth(daysElapsedSinceStart(VISIT_FAKE_START, now)) + Math.max(0, Math.floor(realTotal))
}
