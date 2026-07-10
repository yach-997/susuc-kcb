import type { Course } from '../types'
import {
  SECTION_TIME_RANGES,
  WEEKDAY_LABELS,
  courseColor,
  todayWeekday,
  weekMatches,
} from '../lib/storage'

interface Props {
  courses: Course[]
  week: number | null
  /** 学期尚未开始 */
  beforeTerm?: boolean
  onCourseClick?: (course: Course) => void
  onShowWeek?: () => void
}

export function TodayView({
  courses,
  week,
  beforeTerm,
  onCourseClick,
  onShowWeek,
}: Props) {
  const weekday = todayWeekday()
  const list =
    beforeTerm || week == null
      ? []
      : courses
          .filter(
            (c) =>
              c.weekday === weekday &&
              weekMatches(c, week) &&
              c.startSection >= 1,
          )
          .sort((a, b) => a.startSection - b.startSection)

  const now = new Date()
  const dateText = `${now.getMonth() + 1}月${now.getDate()}日 周${WEEKDAY_LABELS[weekday - 1]}`

  return (
    <div className="px-3 pb-2 animate-fade-in">
      <div className="mb-2 flex items-end justify-between px-0.5">
        <div>
          <h2 className="text-base font-bold text-ink">今日课程</h2>
          <p className="text-[0.7rem] text-muted">
            {dateText}
            {beforeTerm
              ? ' · 学期未开始'
              : week != null
                ? ` · 第 ${week} 周`
                : ''}
          </p>
        </div>
        <span className="text-[0.7rem] text-muted">{list.length} 节</span>
      </div>

      {beforeTerm ? (
        <div className="rounded-2xl border border-dashed border-line bg-white/70 px-4 py-8 text-center">
          <p className="text-sm font-medium text-ink">学期还没开始</p>
          <p className="mt-1 text-xs text-muted leading-relaxed">
            课表已导入（共 {courses.length} 条）。到了你填的第一周之后，「今日」会按日期自动显示。
          </p>
          {onShowWeek && (
            <button
              type="button"
              onClick={onShowWeek}
              className="mt-4 rounded-xl bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand-dark"
            >
              先预览整周课表
            </button>
          )}
        </div>
      ) : week == null ? (
        <div className="rounded-2xl border border-dashed border-line bg-white/70 px-4 py-8 text-center">
          <p className="text-sm font-medium text-ink">还不能算「今天上哪节」</p>
          <p className="mt-1 text-xs text-muted">请在设置里确认学期和第一周日期</p>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white/70 px-4 py-8 text-center">
          <p className="text-sm font-medium text-ink">今天没有课</p>
          <p className="mt-1 text-xs text-muted">有补课可点右上角「加课」</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => {
            const color = courseColor(c.name)
            const start = SECTION_TIME_RANGES[c.startSection]?.split('-')[0]
            const end = SECTION_TIME_RANGES[c.endSection]?.split('-')[1]
            const time =
              start && end
                ? `${start}-${end}`
                : `第${c.startSection}${c.endSection > c.startSection ? `-${c.endSection}` : ''}节`
            const clickable = c.source === 'manual' && onCourseClick
            const inner = (
              <>
                <div className="w-1.5 shrink-0" style={{ background: color }} />
                <div className="min-w-0 flex-1 px-3 py-2.5 text-left">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate text-sm font-bold text-ink">
                      {c.name}
                      {c.source === 'manual' && (
                        <span className="ml-1.5 align-middle text-[0.65rem] font-semibold text-brand">
                          自加
                        </span>
                      )}
                    </h3>
                    <span className="shrink-0 text-[0.7rem] font-medium text-muted">
                      {c.startSection === c.endSection
                        ? `第${c.startSection}节`
                        : `第${c.startSection}-${c.endSection}节`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{time}</p>
                  <p className="mt-1 truncate text-xs text-ink/80">
                    {c.room}
                    {c.teacher ? ` · ${c.teacher}` : ''}
                    {clickable ? ' · 点按可改' : ''}
                  </p>
                </div>
              </>
            )
            return (
              <li key={c.id}>
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onCourseClick(c)}
                    className="flex w-full overflow-hidden rounded-2xl border border-brand/30 bg-white/90 shadow-sm"
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="flex overflow-hidden rounded-2xl border border-line/70 bg-white/90 shadow-sm">
                    {inner}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
