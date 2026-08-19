import { useState, type FormEvent } from 'react'
import {
  restoreErrorText,
  restoreStudentTimetable,
  JUST_IMPORTED_KEY,
  RESTORED_TIP_KEY,
} from '../lib/studentCloud'
import type { TimetablePayload } from '../types'

export function RestoreByName({
  onRestored,
}: {
  onRestored: (payload: TimetablePayload) => void
}) {
  const [studentId, setStudentId] = useState('')
  const [studentName, setStudentName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      const res = await restoreStudentTimetable(studentId, studentName)
      if (!res.ok) {
        setErr(restoreErrorText(res.error))
        return
      }
      onRestored(res.payload)
      try {
        sessionStorage.removeItem(JUST_IMPORTED_KEY)
        sessionStorage.setItem(RESTORED_TIP_KEY, '1')
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-5 w-full text-left">
      <p className="text-[0.7rem] leading-relaxed text-muted">
        须先成功导入过一次。开启无痕浏览后课表会丢失，可用学号和姓名找回。
      </p>
      <input
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
        required
        inputMode="numeric"
        autoComplete="username"
        placeholder="学号"
        className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
      />
      <input
        value={studentName}
        onChange={(e) => setStudentName(e.target.value)}
        required
        autoComplete="name"
        placeholder="姓名"
        className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
      />
      {err && <p className="mt-1.5 text-xs text-expired">{err}</p>}
      <button
        type="submit"
        disabled={busy || !studentId.trim() || !studentName.trim()}
        className="mt-2 w-full rounded-xl border border-line bg-surface py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
      >
        {busy ? '找回中…' : '找回课表'}
      </button>
    </form>
  )
}
