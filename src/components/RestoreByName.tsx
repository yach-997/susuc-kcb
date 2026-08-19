import { useState, type FormEvent } from 'react'
import {
  CLOUD_LOGIN_PASSWORD,
  restoreErrorText,
  restoreStudentTimetable,
  loadCloudIdentity,
  rememberCloudIdentity,
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
  const [password, setPassword] = useState(
    remembered.password || CLOUD_LOGIN_PASSWORD,
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    const pwd = password.trim() || CLOUD_LOGIN_PASSWORD
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
      method="post"
      action="/"
      onSubmit={(e) => void onSubmit(e)}
      autoComplete="on"
      className="mt-5 w-full text-left"
    >
      <p className="text-[0.7rem] leading-relaxed text-muted">
        须先成功导入过一次。账号填学号，密码填 123456。浏览器可记住，下次点账号选已保存项即可。
      </p>
      <label className="mt-2 block text-[0.7rem] text-muted">
        账号
        <input
          id="username"
          name="username"
          type="text"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          required
          inputMode="numeric"
          autoComplete="username"
          placeholder="学号"
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        />
      </label>
      <label className="mt-1.5 block text-[0.7rem] text-muted">
        密码
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="123456"
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        />
      </label>
      {err && <p className="mt-1.5 text-xs text-expired">{err}</p>}
      <button
        type="submit"
        disabled={busy || !account.trim() || !password.trim()}
        className="mt-2 w-full rounded-xl border border-line bg-surface py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
      >
        {busy ? '找回中…' : '找回课表'}
      </button>
    </form>
  )
}
