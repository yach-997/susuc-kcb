import { useState, type FormEvent } from 'react'
import {
  CLOUD_LOGIN_PASSWORD,
  restoreErrorText,
  restoreStudentTimetable,
  readRememberedCloudCreds,
  saveRememberedCloudCreds,
  clearRememberedCloudCreds,
  loadCloudIdentity,
  rememberCloudIdentity,
  pickCloudIdentityFromPasswordManager,
  looksLikeStudentId,
  JUST_IMPORTED_KEY,
  RESTORED_TIP_KEY,
} from '../lib/studentCloud'
import type { TimetablePayload } from '../types'

export function RestoreByName({
  onRestored,
}: {
  onRestored: (payload: TimetablePayload) => void
}) {
  const saved = readRememberedCloudCreds()
  const identity = loadCloudIdentity()
  const [account, setAccount] = useState(
    saved?.studentId ||
      (looksLikeStudentId(identity.studentId) ? identity.studentId : ''),
  )
  const [password, setPassword] = useState(
    saved?.password ?? CLOUD_LOGIN_PASSWORD,
  )
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const fillSaved = () => {
    const creds = readRememberedCloudCreds()
    if (!creds) return
    setAccount(creds.studentId)
    setPassword(creds.password)
    setRemember(true)
  }

  const pickFromPasswordManager = async () => {
    const picked = await pickCloudIdentityFromPasswordManager()
    if (!picked) return
    setAccount(picked.studentId)
    setPassword(picked.password)
    setRemember(true)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!looksLikeStudentId(account)) {
      setErr('账号请填学号，不要选后台 admin')
      return
    }
    setBusy(true)
    const pwd = password.trim() || CLOUD_LOGIN_PASSWORD
    try {
      const res = await restoreStudentTimetable(account, pwd)
      if (!res.ok) {
        setErr(restoreErrorText(res.error))
        return
      }
      if (remember) {
        saveRememberedCloudCreds(account, pwd)
        await rememberCloudIdentity(account, pwd)
      } else {
        clearRememberedCloudCreds()
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
        须先成功导入过一次。账号填学号，密码填 123456。勾选「记住账号密码」后找回成功会保存到本机。
      </p>
      {saved && (
        <button
          type="button"
          onClick={fillSaved}
          className="mt-1.5 text-[0.7rem] font-medium text-brand underline-offset-2 hover:underline"
        >
          填入已保存账号：{saved.studentId}
        </button>
      )}
      <label className="mt-2 block text-[0.7rem] text-muted">
        账号
        <input
          id="kcb-student-id"
          name="kcb-student-id"
          type="text"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          required
          inputMode="numeric"
          autoComplete="section-kcb username"
          placeholder="学号"
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        />
      </label>
      <label className="mt-1.5 block text-[0.7rem] text-muted">
        密码
        <input
          id="kcb-password"
          name="kcb-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="section-kcb current-password"
          placeholder="123456"
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        />
      </label>
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-[0.7rem] text-muted">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-4 w-4 rounded border-line accent-brand"
        />
        记住账号密码（本机）
      </label>
      {err && <p className="mt-1.5 text-xs text-expired">{err}</p>}
      <button
        type="submit"
        disabled={busy || !account.trim() || !password.trim()}
        className="mt-2 w-full rounded-xl border border-line bg-surface py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
      >
        {busy ? '找回中…' : '找回课表'}
      </button>
      <button
        type="button"
        onClick={() => void pickFromPasswordManager()}
        className="mt-1.5 w-full text-center text-[0.7rem] text-muted underline-offset-2 hover:text-brand hover:underline"
      >
        从密码库选择已保存账号
      </button>
    </form>
  )
}
