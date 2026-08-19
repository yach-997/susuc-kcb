/** 单双周：all=每周，odd=单周，even=双周 */
export type WeekParity = 'all' | 'odd' | 'even'

export interface Course {
  id: string
  name: string
  teacher: string
  room: string
  /** 1=周一 … 7=周日；0=无固定星期（实践课等页脚条目） */
  weekday: number
  /** 起始节次（1-based）；无固定节次时为 0 */
  startSection: number
  /** 结束节次（含）；无固定节次时为 0 */
  endSection: number
  /** 周次描述，如 "1-16" / "1-8单" / "2-16双" / "5"（仅第5周） */
  weeks: string
  weekParity: WeekParity
  /** 教务页脚「(共N周)」；仅实践/其他条目有 */
  spanWeeks?: number
  /** 学生手动添加的补课/调课；重新导入 PDF 时会保留 */
  source?: 'import' | 'manual'
  /**
   * timed=有明确星期节次，进今日/周视图；
   * unscheduled=仅周次（实践课等），只出现在「实践/其他」列表
   */
  schedule?: 'timed' | 'unscheduled'
}

export interface TimetablePayload {
  version: 1
  school: string
  updatedAt: string
  courses: Course[]
  /** 学生姓名（从教务 PDF 识别） */
  studentName?: string
  /** 学号（从教务 PDF 识别，云端找回用） */
  studentId?: string
  /** 学期名称，如「2025-2026 上学期」 */
  termLabel?: string
  /** 第一周周一日期 YYYY-MM-DD，用于推算当前教学周与日期 */
  termStart?: string
}
