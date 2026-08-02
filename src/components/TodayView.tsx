import type { Course } from '../types'
import {
  SECTION_TIME_RANGES,
  WEEKDAY_LABELS,
  courseColor,
  summarizeCourses,
  todayWeekday,
  weekMatches,
} from '../lib/storage'

interface Props {
  courses: Course[]
  week: number | null
  /** 学期尚未开始 */
  beforeTerm?: boolean
  /** 未开学提示里的课表规模，缺省则按 courses 统计 */
  courseSummary?: string
  onCourseClick?: (course: Course) => void
  onShowWeek?: () => void
}

function EmptyState({
  title,
  desc,
  actionLabel,
  onAction,
}: {
  title: string
  desc: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-white px-5 py-10 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{desc}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 rounded-2xl bg-brand-soft px-5 py-2.5 text-sm font-semibold text-brand-dark"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export function TodayView({
  courses,
  week,
  beforeTerm,
  courseSummary,
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
  const dateText = `${now.getMonth() + 1}月${now.getDate()}日`
  const weekLabel = WEEKDAY_LABELS[weekday - 1]

  return (
    <div className="px-3.5 pb-3 animate-fade-in">
      <div className="mb-3 flex items-end justify-between gap-3 rounded-2xl bg-white/90 px-3.5 py-3 border border-line/70">
        <div>
          <p className="text-sm text-muted">今天</p>
          <h2 className="mt-0.5 font-display text-xl font-bold tracking-tight text-ink">
            {dateText}
            <span className="ml-2 text-base font-semibold text-brand">
              周{weekLabel}
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted">
            {beforeTerm
              ? '学期未开始'
              : week != null
                ? `第 ${week} 周`
                : '本学期已结束'}
          </p>
        </div>
        {!beforeTerm && week != null && (
          <div className="rounded-2xl bg-brand-soft px-3 py-2 text-center">
            <p className="text-lg font-bold tabular-nums text-brand-dark">
              {list.length}
            </p>
            <p className="text-xs text-brand-dark/80">节课</p>
          </div>
        )}
      </div>

      {beforeTerm ? (
        <EmptyState
          title="学期还没开始"
          desc={`课表已导入（共 ${courseSummary ?? summarizeCourses(courses).label}）。开学后「今日」会按日期自动显示。`}
          actionLabel="先预览周课表"
          onAction={onShowWeek}
        />
      ) : week == null ? (
        <EmptyState
          title="本学期课表周次已过完"
          desc="可切到「周课表」浏览，或在设置里改第一周日期。"
          actionLabel="去看周课表"
          onAction={onShowWeek}
        />
      ) : list.length === 0 ? (
        <EmptyState
          title="今天没有课"
          desc="有补课可点右上角「加课」。"
        />
      ) : (
        <ul className="space-y-3">
          {list.map((c) => {
            const color = courseColor(c.name)
            const start = SECTION_TIME_RANGES[c.startSection]?.split('-')[0]
            const end = SECTION_TIME_RANGES[c.endSection]?.split('-')[1]
            const time =
              start && end
                ? `${start} – ${end}`
                : `第${c.startSection}${c.endSection > c.startSection ? `-${c.endSection}` : ''}节`
            const sectionText =
              c.startSection === c.endSection
                ? `第 ${c.startSection} 节`
                : `第 ${c.startSection}–${c.endSection} 节`
            const clickable = c.source === 'manual' && onCourseClick
            const card = (
              <div className="flex gap-3">
                <div className="flex w-[4.25rem] shrink-0 flex-col items-center pt-0.5">
                  <span className="text-sm font-bold tabular-nums text-ink">
                    {start || '—'}
                  </span>
                  <span className="mt-1 h-full min-h-[2rem] w-px bg-line" />
                  <span className="text-xs tabular-nums text-muted">
                    {end || ''}
                  </span>
                </div>
                <div
                  className="min-w-0 flex-1 rounded-2xl border border-line/80 bg-white p-3.5 shadow-[0_8px_24px_-18px_rgba(20,35,30,0.45)]"
                  style={{ borderLeftWidth: 4, borderLeftColor: color }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[15px] font-bold leading-snug text-ink">
                      {c.name}
                      {c.source === 'manual' && (
                        <span className="ml-1.5 align-middle text-xs font-semibold text-brand">
                          自加
                        </span>
                      )}
                    </h3>
                    <span className="shrink-0 rounded-lg bg-surface px-2 py-0.5 text-xs font-medium text-muted">
                      {sectionText}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm tabular-nums text-muted">{time}</p>
                  <p className="mt-2 text-sm leading-snug text-ink/85">
                    {[c.room, c.teacher].filter(Boolean).join(' · ')}
                    {clickable ? ' · 点按可改' : ''}
                  </p>
                </div>
              </div>
            )
            return (
              <li key={c.id}>
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onCourseClick(c)}
                    className="w-full text-left"
                  >
                    {card}
                  </button>
                ) : (
                  card
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
