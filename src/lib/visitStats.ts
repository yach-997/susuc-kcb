/** 累计 = 5836 + 每日虚增(含今天, 20–50) + 每次刷新真实 +1 */

/** 锚点：虚增起始日前的基数 */
export const VISIT_BASE = 5836

/** 虚增起始日（上海日历）；从当天起就计入当天的 20–50 */
export const VISIT_FAKE_START = '2026-08-12'

/** 每日虚增 20–50，不规律循环 */
export const VISIT_FAKE_PATTERN = [
  33, 41, 28, 35, 47, 22, 39, 31, 45, 26, 38, 50, 21, 33, 44, 29, 42, 36, 48,
  24, 40, 27, 46, 32, 49, 25, 37, 30, 43, 34, 20,
] as const

export const VISIT_CACHE_TOTAL_KEY = 'susuc-visit-total-v5'
export const VISIT_CACHE_REAL_KEY = 'susuc-visit-real-v5'
export const VISIT_CACHE_TODAY_KEY = 'susuc-visit-today-v5'

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function parseLocalDate(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number)
  return new Date(y, m - 1, day)
}

/**
 * 含今天：起始日当天 = 1（加 pattern[0]）。
 * 例：8/12 起 → 当天 5836+33；次日再加 pattern[1]。
 */
export function daysInclusiveSinceStart(
  startIso: string = VISIT_FAKE_START,
  now: Date = new Date(),
): number {
  const start = startOfLocalDay(parseLocalDate(startIso))
  const today = startOfLocalDay(now)
  if (today < start) return 0
  const diff = Math.floor((today.getTime() - start.getTime()) / 86_400_000)
  return diff + 1
}

/** 不规律虚增累计（不含基础数、不含刷新次数） */
export function fakeVisitGrowth(
  daysInclusive: number = daysInclusiveSinceStart(),
): number {
  let sum = 0
  const n = VISIT_FAKE_PATTERN.length
  for (let i = 0; i < daysInclusive; i++) {
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

/** 累计展示 = 锚点 + 虚增(含今天) + 真实刷新次数 */
export function computeVisitTotal(
  realTotal: number,
  now: Date = new Date(),
): number {
  return (
    VISIT_BASE +
    fakeVisitGrowth(daysInclusiveSinceStart(VISIT_FAKE_START, now)) +
    Math.max(0, Math.floor(realTotal))
  )
}
