/** 单双周：all=每周，odd=单周，even=双周 */
export type WeekParity = 'all' | 'odd' | 'even'

export interface Course {
  id: string
  name: string
  teacher: string
  room: string
  /** 1=周一 … 7=周日 */
  weekday: number
  /** 起始节次（1-based） */
  startSection: number
  /** 结束节次（含） */
  endSection: number
  /** 周次描述，如 "1-16" / "1-8单" / "2-16双" / "5"（仅第5周） */
  weeks: string
  weekParity: WeekParity
  /** 学生手动添加的补课/调课；重新导入 PDF 时会保留 */
  source?: 'import' | 'manual'
}

export interface TimetablePayload {
  version: 1
  school: string
  updatedAt: string
  courses: Course[]
  /** 学期名称，如「2025-2026 上学期」 */
  termLabel?: string
  /** 第一周周一日期 YYYY-MM-DD，用于推算当前教学周与日期 */
  termStart?: string
}

export type FreshnessLevel = 'fresh' | 'warn' | 'stale' | 'expired' | 'empty'

export interface FreshnessInfo {
  level: FreshnessLevel
  days: number | null
  label: string
  bannerClass: string
}
