import type { Course, TimetablePayload, WeekParity } from '../types'

const STORAGE_KEY = 'susuc-timetable-v1'
const CHANNEL_URL_KEY = 'susuc-channel-url-v2'

export const DEFAULT_CHANNEL_URL = 'https://qm.qq.com/q/iy0gyxKnrq'

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const

/** 川轻化常见作息（第1节 08:30 起；晚间可到第14节） */
export const SECTION_TIMES: Record<number, string> = {
  1: '08:30',
  2: '09:20',
  3: '10:25',
  4: '11:15',
  5: '14:00',
  6: '14:50',
  7: '15:55',
  8: '16:45',
  9: '19:00',
  10: '19:50',
  11: '20:40',
  12: '21:30',
  13: '22:20',
  14: '23:10',
}

/** 完整起止时间，用于展示 */
export const SECTION_TIME_RANGES: Record<number, string> = {
  1: '08:30-09:15',
  2: '09:20-10:05',
  3: '10:25-11:10',
  4: '11:15-12:00',
  5: '14:00-14:45',
  6: '14:50-15:35',
  7: '15:55-16:40',
  8: '16:45-17:30',
  9: '19:00-19:45',
  10: '19:50-20:35',
  11: '20:40-21:25',
  12: '21:30-22:15',
  13: '22:20-23:05',
  14: '23:10-23:55',
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

/**
 * 统计课表：一门课名可对应多个时间格子（课次）。
 * 展示用「N 门课 · M 条课次」，避免把课次误当成门数。
 */
export function summarizeCourses(courses: Course[]): {
  slots: number
  unique: number
  label: string
} {
  const slots = courses.length
  const unique = new Set(
    courses.map((c) => c.name.trim()).filter(Boolean),
  ).size
  const label =
    unique === slots
      ? `${slots} 门课`
      : `${unique} 门课 · ${slots} 条课次`
  return { slots, unique, label }
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

/** 把任意日期归一到当周周一 YYYY-MM-DD */
export function toMondayIso(dateStr: string): string | null {
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  const day = d.getDay()
  const offset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + offset)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** 今天是周几：1=周一 … 7=周日 */
export function todayWeekday(): number {
  return ((new Date().getDay() + 6) % 7) + 1
}

/** 根据当前月份猜一个学期名，方便学生少打字 */
export function guessTermLabel(now = new Date()): string {
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  if (m >= 2 && m <= 7) return `${y - 1}-${y} 下学期`
  if (m >= 8) return `${y}-${y + 1} 上学期`
  return `${y - 1}-${y} 上学期`
}

/** 清洗教务 PDF 里的学期字符串 */
export function normalizeTermLabel(raw?: string): string {
  if (!raw) return guessTermLabel()
  const m = raw.match(/(\d{4})\s*[-–—]\s*(\d{4}).*?(上|下|第\s*[12一二]|1|2)/)
  if (m) {
    const half = /上|1|一/.test(m[3]) ? '上学期' : '下学期'
    return `${m[1]}-${m[2]} ${half}`
  }
  return raw.replace(/\s+/g, ' ').trim() || guessTermLabel()
}

/** 第 week 周的周一（基于 termStart） */
export function mondayOfWeek(termStart: string, week: number): Date | null {
  const mondayIso = toMondayIso(termStart)
  if (!mondayIso) return null
  const d = new Date(mondayIso + 'T00:00:00')
  d.setDate(d.getDate() + (Math.max(1, week) - 1) * 7)
  return d
}

/** 从学期第一周周一推算当前教学周；未开学或已超过最大周返回 null */
export function currentTeachingWeek(
  termStart?: string,
  maxWeek = 30,
): number | null {
  if (!termStart) return null
  const mondayIso = toMondayIso(termStart)
  if (!mondayIso) return null
  const termMonday = new Date(mondayIso + 'T00:00:00')
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = today.getTime() - termMonday.getTime()
  if (diff < 0) return null
  const week = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1
  if (week > maxWeek) return null
  return Math.max(week, 1)
}

/** 是否还没到第一周（今天早于学期第一周周一） */
export function isBeforeTermStart(termStart?: string): boolean {
  if (!termStart) return false
  const mondayIso = toMondayIso(termStart)
  if (!mondayIso) return false
  const termMonday = new Date(mondayIso + 'T00:00:00')
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return today.getTime() < termMonday.getTime()
}

export function weekMatches(course: Course, week: number | null): boolean {
  if (week == null) return true

  // 支持多段：如 "1-3,6-13" / "5-7单,8-9"
  const segments = course.weeks.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  const parts = segments.length ? segments : [course.weeks]

  return parts.some((part) => {
    const parity = parseWeekParity(part)
    if (parity === 'odd' && week % 2 === 0) return false
    if (parity === 'even' && week % 2 === 1) return false
    const range = part.match(/(\d+)\s*[-~至]\s*(\d+)/)
    if (range) {
      const a = Number(range[1])
      const b = Number(range[2])
      return week >= a && week <= b
    }
    const single = part.match(/(\d+)/)
    if (single) return Number(single[1]) === week
    // 无周次信息时：回退到整门课的 weekParity
    if (course.weekParity === 'odd' && week % 2 === 0) return false
    if (course.weekParity === 'even' && week % 2 === 1) return false
    return true
  })
}

/** 课表里出现过的最大周次（严格按数据，无默认 16/30 等上下限） */
export function maxWeekFromCourses(courses: Course[]): number {
  let max = 0
  for (const c of courses) {
    if (!c.weeks) continue
    for (const m of c.weeks.matchAll(/(\d+)/g)) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > 0) max = Math.max(max, n)
    }
  }
  return max
}

/** 有排课课程的最大节次（严格按数据，无默认 8/11/14/16 等上下限） */
export function maxSection(courses: Course[]): number {
  let m = 0
  for (const c of courses) {
    if ((c.schedule ?? 'timed') !== 'timed') continue
    if (c.endSection > 0) m = Math.max(m, c.endSection)
    if (c.startSection > 0) m = Math.max(m, c.startSection)
  }
  return m
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
    termLabel: data.termLabel,
    termStart: data.termStart,
  }
}

export function encodePayload(payload: TimetablePayload): string {
  const json = JSON.stringify(payload)
  const b64 = btoa(unescape(encodeURIComponent(json)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
