import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AddCourseSheet } from '../components/AddCourseSheet'
import { TermMetaForm } from '../components/TermMetaForm'
import { TodayView } from '../components/TodayView'
import { WeekView } from '../components/WeekView'
import {
  currentTeachingWeek,
  isBeforeTermStart,
  maxWeekFromCourses,
  normalizeTermLabel,
  saveTimetable,
  studentNameFromPayload,
  summarizeCourses,
} from '../lib/storage'
import type { Course, TimetablePayload } from '../types'

interface Props {
  data: TimetablePayload | null
  onUpdate?: (payload: TimetablePayload) => void
}

function ExtraCourses({ courses }: { courses: Course[] }) {
  if (courses.length === 0) return null
  return (
    <section className="mx-3.5 mb-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-3.5">
      <h2 className="text-sm font-semibold text-ink">实践 / 其他</h2>
      <p className="mt-0.5 text-xs text-muted">
        无固定星期节次，不进入课表格。
      </p>
      <ul className="mt-2.5 space-y-2">
        {courses.map((c) => (
          <li
            key={c.id}
            className="rounded-xl border border-amber-100 bg-white px-3 py-2.5"
          >
            <p className="text-[15px] font-medium text-ink">{c.name}</p>
            <p className="mt-1 text-sm text-muted">
              {[c.teacher, `${c.weeks}周`, c.room].filter(Boolean).join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function HomePage({ data, onUpdate }: Props) {
  const navigate = useNavigate()
  const needTermMeta = !!(data && data.courses.length > 0 && !data.termStart)
  const beforeTerm = !!(data?.termStart && isBeforeTermStart(data.termStart))
  const teachingWeek = useMemo(() => {
    if (!data?.termStart) return null
    const max = maxWeekFromCourses(data.courses)
    return currentTeachingWeek(data.termStart, Math.max(max, 1))
  }, [data])
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

  const studentName = data ? studentNameFromPayload(data) : ''
  const weekChip = beforeTerm
    ? '未开学'
    : teachingWeek != null
      ? `第 ${teachingWeek} 周`
      : null
  const courseLabel = data ? summarizeCourses(data.courses).label : ''
  const canAdd = !!(data && data.courses.length > 0 && !needTermMeta)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-3.5 pt-3.5 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[1.35rem] font-bold leading-tight tracking-tight text-ink">
              {studentName ? `${studentName}的课表` : '川轻化课表助手'}
            </h1>
            {data && data.courses.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {data.termLabel && (
                  <span className="rounded-lg bg-white px-2 py-0.5 text-xs font-medium text-ink border border-line/80">
                    {data.termLabel}
                  </span>
                )}
                {weekChip && (
                  <span className="rounded-lg bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-dark">
                    {weekChip}
                  </span>
                )}
                <span className="text-xs text-muted">{courseLabel}</span>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted">导入正方教务课表 PDF</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canAdd && (
              <button
                type="button"
                onClick={openAdd}
                className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white"
              >
                加课
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/guide')}
              className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-ink"
            >
              导入
            </button>
          </div>
        </div>
      </header>

      {needTermMeta && data && (
        <div className="mx-3.5 mt-1">
          <TermMetaForm
            initialLabel={data.termLabel}
            courseSummary={
              data ? summarizeCourses(data.courses).label : undefined
            }
            submitText="保存学期信息"
            onSubmit={({ termLabel, termStart }) =>
              saveMeta(termLabel, termStart)
            }
          />
        </div>
      )}

      {data && data.courses.length > 0 && !needTermMeta ? (
        <>
          <div className="mx-3.5 mt-1 grid grid-cols-2 gap-1 rounded-2xl bg-surface p-1">
            <button
              type="button"
              onClick={() => setTab('today')}
              className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                tab === 'today'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-muted'
              }`}
            >
              今日
            </button>
            <button
              type="button"
              onClick={() => setTab('week')}
              className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                tab === 'week' ? 'bg-white text-ink shadow-sm' : 'text-muted'
              }`}
            >
              周课表
            </button>
          </div>

          {tab === 'today' ? (
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
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
              <ExtraCourses courses={extraCourses} />
            </div>
          ) : (
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
              <WeekView
                courses={timedCourses}
                suggestedWeek={weekViewWeek}
                termStart={data.termStart}
                onCourseClick={openEditManual}
              />
              <ExtraCourses courses={extraCourses} />
            </div>
          )}
        </>
      ) : !data || data.courses.length === 0 ? (
        <div className="mx-3.5 mt-4 flex flex-1 flex-col items-center rounded-3xl border border-dashed border-line bg-white px-6 py-14 text-center animate-slide-up">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-soft font-display text-2xl font-bold text-brand">
            课
          </div>
          <h2 className="mt-5 text-xl font-semibold text-ink">还没有课表</h2>
          <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-muted">
            导入教务 PDF 后即可查看今日与周课表；临时补课可用「加课」。
          </p>
          <Link
            to="/guide"
            className="mt-7 rounded-2xl bg-brand px-6 py-3 text-sm font-semibold text-white"
          >
            去导入课表
          </Link>
        </div>
      ) : null}

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
