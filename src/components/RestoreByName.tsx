import { useState, type FormEvent } from 'react'
import {
  CLOUD_LOGIN_PASSWORD,
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
  const [account, setAccount] = useState(remembered.studentId)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const applySaved = (id: string) => {
    setAccount(id)
    setErr(null)
  }

  const onPickSaved = () => {
    if (remembered.studentId) applySaved(remembered.studentId)
  }

  const onFocusAccount = () => {
    if (account.trim()) return
    void pickCloudIdentityFromPasswordManager().then((picked) => {
      if (picked) applySaved(picked.studentId)
    })
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    const pwd = CLOUD_LOGIN_PASSWORD
    await rememberCloudIdentity(account, pwd)
    try {
      const res = await restoreStudentTimetable(account, pwd)
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
        须先成功导入过一次。账号=学号，密码固定 123456（不用改）。点账号可选已保存项，一点就填上。
      </p>
      {remembered.studentId ? (
        <button
          type="button"
          onClick={onPickSaved}
          className="mt-2 w-full rounded-xl border border-brand/25 bg-brand-soft px-3 py-2 text-left text-[0.75rem] leading-relaxed text-brand-dark"
        >
          使用已保存账号：{remembered.studentId}
        </button>
      ) : null}
      <label className="mt-2 block text-[0.7rem] text-muted">
        账号
        <input
          name="username"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          onFocus={onFocusAccount}
          required
          inputMode="numeric"
          autoComplete="username"
          placeholder="学号"
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        />
      </label>
      <label className="mt-1.5 block text-[0.7rem] text-muted">
        密码（固定，不用改）
        <input
          name="password"
          type="password"
          value={CLOUD_LOGIN_PASSWORD}
          readOnly
          autoComplete="current-password"
          className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none"
        />
      </label>
      {err && <p className="mt-1.5 text-xs text-expired">{err}</p>}
      <button
        type="submit"
        disabled={busy || !account.trim()}
        className="mt-2 w-full rounded-xl border border-line bg-surface py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
      >
        {busy ? '找回中…' : '找回课表'}
      </button>
    </form>
  )
}
