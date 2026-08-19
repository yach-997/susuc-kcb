import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AddCourseSheet } from '../components/AddCourseSheet'
import { TermMetaForm } from '../components/TermMetaForm'
import { TodayView } from '../components/TodayView'
import { WeekView } from '../components/WeekView'
import { RestoreByName } from '../components/RestoreByName'
import { isApplePhoneOrPad, isHuaweiOrHonor, isStandalonePwa } from '../lib/device'
import {
  currentTeachingWeek,
  formatFooterWeeks,
  isBeforeTermStart,
  maxWeekFromCourses,
  normalizeTermLabel,
  saveTimetable,
  studentNameFromPayload,
  summarizeCourses,
} from '../lib/storage'
import {
  canCloudBackup,
  JUST_IMPORTED_KEY,
  RESTORED_TIP_KEY,
  loadCloudIdentity,
} from '../lib/studentCloud'
import type { Course, TimetablePayload } from '../types'

function extraRoomLabel(room: string | undefined): string | null {
  if (!room) return null
  if (/无固定教室|见教务备注|未知教室/.test(room)) return null
  return room
}

function ExtraCoursesBlock({
  courses,
  hint,
}: {
  courses: Course[]
  hint: string
}) {
  if (!courses.length) return null
  return (
    <section className="mx-3 mb-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-3">
      <h2 className="text-sm font-semibold text-ink">实践 / 其他课程</h2>
      <p className="mt-0.5 text-[0.7rem] text-muted">{hint}</p>
      <ul className="mt-2 space-y-2">
        {courses.map((c) => {
          const room = extraRoomLabel(c.room)
          return (
            <li
              key={c.id}
              className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm"
            >
              <p className="font-medium text-ink">{c.name}</p>
              <p className="mt-0.5 text-[0.75rem] text-muted">
                {c.teacher} · {formatFooterWeeks(c.weeks, c.spanWeeks)}
                {room ? ` · ${room}` : ''}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function CloudIdPrompt({
  data,
  onSave,
}: {
  data: TimetablePayload
  onSave: (next: TimetablePayload) => void
}) {
  const remembered = loadCloudIdentity()
  const [studentId, setStudentId] = useState(
    data.studentId || remembered.studentId,
  )
  const [studentName, setStudentName] = useState(
    data.studentName || remembered.studentName,
  )
  return (
    <form
      className="mx-3 mt-2 rounded-xl border border-line bg-white px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({
          ...data,
          studentId: studentId.trim(),
          studentName: studentName.trim(),
        })
      }}
    >
      <p className="text-[0.7rem] leading-relaxed text-muted">
        PDF 未识别学号或姓名，补全后才能云端备份、找回。
      </p>
      <div className="mt-2 flex gap-1.5">
        <input
          name="username"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          required
          autoComplete="username"
          placeholder="学号"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-brand"
        />
        <input
          name="password"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="姓名"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-brand"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-brand px-2.5 py-1.5 text-[12px] font-semibold text-white"
        >
          备份
        </button>
      </div>
    </form>
  )
}

interface Props {
  data: TimetablePayload | null
  onUpdate?: (payload: TimetablePayload) => void
  onRestore?: (payload: TimetablePayload) => void
}

export function HomePage({ data, onUpdate, onRestore }: Props) {
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

  const studentName = data ? studentNameFromPayload(data) : ''
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
  const onApple = isApplePhoneOrPad()
  const standalone = isStandalonePwa()
  const onHuawei = isHuaweiOrHonor()
  const showIosSafariTip =
    onApple && !standalone && !!(data && data.courses.length > 0)
  const showIosStandaloneEmptyTip =
    onApple && standalone && (!data || data.courses.length === 0)
  const showHuaweiIncognitoTip =
    onHuawei && !standalone && (!data || data.courses.length === 0)
  const [cloudTip, setCloudTip] = useState<string | null>(() => {
    try {
      if (sessionStorage.getItem(RESTORED_TIP_KEY)) {
        return '建议添加到桌面，不要用无痕打开。'
      }
      if (sessionStorage.getItem(JUST_IMPORTED_KEY)) return 'imported'
    } catch {
      /* ignore */
    }
    return null
  })

  const importedBackupLine =
    cloudTip === 'imported' && data && canCloudBackup(data)
      ? `已备份云端 · 学号 ${data.studentId} · 姓名 ${data.studentName}`
      : cloudTip === 'imported'
        ? '课表已保存。填写学号和姓名后可备份到云端。'
        : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-1">
        <div className="min-w-0">
          <h1 className="font-display text-lg font-bold tracking-tight text-ink">
            {studentName ? `${studentName}的课表` : '川轻化课表助手'}
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

      {showIosSafariTip && (
        <div className="mx-3 mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[0.8rem] leading-relaxed text-amber-950">
          苹果手机：浏览器里的课表和「主屏幕」图标不共用。添加到桌面后，请用桌面图标打开再导入一次。
        </div>
      )}
      {showIosStandaloneEmptyTip && (
        <div className="mx-3 mt-2 rounded-xl border border-brand/25 bg-brand-soft px-3 py-2.5 text-[0.8rem] leading-relaxed text-brand-dark">
          请在此（桌面图标）导入课表，数据才会留在桌面打开的应用里。
        </div>
      )}
      {showHuaweiIncognitoTip && (
        <div className="mx-3 mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[0.8rem] leading-relaxed text-amber-950">
          华为：无痕窗口里加到桌面也留不住。请关掉无痕，用普通窗口打开后添加到桌面，再只点桌面图标导入。
        </div>
      )}
      {cloudTip && cloudTip !== 'imported' && (
        <div className="mx-3 mt-2 rounded-xl border border-brand/25 bg-brand-soft px-3 py-2.5 text-[0.8rem] leading-relaxed text-brand-dark">
          {cloudTip}
        </div>
      )}
      {importedBackupLine && (
        <div className="mx-3 mt-2 rounded-xl border border-brand/25 bg-brand-soft px-3 py-2.5 text-[0.8rem] leading-relaxed text-brand-dark">
          {importedBackupLine}
        </div>
      )}
      {data && data.courses.length > 0 && !canCloudBackup(data) && (
        <CloudIdPrompt
          data={data}
          onSave={(next) => {
            persist(next)
            setCloudTip('imported')
          }}
        />
      )}

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
              <ExtraCoursesBlock
                courses={extraCourses}
                hint="教务没写星期节次，只按周次列出，不会塞进课表格。"
              />
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
              <ExtraCoursesBlock
                courses={extraCourses}
                hint="没写星期节次，不进入上方课表格。"
              />
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
          <RestoreByName
            onRestored={(payload) => {
              setCloudTip('建议添加到桌面，不要用无痕打开。')
              saveTimetable(payload)
              ;(onRestore || onUpdate)?.(payload)
            }}
          />
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
