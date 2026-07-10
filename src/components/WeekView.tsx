import { useEffect, useMemo, useState } from 'react'
import type { Course } from '../types'
import {
  SECTION_TIMES,
  SECTION_TIME_RANGES,
  WEEKDAY_LABELS,
  courseColor,
  maxSection,
  weekMatches,
} from '../lib/storage'

interface Props {
  courses: Course[]
  /** 学期推算的当前周，仅作默认选中参考 */
  suggestedWeek?: number | null
  selectedWeekday: number
  onSelectWeekday: (d: number) => void
}

function parityLabel(p: Course['weekParity']) {
  if (p === 'odd') return '单周'
  if (p === 'even') return '双周'
  return ''
}

function CourseChip({ course }: { course: Course }) {
  return (
    <div
      className={`course-chip flex min-h-[3.4rem] flex-col justify-center ${
        course.weekParity === 'odd'
          ? 'odd-week'
          : course.weekParity === 'even'
            ? 'even-week'
            : ''
      }`}
      style={{ backgroundColor: courseColor(course.name) }}
    >
      <div className="text-[0.78rem] font-semibold leading-snug">{course.name}</div>
      <div className="mt-1 opacity-95">
        {course.room}
        {course.teacher ? ` · ${course.teacher}` : ''}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-1 opacity-90">
        <span>
          第{course.startSection}
          {course.endSection !== course.startSection ? `-${course.endSection}` : ''}
          节
        </span>
        <span>· {course.weeks}周</span>
        {parityLabel(course.weekParity) && (
          <span className="rounded bg-black/20 px-1">
            {parityLabel(course.weekParity)}
          </span>
        )}
      </div>
    </div>
  )
}

/** 从课表里推最大周次，至少 16 */
function detectMaxWeek(courses: Course[]): number {
  let max = 16
  for (const c of courses) {
    const range = c.weeks.match(/(\d+)\s*[-~至]\s*(\d+)/)
    if (range) {
      max = Math.max(max, Number(range[1]), Number(range[2]))
      continue
    }
    const single = c.weeks.match(/(\d+)/)
    if (single) max = Math.max(max, Number(single[1]))
  }
  return Math.min(Math.max(max, 1), 30)
}

export function WeekView({
  courses,
  suggestedWeek,
  selectedWeekday,
  onSelectWeekday,
}: Props) {
  const maxWeek = useMemo(() => detectMaxWeek(courses), [courses])
  const defaultWeek = useMemo(() => {
    if (suggestedWeek && suggestedWeek >= 1 && suggestedWeek <= maxWeek) {
      return suggestedWeek
    }
    return 1
  }, [suggestedWeek, maxWeek])

  const [viewWeek, setViewWeek] = useState<number | 'all'>(defaultWeek)
  const sections = maxSection(courses)
  const today = ((new Date().getDay() + 6) % 7) + 1

  useEffect(() => {
    setViewWeek(defaultWeek)
  }, [defaultWeek, courses.length])

  const filterWeek = viewWeek === 'all' ? null : viewWeek

  const dayCourses = courses
    .filter((c) => c.weekday === selectedWeekday)
    .filter((c) => weekMatches(c, filterWeek))
    .sort(
      (a, b) =>
        a.startSection - b.startSection || a.name.localeCompare(b.name, 'zh'),
    )

  const byStart = new Map<number, Course[]>()
  for (const c of dayCourses) {
    const list = byStart.get(c.startSection) || []
    list.push(c)
    byStart.set(c.startSection, list)
  }

  const weekOptions: Array<number | 'all'> = [
    'all',
    ...Array.from({ length: maxWeek }, (_, i) => i + 1),
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col animate-fade-in">
      <div className="px-3 pt-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[0.75rem] font-medium text-ink">
            {viewWeek === 'all' ? '查看：全部周次' : `查看：第 ${viewWeek} 周`}
            {viewWeek !== 'all' && viewWeek % 2 === 1 ? '（单周）' : ''}
            {viewWeek !== 'all' && viewWeek % 2 === 0 ? '（双周）' : ''}
          </p>
          <p className="text-[0.7rem] text-muted">当天 {dayCourses.length} 门</p>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          {weekOptions.map((w) => {
            const active = viewWeek === w
            const label = w === 'all' ? '全部' : `${w}`
            return (
              <button
                key={String(w)}
                type="button"
                onClick={() => setViewWeek(w)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                  active
                    ? 'bg-brand text-white shadow-sm shadow-brand/20'
                    : 'border border-line bg-white text-ink'
                }`}
              >
                {w === 'all' ? '全部' : `第${label}周`}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-3 pb-3 scrollbar-none">
        {WEEKDAY_LABELS.map((label, i) => {
          const day = i + 1
          const active = day === selectedWeekday
          const isToday = day === today
          const count = courses.filter(
            (c) => c.weekday === day && weekMatches(c, filterWeek),
          ).length
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectWeekday(day)}
              className={`flex min-w-[3.1rem] flex-col items-center rounded-2xl px-2.5 py-2 transition active:scale-95 ${
                active
                  ? 'bg-brand text-white shadow-md shadow-brand/25'
                  : 'border border-line bg-white/80 text-ink'
              }`}
            >
              <span className="text-[0.65rem] opacity-80">
                {isToday ? '今天' : '周'}
              </span>
              <span className="mt-0.5 font-display text-base font-bold leading-none">
                {label}
              </span>
              <span
                className={`mt-1 text-[0.6rem] ${active ? 'text-white/90' : 'text-muted'}`}
              >
                {count}门
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-2">
        <div className="overflow-hidden rounded-2xl border border-line bg-white/90 shadow-sm">
          {Array.from({ length: sections }, (_, i) => i + 1).map((sec) => {
            const group = byStart.get(sec)
            const coveredBy = dayCourses.find(
              (c) => c.startSection < sec && c.endSection >= sec,
            )

            return (
              <div
                key={sec}
                className="grid grid-cols-[3.2rem_1fr] border-b border-line/70 last:border-b-0"
                style={{
                  minHeight: group
                    ? `${Math.max(group.length, 1) * 4.1}rem`
                    : '4.1rem',
                }}
              >
                <div className="flex flex-col items-center justify-start border-r border-line/70 bg-surface/60 px-0.5 py-2">
                  <span className="text-xs font-semibold text-ink">{sec}</span>
                  <span className="mt-0.5 whitespace-pre-line text-center text-[0.55rem] leading-tight text-muted">
                    {(SECTION_TIME_RANGES[sec] || SECTION_TIMES[sec] || '').replace(
                      '-',
                      '\n',
                    )}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 p-1.5">
                  {group ? (
                    group.map((course) => (
                      <CourseChip key={course.id} course={course} />
                    ))
                  ) : coveredBy ? (
                    <CourseChip course={coveredBy} />
                  ) : (
                    <div className="h-full min-h-[3.4rem] rounded-lg border border-dashed border-transparent" />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {dayCourses.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">
            {viewWeek === 'all'
              ? '这一天没有课，点上面其他星期看看'
              : `第 ${viewWeek} 周的这一天没有课，换一周或换一天试试`}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-3 px-1 text-[0.65rem] text-muted">
          <span>上面可选「第几周」查看当周课表</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="course-chip odd-week inline-block h-3 w-5 rounded bg-brand" />
            单周
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="course-chip even-week inline-block h-3 w-5 rounded bg-brand" />
            双周
          </span>
        </div>
      </div>
    </div>
  )
}
