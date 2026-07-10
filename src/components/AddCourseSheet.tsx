import { useEffect, useMemo, useState } from 'react'
import type { Course } from '../types'
import {
  SECTION_TIME_RANGES,
  WEEKDAY_LABELS,
  uid,
} from '../lib/storage'

interface Props {
  open: boolean
  /** 当前教学周，用于「本周 / 下周」快捷 */
  currentWeek: number | null
  /** 编辑已有自加课时传入 */
  editing?: Course | null
  onClose: () => void
  onSave: (course: Course) => void
  onDelete?: (id: string) => void
}

type WeekMode = 'this' | 'next' | 'custom' | 'range'

function parseSingleWeek(weeks: string): number | null {
  if (/[-~至]/.test(weeks)) return null
  const m = weeks.match(/(\d+)/)
  return m ? Number(m[1]) : null
}

export function AddCourseSheet({
  open,
  currentWeek,
  editing,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const baseWeek = currentWeek && currentWeek >= 1 ? currentWeek : 1

  const [name, setName] = useState('')
  const [teacher, setTeacher] = useState('')
  const [room, setRoom] = useState('')
  const [weekday, setWeekday] = useState(1)
  const [startSection, setStartSection] = useState(1)
  const [endSection, setEndSection] = useState(1)
  const [weekMode, setWeekMode] = useState<WeekMode>('next')
  const [customWeek, setCustomWeek] = useState(baseWeek + 1)
  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState(16)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setTeacher(editing.teacher || '')
      setRoom(editing.room || '')
      setWeekday(editing.weekday)
      setStartSection(editing.startSection)
      setEndSection(editing.endSection)
      const single = parseSingleWeek(editing.weeks)
      if (single != null) {
        if (single === baseWeek) setWeekMode('this')
        else if (single === baseWeek + 1) setWeekMode('next')
        else {
          setWeekMode('custom')
          setCustomWeek(single)
        }
      } else {
        const range = editing.weeks.match(/(\d+)\s*[-~至]\s*(\d+)/)
        setWeekMode('range')
        if (range) {
          setRangeStart(Number(range[1]))
          setRangeEnd(Number(range[2]))
        }
      }
      setError(null)
      return
    }
    setName('')
    setTeacher('')
    setRoom('')
    setWeekday(((new Date().getDay() + 6) % 7) + 1)
    setStartSection(8)
    setEndSection(8)
    setWeekMode('next')
    setCustomWeek(baseWeek + 1)
    setRangeStart(1)
    setRangeEnd(16)
    setError(null)
  }, [open, editing, baseWeek])

  const resolvedWeekLabel = useMemo(() => {
    if (weekMode === 'this') return `仅第 ${baseWeek} 周`
    if (weekMode === 'next') return `仅第 ${baseWeek + 1} 周`
    if (weekMode === 'custom') return `仅第 ${customWeek} 周`
    return `第 ${rangeStart}-${rangeEnd} 周每周`
  }, [weekMode, baseWeek, customWeek, rangeStart, rangeEnd])

  if (!open) return null

  const submit = () => {
    const n = name.trim()
    if (!n) {
      setError('请填写课程名称')
      return
    }
    let start = Math.min(startSection, endSection)
    let end = Math.max(startSection, endSection)
    start = Math.min(Math.max(start, 1), 11)
    end = Math.min(Math.max(end, 1), 11)

    let weeks = String(baseWeek + 1)
    if (weekMode === 'this') weeks = String(baseWeek)
    else if (weekMode === 'next') weeks = String(baseWeek + 1)
    else if (weekMode === 'custom') {
      const w = Math.min(Math.max(Number(customWeek) || 1, 1), 30)
      weeks = String(w)
    } else {
      const a = Math.min(Math.max(Number(rangeStart) || 1, 1), 30)
      const b = Math.min(Math.max(Number(rangeEnd) || a, 1), 30)
      weeks = `${Math.min(a, b)}-${Math.max(a, b)}`
    }

    onSave({
      id: editing?.id || uid(),
      name: n,
      teacher: teacher.trim(),
      room: room.trim() || '待定',
      weekday,
      startSection: start,
      endSection: end,
      weeks,
      weekParity: 'all',
      source: 'manual',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-white p-4 pb-8 shadow-xl animate-slide-up sm:rounded-3xl sm:pb-5">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h2 className="text-lg font-bold text-ink">
          {editing ? '编辑自加课程' : '加一节课'}
        </h2>
        <p className="mt-1 text-sm text-muted leading-relaxed">
          适合补课、调课。例如：老师说下周二第 8 节来上 → 选「下周」+「二」+「8」。
        </p>

        <label className="mt-4 block text-sm font-medium text-ink">
          课程名称
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
            placeholder="例如：高等数学（补课）"
            autoFocus
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium text-ink">
            老师（选填）
            <input
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
              placeholder="张老师"
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            教室（选填）
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
              placeholder="N1-101"
            />
          </label>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium text-ink">哪一周？</div>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {(
              [
                ['this', '本周'],
                ['next', '下周'],
                ['custom', '指定周'],
                ['range', '每周'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setWeekMode(mode)}
                className={`rounded-xl py-2 text-xs font-semibold transition ${
                  weekMode === mode
                    ? 'bg-brand text-white'
                    : 'border border-line bg-surface text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {weekMode === 'custom' && (
            <label className="mt-2 flex items-center gap-2 text-sm text-ink">
              第
              <input
                type="number"
                min={1}
                max={30}
                value={customWeek}
                onChange={(e) => setCustomWeek(Number(e.target.value))}
                className="w-16 rounded-lg border border-line bg-surface px-2 py-1.5 text-center outline-none focus:border-brand"
              />
              周
            </label>
          )}
          {weekMode === 'range' && (
            <div className="mt-2 flex items-center gap-2 text-sm text-ink">
              第
              <input
                type="number"
                min={1}
                max={30}
                value={rangeStart}
                onChange={(e) => setRangeStart(Number(e.target.value))}
                className="w-14 rounded-lg border border-line bg-surface px-2 py-1.5 text-center outline-none focus:border-brand"
              />
              –
              <input
                type="number"
                min={1}
                max={30}
                value={rangeEnd}
                onChange={(e) => setRangeEnd(Number(e.target.value))}
                className="w-14 rounded-lg border border-line bg-surface px-2 py-1.5 text-center outline-none focus:border-brand"
              />
              周
            </div>
          )}
          <p className="mt-1 text-[0.7rem] text-muted">{resolvedWeekLabel}</p>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium text-ink">星期几？</div>
          <div className="mt-1.5 grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((label, i) => {
              const day = i + 1
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setWeekday(day)}
                  className={`rounded-xl py-2 text-sm font-bold transition ${
                    weekday === day
                      ? 'bg-brand text-white'
                      : 'border border-line bg-surface text-ink'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium text-ink">第几节？</div>
          <p className="text-[0.7rem] text-muted">点两下可选连堂：先点开始节，再点结束节</p>
          <div className="mt-1.5 grid grid-cols-6 gap-1.5">
            {Array.from({ length: 11 }, (_, i) => i + 1).map((sec) => {
              const inRange =
                sec >= Math.min(startSection, endSection) &&
                sec <= Math.max(startSection, endSection)
              const time = SECTION_TIME_RANGES[sec]?.split('-')[0]
              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => {
                    if (startSection === endSection && sec !== startSection) {
                      setEndSection(sec)
                    } else {
                      setStartSection(sec)
                      setEndSection(sec)
                    }
                  }}
                  className={`rounded-xl py-1.5 text-center transition ${
                    inRange
                      ? 'bg-brand text-white'
                      : 'border border-line bg-surface text-ink'
                  }`}
                >
                  <div className="text-sm font-bold">{sec}</div>
                  <div
                    className={`text-[0.55rem] ${inRange ? 'text-white/80' : 'text-muted'}`}
                  >
                    {time}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-expired">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          className="mt-4 w-full rounded-xl bg-brand px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-brand/20"
        >
          {editing ? '保存修改' : '加到课表'}
        </button>

        {editing && onDelete && (
          <button
            type="button"
            onClick={() => {
              if (confirm('删除这节自加的课？')) onDelete(editing.id)
            }}
            className="mt-2 w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-expired"
          >
            删除这节课
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink"
        >
          取消
        </button>
      </div>
    </div>
  )
}
