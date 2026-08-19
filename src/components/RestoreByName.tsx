import { useState, type FormEvent } from 'react'
import {
  restoreErrorText,
  restoreStudentTimetable,
  loadCloudIdentity,
  rememberCloudIdentity,
  pickCloudIdentityFromPasswordManager,
  JUST_IMPORTED_KEY,
  RESTORED_TIP_KEY,
} from '../lib/studentCloud'
import type { TimetablePayload } from '../types'

export function RestoreByName({
  onRestored,
}: {
  onRestored: (payload: TimetablePayload) => void
}) {
  const remembered = loadCloudIdentity()
  const [studentId, setStudentId] = useState(remembered.studentId)
  const [studentName, setStudentName] = useState(remembered.studentName)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const applySaved = (id: string, name: string) => {
    setStudentId(id)
    setStudentName(name)
    setErr(null)
  }

  const onPickSaved = () => {
    if (remembered.studentId || remembered.studentName) {
      applySaved(remembered.studentId, remembered.studentName)
    }
  }

  const onFocusStudentId = () => {
    if (studentId.trim()) return
    void pickCloudIdentityFromPasswordManager().then((picked) => {
      if (picked) applySaved(picked.studentId, picked.studentName)
    })
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    await rememberCloudIdentity(studentId, studentName)
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
    <form
      onSubmit={(e) => void onSubmit(e)}
      autoComplete="on"
      className="mt-5 w-full text-left"
    >
      <p className="text-[0.7rem] leading-relaxed text-muted">
        须先成功导入过一次。点学号框可选已保存账号，会连姓名一起填上（和后台记住密码一样）。无痕里也可点选浏览器已保存的学号。
      </p>
      {(remembered.studentId || remembered.studentName) && (
        <button
          type="button"
          onClick={onPickSaved}
          className="mt-2 w-full rounded-xl border border-brand/25 bg-brand-soft px-3 py-2 text-left text-[0.75rem] leading-relaxed text-brand-dark"
        >
          使用已保存：{remembered.studentId || '学号'} ·{' '}
          {remembered.studentName || '姓名'}
        </button>
      )}
      <input
        name="username"
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
        onFocus={onFocusStudentId}
        required
        inputMode="numeric"
        autoComplete="username"
        placeholder="学号"
        className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
      />
      <input
        name="password"
        type="text"
        value={studentName}
        onChange={(e) => setStudentName(e.target.value)}
        required
        autoComplete="current-password"
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
