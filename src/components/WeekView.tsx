import type { Course } from '../types'
import {
  SECTION_TIMES,
  WEEKDAY_LABELS,
  courseColor,
  maxSection,
  weekMatches,
} from '../lib/storage'

interface Props {
  courses: Course[]
  teachingWeek: number | null
  selectedWeekday: number
  onSelectWeekday: (d: number) => void
}

function parityLabel(p: Course['weekParity']) {
  if (p === 'odd') return '单周'
  if (p === 'even') return '双周'
  return ''
}

export function WeekView({
  courses,
  teachingWeek,
  selectedWeekday,
  onSelectWeekday,
}: Props) {
  const sections = maxSection(courses)
  const today = ((new Date().getDay() + 6) % 7) + 1 // Mon=1

  const dayCourses = courses
    .filter((c) => c.weekday === selectedWeekday)
    .filter((c) => weekMatches(c, teachingWeek))
    .sort((a, b) => a.startSection - b.startSection)

  /** 按节次占位，合并连续同一课程 */
  const occupied = new Set<number>()
  const cells: { course: Course; span: number }[] = []

  for (const c of dayCourses) {
    if (occupied.has(c.startSection)) continue
    const span = Math.max(1, c.endSection - c.startSection + 1)
    for (let s = c.startSection; s <= c.endSection; s++) occupied.add(s)
    cells.push({ course: c, span })
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 animate-fade-in">
      <div className="flex gap-1.5 overflow-x-auto px-3 py-3 scrollbar-none">
        {WEEKDAY_LABELS.map((label, i) => {
          const day = i + 1
          const active = day === selectedWeekday
          const isToday = day === today
          const count = courses.filter(
            (c) => c.weekday === day && weekMatches(c, teachingWeek),
          ).length
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectWeekday(day)}
              className={`flex min-w-[3.1rem] flex-col items-center rounded-2xl px-2.5 py-2 transition active:scale-95 ${
                active
                  ? 'bg-brand text-white shadow-md shadow-brand/25'
                  : 'bg-white/80 text-ink border border-line'
              }`}
            >
              <span className="text-[0.65rem] opacity-80">{isToday ? '今天' : '周'}</span>
              <span className="mt-0.5 font-display text-base font-bold leading-none">
                {label}
              </span>
              <span
                className={`mt-1.5 h-1 w-1 rounded-full ${
                  count > 0 ? (active ? 'bg-white' : 'bg-brand') : 'bg-transparent'
                }`}
              />
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-2">
        <div className="rounded-2xl border border-line bg-white/90 shadow-sm overflow-hidden">
          {Array.from({ length: sections }, (_, i) => i + 1).map((sec) => {
            const hit = cells.find((x) => x.course.startSection === sec)
            const covered = dayCourses.some(
              (c) => c.startSection < sec && c.endSection >= sec,
            )
            if (covered && !hit) return null

            return (
              <div
                key={sec}
                className="grid grid-cols-[3.2rem_1fr] border-b border-line/70 last:border-b-0"
                style={hit ? { minHeight: `${hit.span * 4.25}rem` } : { minHeight: '4.25rem' }}
              >
                <div className="flex flex-col items-center justify-start border-r border-line/70 bg-surface/60 py-2">
                  <span className="text-xs font-semibold text-ink">{sec}</span>
                  <span className="text-[0.6rem] text-muted">{SECTION_TIMES[sec] || ''}</span>
                </div>
                <div className="p-1.5">
                  {hit ? (
                    <div
                      className={`course-chip h-full min-h-[3.5rem] flex flex-col justify-center ${
                        hit.course.weekParity === 'odd'
                          ? 'odd-week'
                          : hit.course.weekParity === 'even'
                            ? 'even-week'
                            : ''
                      }`}
                      style={{ backgroundColor: courseColor(hit.course.name) }}
                    >
                      <div className="font-semibold text-[0.78rem] leading-snug">
                        {hit.course.name}
                      </div>
                      <div className="mt-1 opacity-95">
                        {hit.course.room}
                        {hit.course.teacher ? ` · ${hit.course.teacher}` : ''}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1 opacity-90">
                        <span>
                          第{hit.course.startSection}
                          {hit.course.endSection !== hit.course.startSection
                            ? `-${hit.course.endSection}`
                            : ''}
                          节
                        </span>
                        <span>· {hit.course.weeks}</span>
                        {parityLabel(hit.course.weekParity) && (
                          <span className="rounded bg-black/20 px-1">
                            {parityLabel(hit.course.weekParity)}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full min-h-[3.5rem] rounded-lg border border-dashed border-transparent" />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {dayCourses.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">这一天没有课，放松一下</p>
        )}

        <div className="mt-3 flex flex-wrap gap-3 px-1 text-[0.65rem] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded course-chip odd-week bg-brand" />
            单周斜纹
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded course-chip even-week bg-brand" />
            双周斜纹
          </span>
        </div>
      </div>
    </div>
  )
}
