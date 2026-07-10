import type { Course, FreshnessInfo, TimetablePayload, WeekParity } from '../types'

const STORAGE_KEY = 'susuc-timetable-v1'
const CHANNEL_URL_KEY = 'susuc-channel-url'

export const DEFAULT_CHANNEL_URL = 'https://t.me/'

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const

export const SECTION_TIMES: Record<number, string> = {
  1: '08:00',
  2: '08:50',
  3: '10:00',
  4: '10:50',
  5: '14:00',
  6: '14:50',
  7: '16:00',
  8: '16:50',
  9: '19:00',
  10: '19:50',
  11: '20:40',
  12: '21:30',
}

/** 稳定配色：按课程名哈希 */
const PALETTE = [
  '#0d6e5a',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#c2410c',
  '#0891b2',
  '#4d7c0f',
  '#b45309',
  '#4338ca',
  '#be123c',
]

export function courseColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0
  }
  return PALETTE[h % PALETTE.length]
}

export function parseWeekParity(weeks: string): WeekParity {
  if (/单/.test(weeks)) return 'odd'
  if (/双/.test(weeks)) return 'even'
  return 'all'
}

export function loadTimetable(): TimetablePayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as TimetablePayload
    if (!data?.courses || !Array.isArray(data.courses)) return null
    return data
  } catch {
    return null
  }
}

export function saveTimetable(payload: TimetablePayload): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function clearTimetable(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function getChannelUrl(): string {
  return localStorage.getItem(CHANNEL_URL_KEY) || DEFAULT_CHANNEL_URL
}

export function setChannelUrl(url: string): void {
  localStorage.setItem(CHANNEL_URL_KEY, url)
}

export function daysSince(iso: string): number {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 999
  const diff = Date.now() - then
  return Math.floor(diff / (24 * 60 * 60 * 1000))
}

export function getFreshness(updatedAt?: string | null): FreshnessInfo {
  if (!updatedAt) {
    return {
      level: 'empty',
      days: null,
      label: '尚未导入课表，请使用书签导入',
      bannerClass: 'banner-empty',
    }
  }
  const days = daysSince(updatedAt)
  if (days <= 3) {
    return {
      level: 'fresh',
      days,
      label: `数据较新 · ${days === 0 ? '今天' : `${days}天前`}更新`,
      bannerClass: 'banner-fresh',
    }
  }
  if (days <= 7) {
    return {
      level: 'warn',
      days,
      label: `建议刷新 · ${days}天前更新`,
      bannerClass: 'banner-warn',
    }
  }
  if (days <= 14) {
    return {
      level: 'stale',
      days,
      label: `可能已过期 · ${days}天前更新`,
      bannerClass: 'banner-stale',
    }
  }
  return {
    level: 'expired',
    days,
    label: `已过期，请重新导入 · ${days}天前更新`,
    bannerClass: 'banner-expired',
  }
}

/** 从学期起始日推算当前教学周（周一为一周开始） */
export function currentTeachingWeek(termStart?: string): number | null {
  if (!termStart) return null
  const start = new Date(termStart + 'T00:00:00')
  if (Number.isNaN(start.getTime())) return null
  const now = new Date()
  const day = start.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const termMonday = new Date(start)
  termMonday.setDate(start.getDate() + mondayOffset)
  const diff = now.getTime() - termMonday.getTime()
  if (diff < 0) return 1
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1
}

export function weekMatches(course: Course, week: number | null): boolean {
  if (week == null) return true
  if (course.weekParity === 'odd' && week % 2 === 0) return false
  if (course.weekParity === 'even' && week % 2 === 1) return false
  const range = course.weeks.match(/(\d+)\s*[-~至]\s*(\d+)/)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (week < a || week > b) return false
  } else {
    const single = course.weeks.match(/(\d+)/)
    if (single && !/[-~至]/.test(course.weeks)) {
      if (Number(single[1]) !== week) return false
    }
  }
  return true
}

export function maxSection(courses: Course[]): number {
  let m = 8
  for (const c of courses) {
    m = Math.max(m, c.endSection)
  }
  return Math.min(Math.max(m, 8), 12)
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 解码 Bookmarklet 传来的 base64url JSON */
export function decodeImportPayload(encoded: string): TimetablePayload {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const json = decodeURIComponent(escape(atob(b64 + pad)))
  const data = JSON.parse(json) as TimetablePayload
  if (!data.courses || !Array.isArray(data.courses)) {
    throw new Error('课表数据格式无效')
  }
  return {
    version: 1,
    school: data.school || '四川轻化工大学',
    updatedAt: data.updatedAt || new Date().toISOString(),
    courses: data.courses.map((c: Course) => ({
      ...c,
      id: c.id || uid(),
      weekParity: c.weekParity || parseWeekParity(c.weeks || ''),
    })),
    termStart: data.termStart,
  }
}

export function encodePayload(payload: TimetablePayload): string {
  const json = JSON.stringify(payload)
  const b64 = btoa(unescape(encodeURIComponent(json)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
