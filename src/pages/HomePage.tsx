import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AddCourseSheet } from '../components/AddCourseSheet'
import { InstallHint } from '../components/InstallHint'
import { TermMetaForm } from '../components/TermMetaForm'
import { TodayView } from '../components/TodayView'
import { WeekView } from '../components/WeekView'
import { buildMockPayload } from '../lib/mockData'
import {
  currentTeachingWeek,
  isBeforeTermStart,
  maxWeekFromCourses,
  normalizeTermLabel,
  saveTimetable,
  summarizeCourses,
} from '../lib/storage'
import type { Course, TimetablePayload } from '../types'

interface Props {
  data: TimetablePayload | null
  onUpdate?: (payload: TimetablePayload) => void
  onImport?: (payload: TimetablePayload) => void
}

export function HomePage({ data, onUpdate, onImport }: Props) {
  const navigate = useNavigate()
  const needTermMeta = !!(data && data.courses.length > 0 && !data.termStart)
  const beforeTerm = !!(data?.termStart && isBeforeTermStart(data.termStart))
  const teachingWeek = useMemo(() => {
    if (!data?.termStart) return null
    const max = maxWeekFromCourses(data.courses)
    return currentTeachingWeek(data.termStart, Math.max(max, 1))
  }, [data])
  /** 周课表默认周：当前教学周；未开学看第 1 周；已结课看最后一周 */
  const weekViewWeek = useMemo(() => {
    if (teachingWeek != null) return teachingWeek
    if (!data) return 1
    const max = Math.max(maxWeekFromCourses(data.courses), 1)
    return beforeTerm ? 1 : max
  }, [teachingWeek, beforeTerm, data])
  const [tab, setTab] = useState<'today' | 'week'>('today')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)

  const extraCourses = useMemo(() => {
    if (!data) return []
    // 仅无固定星期/节次的页脚课（实践等）；有组班时间的重修走正常课表格
    return data.courses.filter(
      (c) => c.schedule === 'unscheduled' || c.weekday === 0,
    )
  }, [data])

  const timedCourses = useMemo(() => {
    if (!data) return []
    return data.courses.filter(
      (c) =>
        c.schedule !== 'unscheduled' &&
        c.weekday >= 1 &&
        c.weekday <= 7 &&
        c.startSection >= 1,
    )
  }, [data])

  const persist = (next: TimetablePayload) => {
    saveTimetable(next)
    onUpdate?.(next)
  }

  const saveMeta = (termLabel: string, termStart: string) => {
    if (!data) return
    persist({
      ...data,
      termLabel: normalizeTermLabel(termLabel),
      termStart,
    })
  }

  const openAdd = () => {
    if (!data) {
      navigate('/guide')
      return
    }
    setEditing(null)
    setSheetOpen(true)
  }

  const openEditManual = (course: Course) => {
    if (course.source !== 'manual') return
    setEditing(course)
    setSheetOpen(true)
  }

  const saveCourse = (course: Course) => {
    if (!data) return
    const exists = data.courses.some((c) => c.id === course.id)
    const courses = exists
      ? data.courses.map((c) => (c.id === course.id ? course : c))
      : [...data.courses, course]
    persist({
      ...data,
      courses,
      updatedAt: new Date().toISOString(),
    })
    setSheetOpen(false)
    setEditing(null)
  }

  const deleteCourse = (id: string) => {
    if (!data) return
    persist({
      ...data,
      courses: data.courses.filter((c) => c.id !== id),
      updatedAt: new Date().toISOString(),
    })
    setSheetOpen(false)
    setEditing(null)
  }

  const subtitle = (() => {
    if (!data) return '本地课表'
    const parts: string[] = []
    if (data.termLabel) parts.push(data.termLabel)
    if (beforeTerm) parts.push('未开学')
    else if (teachingWeek != null) parts.push(`第 ${teachingWeek} 周`)
    parts.push(summarizeCourses(data.courses).label)
    return parts.join(' · ')
  })()

  const canAdd = !!(data && data.courses.length > 0 && !needTermMeta)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-1">
        <div className="min-w-0">
          <h1 className="font-display text-lg font-bold tracking-tight text-ink">
            川轻化课表
          </h1>
          <p className="truncate text-[0.7rem] text-muted">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {canAdd && (
            <button
              type="button"
              onClick={openAdd}
              className="rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white"
            >
              加课
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/guide')}
            className="rounded-lg bg-brand-soft px-2.5 py-1.5 text-xs font-semibold text-brand-dark"
          >
            导入
          </button>
        </div>
      </header>

      {needTermMeta && data && (
        <div className="mx-3 mt-2">
          <TermMetaForm
            initialLabel={data.termLabel}
            courseSummary={
              data ? summarizeCourses(data.courses).label : undefined
            }
            submitText="保存学期信息"
            onSubmit={({ termLabel, termStart }) => saveMeta(termLabel, termStart)}
          />
        </div>
      )}

      {data && data.courses.length > 0 && !needTermMeta ? (
        <>
          <div className="mx-3 mt-1 flex rounded-xl border border-line bg-white/80 p-0.5">
            <button
              type="button"
              onClick={() => setTab('today')}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                tab === 'today' ? 'bg-brand text-white' : 'text-muted'
              }`}
            >
              今日
            </button>
            <button
              type="button"
              onClick={() => setTab('week')}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                tab === 'week' ? 'bg-brand text-white' : 'text-muted'
              }`}
            >
              周课表
            </button>
          </div>

          {tab === 'today' ? (
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <TodayView
                courses={timedCourses}
                week={teachingWeek}
                beforeTerm={beforeTerm}
                courseSummary={
                  data ? summarizeCourses(data.courses).label : undefined
                }
                onCourseClick={openEditManual}
                onShowWeek={() => setTab('week')}
              />
              {extraCourses.length > 0 && (
                <section className="mx-3 mb-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-3">
                  <h2 className="text-sm font-semibold text-ink">实践 / 其他课程</h2>
                  <p className="mt-0.5 text-[0.7rem] text-muted">
                    教务页脚未写星期节次，只按周次列出，不会塞进课表格。
                  </p>
                  <ul className="mt-2 space-y-2">
                    {extraCourses.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-ink">{c.name}</p>
                        <p className="mt-0.5 text-[0.75rem] text-muted">
                          {c.teacher} · {c.weeks}周
                          {c.room ? ` · ${c.room}` : ''}
                          {' · 无固定星期/节次'}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <p className="px-4 pb-3 text-center text-[0.7rem] text-muted">
                补课/调课点右上角「加课」· 自加的课可点开修改
              </p>
            </div>
          ) : (
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <WeekView
                courses={timedCourses}
                suggestedWeek={weekViewWeek}
                termStart={data.termStart}
                onCourseClick={openEditManual}
              />
              {extraCourses.length > 0 && (
                <section className="mx-3 mb-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-3">
                  <h2 className="text-sm font-semibold text-ink">实践 / 其他课程</h2>
                  <p className="mt-0.5 text-[0.7rem] text-muted">
                    无固定星期/节次，不进入上方课表格。
                  </p>
                  <ul className="mt-2 space-y-2">
                    {extraCourses.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-ink">{c.name}</p>
                        <p className="mt-0.5 text-[0.75rem] text-muted">
                          {c.teacher} · {c.weeks}周
                          {c.room ? ` · ${c.room}` : ''}
                          {' · 无固定星期/节次'}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </>
      ) : !data || data.courses.length === 0 ? (
        <div className="mx-3 mt-6 flex flex-1 flex-col items-center rounded-2xl border border-dashed border-line bg-white/70 px-6 py-12 text-center animate-slide-up">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft font-display text-xl font-bold text-brand">
            课
          </div>
          <h2 className="mt-4 text-lg font-semibold text-ink">还没有课表</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            先导入教务课表，之后老师临时补课，可用「加课」自己加一节。
          </p>
          <Link
            to="/guide"
            className="mt-6 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-md shadow-brand/20"
          >
            去导入课表
          </Link>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-brand"
            onClick={() => onImport?.(buildMockPayload(0))}
          >
            或先看演示课表
          </button>
        </div>
      ) : null}

      <div className="mt-auto pt-2">
        <InstallHint />
      </div>

      <AddCourseSheet
        open={sheetOpen}
        currentWeek={teachingWeek}
        editing={editing}
        onClose={() => {
          setSheetOpen(false)
          setEditing(null)
        }}
        onSave={saveCourse}
        onDelete={deleteCourse}
      />
    </div>
  )
}
