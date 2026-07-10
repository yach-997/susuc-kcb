import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AddCourseSheet } from '../components/AddCourseSheet'
import { ChannelCTA } from '../components/ChannelCTA'
import { StatusBanner } from '../components/StatusBanner'
import { StaleModal } from '../components/StaleModal'
import { TermMetaForm } from '../components/TermMetaForm'
import { TodayView } from '../components/TodayView'
import { WeekView } from '../components/WeekView'
import {
  currentTeachingWeek,
  getFreshness,
  isBeforeTermStart,
  normalizeTermLabel,
  saveTimetable,
} from '../lib/storage'
import type { Course, TimetablePayload } from '../types'

const STALE_DISMISS_KEY = 'susuc-stale-dismissed-at'

interface Props {
  data: TimetablePayload | null
  onUpdate?: (payload: TimetablePayload) => void
}

export function HomePage({ data, onUpdate }: Props) {
  const navigate = useNavigate()
  const freshness = useMemo(() => getFreshness(data?.updatedAt), [data?.updatedAt])
  const needTermMeta = !!(data && data.courses.length > 0 && !data.termStart)
  const beforeTerm = !!(data?.termStart && isBeforeTermStart(data.termStart))
  const teachingWeek = useMemo(() => {
    if (!data?.termStart) return null
    let max = 16
    for (const c of data.courses) {
      const range = c.weeks.match(/(\d+)\s*[-~至]\s*(\d+)/)
      if (range) max = Math.max(max, Number(range[1]), Number(range[2]))
      const single = c.weeks.match(/(\d+)/)
      if (single) max = Math.max(max, Number(single[1]))
    }
    return currentTeachingWeek(data.termStart, Math.min(max, 30))
  }, [data])
  /** 本周视图：未开学时默认预览第 1 周 */
  const weekViewWeek = teachingWeek ?? (beforeTerm ? 1 : null)
  const [showStale, setShowStale] = useState(false)
  const [tab, setTab] = useState<'today' | 'week'>('today')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)

  useEffect(() => {
    if (!data?.updatedAt) return
    if (freshness.days == null || freshness.days <= 7) return
    const dismissed = sessionStorage.getItem(STALE_DISMISS_KEY)
    if (dismissed === data.updatedAt) return
    setShowStale(true)
  }, [data?.updatedAt, freshness.days])

  const dismissStale = () => {
    if (data?.updatedAt) sessionStorage.setItem(STALE_DISMISS_KEY, data.updatedAt)
    setShowStale(false)
  }

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
    if (!data) return '本地课表 · 零后端'
    const parts: string[] = []
    if (data.termLabel) parts.push(data.termLabel)
    if (beforeTerm) parts.push('未开学')
    else if (teachingWeek != null) parts.push(`第 ${teachingWeek} 周`)
    parts.push(`${data.courses.length} 条课次`)
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

      <div className="px-3">
        <StatusBanner info={freshness} />
      </div>

      {needTermMeta && data && (
        <div className="mx-3 mt-2">
          <TermMetaForm
            initialLabel={data.termLabel}
            courseCount={data.courses.length}
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
              本周
            </button>
          </div>

          {tab === 'today' ? (
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <TodayView
                courses={data.courses}
                week={teachingWeek}
                beforeTerm={beforeTerm}
                onCourseClick={openEditManual}
                onShowWeek={() => setTab('week')}
              />
              <p className="px-4 pb-3 text-center text-[0.7rem] text-muted">
                补课/调课点右上角「加课」· 自加的课可点开修改
              </p>
            </div>
          ) : (
            <WeekView
              courses={data.courses}
              suggestedWeek={weekViewWeek}
              termStart={data.termStart}
              onCourseClick={openEditManual}
            />
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
            onClick={() => navigate('/guide')}
          >
            或先看演示课表
          </button>
        </div>
      ) : null}

      {!(data && data.courses.length > 0) && <ChannelCTA />}

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

      <StaleModal
        open={showStale}
        days={freshness.days ?? 0}
        onClose={dismissStale}
        onGoGuide={() => {
          dismissStale()
          navigate('/guide')
        }}
      />
    </div>
  )
}
