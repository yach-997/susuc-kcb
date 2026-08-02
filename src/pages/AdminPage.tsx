import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  adminChangePassword,
  adminLogin,
  clearAdminToken,
  downloadEventPdf,
  fetchAdminFeedback,
  fetchAdminVisitors,
  fetchDayReport,
  isAdminConfigured,
  readAdminToken,
  setFeedbackStatus,
  type AdminEvent,
  type AdminVisitor,
  type DayReport,
  type FeedbackItem,
} from '../lib/adminApi'
import { anonVisitorLabel } from '../lib/anonId'

type Section = 'daily' | 'users' | 'feedback' | 'account'
type DayTab = 'fails' | 'imports' | 'all'

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function shiftDay(isoDay: string, delta: number): string {
  const [y, m, d] = isoDay.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function formatDayLabel(isoDay: string): string {
  const [y, m, d] = isoDay.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const week = ['日', '一', '二', '三', '四', '五', '六'][dt.getDay()]
  return `${m}月${d}日 周${week}`
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function kindLabel(kind: string): string {
  if (kind === 'import') return '导入成功'
  if (kind === 'import_fail') return '解析失败'
  return '打开页面'
}

function kindTone(kind: string): string {
  if (kind === 'import') return 'bg-emerald-50 text-emerald-800'
  if (kind === 'import_fail') return 'bg-rose-50 text-rose-800'
  return 'bg-slate-100 text-slate-700'
}

function failMessage(meta: AdminEvent['meta']): string {
  if (!meta || typeof meta !== 'object') return '未知原因'
  const m = meta.message
  if (typeof m === 'string' && m.trim()) return m
  return '未知原因'
}

function storagePathOf(ev: AdminEvent): string | null {
  const p = ev.meta?.storagePath
  return typeof p === 'string' && p ? p : null
}

function EventRow({
  ev,
  showDetail,
}: {
  ev: AdminEvent
  showDetail?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [tip, setTip] = useState<string | null>(null)
  const fileName =
    typeof ev.meta?.fileName === 'string' ? ev.meta.fileName : null
  const courseCount =
    typeof ev.meta?.courseCount === 'number' ? ev.meta.courseCount : null
  const termLabel =
    typeof ev.meta?.termLabel === 'string' ? ev.meta.termLabel : null
  const path = storagePathOf(ev)
  const canDownload =
    (ev.kind === 'import' || ev.kind === 'import_fail') && !!path

  return (
    <li className="px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${kindTone(ev.kind)}`}
        >
          {kindLabel(ev.kind)}
        </span>
        <span className="text-[11px] tabular-nums text-muted">
          {formatTime(ev.created_at)}
        </span>
        <span className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-muted">
          {anonVisitorLabel(ev.visitor_id)}
        </span>
      </div>
      {showDetail && ev.kind === 'import_fail' && (
        <p className="mt-1.5 text-sm leading-relaxed text-ink">
          {failMessage(ev.meta)}
        </p>
      )}
      {showDetail && ev.kind === 'import' && (
        <p className="mt-1.5 text-sm text-ink">
          {courseCount != null ? `${courseCount} 门课` : '导入成功'}
          {termLabel ? ` · ${termLabel}` : ''}
        </p>
      )}
      {fileName && (
        <p className="mt-1 break-all text-xs text-muted" title={fileName}>
          {fileName}
        </p>
      )}
      {(ev.kind === 'import' || ev.kind === 'import_fail') && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {canDownload ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                setTip(null)
                void downloadEventPdf(ev).then((res) => {
                  setBusy(false)
                  if (!res.ok) setTip(res.error)
                })
              }}
              className="rounded-lg bg-ink px-3 py-1.5 text-[11px] font-medium text-white transition active:opacity-80 disabled:opacity-50"
            >
              {busy ? '准备中…' : '下载 PDF'}
            </button>
          ) : (
            <span className="rounded-lg bg-surface px-2.5 py-1.5 text-[11px] text-muted">
              {typeof ev.meta?.uploadError === 'string'
                ? '上传失败（无附件）'
                : '无 PDF 附件'}
            </span>
          )}
          {tip && <span className="text-[11px] text-rose-600">{tip}</span>}
        </div>
      )}
    </li>
  )
}

function DatePickerCard({
  day,
  days,
  onChangeDay,
  onChangeDays,
}: {
  day: string
  days: number
  onChangeDay: (d: string) => void
  onChangeDays: (n: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isToday = day === todayLocal()
  const is30 = days === 30

  return (
    <div className="mt-4 overflow-hidden rounded-3xl border border-line/80 bg-white/90 p-3 shadow-[0_10px_36px_-28px_rgba(20,35,30,0.5)]">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          aria-label="前一天"
          disabled={is30}
          className="flex h-12 w-11 shrink-0 items-center justify-center rounded-2xl border border-line text-lg text-ink disabled:opacity-35"
          onClick={() => onChangeDay(shiftDay(day, -1))}
        >
          ‹
        </button>
        <button
          type="button"
          className="relative min-w-0 flex-1 rounded-2xl bg-surface px-2 py-2 text-center"
          onClick={() => {
            if (is30) onChangeDays(1)
            const el = inputRef.current
            if (!el) return
            try {
              el.showPicker?.()
            } catch {
              /* ignore */
            }
            el.focus()
            el.click()
          }}
        >
          <div className="truncate text-sm font-semibold text-ink">
            {is30 ? '近 30 天' : formatDayLabel(day)}
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-muted">
            {is30
              ? `${shiftDay(day, -29).replace(/-/g, '/')} — ${day.replace(/-/g, '/')}`
              : `${day.replace(/-/g, '/')} · 点此选日期`}
          </div>
          <input
            ref={inputRef}
            type="date"
            value={day}
            max={todayLocal()}
            onChange={(e) => {
              if (e.target.value) {
                onChangeDays(1)
                onChangeDay(e.target.value)
              }
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="选择日期"
          />
        </button>
        <button
          type="button"
          aria-label="后一天"
          disabled={is30 || day >= todayLocal()}
          className="flex h-12 w-11 shrink-0 items-center justify-center rounded-2xl border border-line text-lg text-ink disabled:opacity-35"
          onClick={() => onChangeDay(shiftDay(day, 1))}
        >
          ›
        </button>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => {
            onChangeDays(1)
            onChangeDay(todayLocal())
          }}
          className={`rounded-full py-1.5 text-[11px] font-medium ${
            !is30 && isToday ? 'bg-brand/12 text-brand' : 'bg-surface text-muted'
          }`}
        >
          今天
        </button>
        <button
          type="button"
          onClick={() => {
            onChangeDays(1)
            onChangeDay(shiftDay(todayLocal(), -1))
          }}
          className={`rounded-full py-1.5 text-[11px] font-medium ${
            !is30 && day === shiftDay(todayLocal(), -1)
              ? 'bg-brand/12 text-brand'
              : 'bg-surface text-muted'
          }`}
        >
          昨天
        </button>
        <button
          type="button"
          onClick={() => {
            onChangeDay(todayLocal())
            onChangeDays(30)
          }}
          className={`rounded-full py-1.5 text-[11px] font-medium ${
            is30
              ? 'bg-brand/12 text-brand'
              : 'border border-line text-ink'
          }`}
        >
          近30天
        </button>
      </div>
    </div>
  )
}

export function AdminPage() {
  const configured = isAdminConfigured()
  const [token, setToken] = useState<string | null>(() => readAdminToken())
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [section, setSection] = useState<Section>('daily')

  const [day, setDay] = useState(todayLocal)
  const [days, setDays] = useState(1)
  const [report, setReport] = useState<DayReport | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [dayTab, setDayTab] = useState<DayTab>('fails')

  const [userDay, setUserDay] = useState(todayLocal)
  const [userDays, setUserDays] = useState(1)
  const [visitors, setVisitors] = useState<AdminVisitor[]>([])
  const [visitorTotal, setVisitorTotal] = useState(0)
  const [visitorError, setVisitorError] = useState<string | null>(null)

  const [fbDay, setFbDay] = useState(todayLocal)
  const [fbDays, setFbDays] = useState(1)
  const [fbStatus, setFbStatus] = useState<'all' | 'new' | 'read' | 'done'>('all')
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [feedbackNew, setFeedbackNew] = useState(0)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState<string | null>(null)

  const loadDay = useCallback(async (d: string, span: number) => {
    setReportLoading(true)
    setReportError(null)
    try {
      const res = await fetchDayReport(d, span)
      if (!res.ok) {
        if (res.error === 'unauthorized') setToken(null)
        setReportError(
          res.error === 'unauthorized'
            ? '请重新登录'
            : res.error.includes('admin_day_report') ||
                res.error.includes('Could not find')
              ? '请先在 Supabase 重新执行 supabase/admin_uploads.sql'
              : res.error,
        )
        setReport(null)
        return
      }
      setReport(res.report)
    } finally {
      setReportLoading(false)
    }
  }, [])

  const loadVisitors = useCallback(async (d: string, span: number) => {
    setVisitorError(null)
    const res = await fetchAdminVisitors({ day: d, days: span })
    if (!res.ok) {
      if (res.error === 'unauthorized') setToken(null)
      setVisitorError(res.error)
      setVisitors([])
      return
    }
    setVisitors(res.visitors)
    setVisitorTotal(res.total)
  }, [])

  const loadFeedback = useCallback(
    async (d: string, span: number, status: string) => {
      setFeedbackError(null)
      const res = await fetchAdminFeedback({
        day: d,
        days: span,
        status: status === 'all' ? null : status,
      })
      if (!res.ok) {
        if (res.error === 'unauthorized') setToken(null)
        setFeedbackError(res.error)
        setFeedback([])
        return
      }
      setFeedback(res.items)
      setFeedbackNew(res.newCount)
    },
    [],
  )

  useEffect(() => {
    if (!token || section !== 'daily') return
    void loadDay(day, days)
  }, [token, section, day, days, loadDay])

  useEffect(() => {
    if (!token || section !== 'users') return
    void loadVisitors(userDay, userDays)
  }, [token, section, userDay, userDays, loadVisitors])

  useEffect(() => {
    if (!token || section !== 'feedback') return
    void loadFeedback(fbDay, fbDays, fbStatus)
  }, [token, section, fbDay, fbDays, fbStatus, loadFeedback])

  // 角标：登录后拉一次今日新反馈数
  useEffect(() => {
    if (!token) return
    void fetchAdminFeedback({
      day: todayLocal(),
      days: 30,
      status: 'new',
    }).then((res) => {
      if (res.ok) setFeedbackNew(res.newCount)
    })
  }, [token])

  const list = useMemo(() => {
    if (!report) return [] as AdminEvent[]
    if (dayTab === 'fails') return report.fails
    if (dayTab === 'imports') return report.imports
    return report.events
  }, [report, dayTab])

  const onLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setBusy(true)
    try {
      const res = await adminLogin(username, password)
      if (!res.ok) {
        setLoginError(res.error)
        return
      }
      setPassword('')
      setToken(readAdminToken())
    } finally {
      setBusy(false)
    }
  }

  const onChangePw = async (e: FormEvent) => {
    e.preventDefault()
    setPwMsg(null)
    setBusy(true)
    try {
      const res = await adminChangePassword(oldPw, newPw)
      if (!res.ok) {
        setPwMsg(res.error)
        return
      }
      setOldPw('')
      setNewPw('')
      setPwMsg('密码已更新')
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-5">
        <h1 className="font-display text-2xl font-bold text-ink">管理后台</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          尚未配置 Supabase。请填写环境变量后重新部署。
        </p>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="relative flex-1 overflow-y-auto px-4 pb-8 pt-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 20% -10%, rgba(45,122,98,0.14), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 10%, rgba(20,35,30,0.06), transparent 50%)',
          }}
        />
        <div className="relative mx-auto w-full max-w-sm">
          <p className="text-xs font-medium tracking-wide text-brand">
            SUSUC · ADMIN
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink">
            管理后台
          </h1>
          <p className="mt-2 text-sm text-muted">仅维护者登录，不在导航展示。</p>
          <form
            onSubmit={onLogin}
            className="mt-8 space-y-3 rounded-3xl border border-line/80 bg-white/90 p-5 shadow-[0_12px_40px_-24px_rgba(20,35,30,0.45)]"
          >
            <label className="block text-sm text-ink">
              账号
              <input
                type="text"
                autoComplete="username"
                className="mt-1.5 w-full rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm text-ink">
              密码
              <input
                type="password"
                autoComplete="current-password"
                className="mt-1.5 w-full rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {loginError && <p className="text-sm text-rose-600">{loginError}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? '登录中…' : '进入后台'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex-1 overflow-y-auto pb-10">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-56"
        style={{
          background:
            'linear-gradient(180deg, rgba(45,122,98,0.12) 0%, transparent 100%)',
        }}
      />

      <div className="relative px-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.14em] text-brand">
              OPS
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-ink">
              管理后台
            </h1>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full border border-line bg-white/80 px-3 py-1.5 text-xs text-muted"
            onClick={() => {
              clearAdminToken()
              setToken(null)
              setReport(null)
            }}
          >
            退出
          </button>
        </div>

        <nav className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-surface p-1">
          {(
            [
              ['daily', '每日'],
              ['users', '用户'],
              ['feedback', '反馈'],
              ['account', '账号'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={`relative rounded-xl px-1 py-2 text-xs font-medium transition ${
                section === key
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-muted'
              }`}
            >
              {label}
              {key === 'feedback' && feedbackNew > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-[1rem] rounded-full bg-rose-500 px-1 text-[10px] leading-4 text-white">
                  {feedbackNew > 9 ? '9+' : feedbackNew}
                </span>
              )}
            </button>
          ))}
        </nav>

        {section === 'daily' && (
          <>
            <DatePickerCard
              day={day}
              days={days}
              onChangeDay={setDay}
              onChangeDays={setDays}
            />

            {reportError && (
              <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {reportError}
              </p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ['打开', report?.pageCount, 'from-slate-50 to-white'],
                ['成功', report?.importCount, 'from-emerald-50 to-white'],
                ['失败', report?.failCount, 'from-rose-50 to-white'],
              ].map(([label, value, accent]) => (
                <div
                  key={String(label)}
                  className={`rounded-2xl border border-line/70 bg-gradient-to-b ${accent} px-3 py-3`}
                >
                  <div className="text-[11px] text-muted">{label}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                    {reportLoading && report == null ? '—' : Number(value ?? 0)}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex gap-1 rounded-2xl bg-surface p-1">
              {(
                [
                  ['fails', '解析失败', report?.failCount],
                  ['imports', '解析成功', report?.importCount],
                  ['all', '全部动态', report?.events.length],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDayTab(key)}
                  className={`min-w-0 flex-1 rounded-xl px-1.5 py-2 text-[11px] font-medium transition ${
                    dayTab === key
                      ? 'bg-white text-ink shadow-sm'
                      : 'text-muted'
                  }`}
                >
                  <span className="block truncate">{label}</span>
                  <span className="tabular-nums opacity-70">{count ?? 0}</span>
                </button>
              ))}
            </div>

            <section className="mt-3 overflow-hidden rounded-3xl border border-line/80 bg-white/95">
              {reportLoading && !report ? (
                <p className="px-4 py-10 text-center text-sm text-muted">
                  加载中…
                </p>
              ) : list.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted">
                  这一天暂无
                  {dayTab === 'fails'
                    ? '解析失败'
                    : dayTab === 'imports'
                      ? '解析成功'
                      : '动态'}
                </p>
              ) : (
                <ul className="divide-y divide-line/70">
                  {list.map((ev, i) => (
                    <EventRow
                      key={`${ev.id ?? ev.created_at}-${i}`}
                      ev={ev}
                      showDetail={dayTab !== 'all' || ev.kind !== 'page'}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {section === 'users' && (
          <section className="mt-0">
            <DatePickerCard
              day={userDay}
              days={userDays}
              onChangeDay={setUserDay}
              onChangeDays={setUserDays}
            />
            <div className="mt-3 rounded-3xl border border-line/80 bg-white/95 p-4">
              <p className="text-xs text-muted">
                {userDays === 30 ? '近 30 天匿名访客' : '当日匿名访客'}
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">
                {visitorTotal}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                稳定匿名号（如 访客·A3F2），同一设备始终同号。
              </p>
            </div>
            {visitorError && (
              <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {visitorError}
              </p>
            )}
            <ul className="mt-3 divide-y divide-line/70 overflow-hidden rounded-3xl border border-line/80 bg-white/95">
              {visitors.length === 0 && !visitorError ? (
                <li className="px-4 py-10 text-center text-sm text-muted">
                  该时段暂无访客
                </li>
              ) : (
                visitors.map((v) => (
                  <li key={v.visitor_id} className="px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {anonVisitorLabel(v.visitor_id)}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted">
                        {formatDateTime(v.last_seen)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted">
                      <span className="rounded-md bg-surface px-1.5 py-0.5">
                        打开 {v.page_count}
                      </span>
                      <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
                        成功 {v.import_count}
                      </span>
                      <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-rose-800">
                        失败 {v.fail_count}
                      </span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        )}

        {section === 'feedback' && (
          <section className="mt-0">
            <DatePickerCard
              day={fbDay}
              days={fbDays}
              onChangeDay={setFbDay}
              onChangeDays={setFbDays}
            />
            <div className="mt-3 flex gap-1 rounded-2xl bg-surface p-1">
              {(
                [
                  ['all', '全部'],
                  ['new', '新'],
                  ['read', '已读'],
                  ['done', '完成'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFbStatus(key)}
                  className={`flex-1 rounded-xl py-2 text-[11px] font-medium ${
                    fbStatus === key
                      ? 'bg-white text-ink shadow-sm'
                      : 'text-muted'
                  }`}
                >
                  {label}
                  {key === 'new' && feedbackNew > 0 ? ` ${feedbackNew}` : ''}
                </button>
              ))}
            </div>
            {feedbackError && (
              <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {feedbackError}
              </p>
            )}
            <ul className="mt-3 space-y-2">
              {feedback.length === 0 && !feedbackError ? (
                <li className="rounded-3xl border border-line/80 bg-white px-4 py-10 text-center text-sm text-muted">
                  该时段暂无反馈
                </li>
              ) : (
                feedback.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-3xl border border-line/80 bg-white/95 px-3.5 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          item.status === 'new'
                            ? 'bg-rose-50 text-rose-700'
                            : item.status === 'done'
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.status === 'new'
                          ? '新'
                          : item.status === 'done'
                            ? '已完成'
                            : '已读'}
                      </span>
                      <span className="text-[11px] text-muted">
                        {anonVisitorLabel(item.visitor_id)}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                      {item.content}
                    </p>
                    {item.contact && (
                      <p className="mt-1 text-xs text-muted">
                        联系：{item.contact}
                      </p>
                    )}
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {item.status === 'new' && (
                        <button
                          type="button"
                          className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink"
                          onClick={() => {
                            void setFeedbackStatus(item.id, 'read').then(() =>
                              loadFeedback(fbDay, fbDays, fbStatus),
                            )
                          }}
                        >
                          标为已读
                        </button>
                      )}
                      {item.status !== 'done' && (
                        <button
                          type="button"
                          className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-medium text-white"
                          onClick={() => {
                            void setFeedbackStatus(item.id, 'done').then(() =>
                              loadFeedback(fbDay, fbDays, fbStatus),
                            )
                          }}
                        >
                          处理完成
                        </button>
                      )}
                      {item.status === 'done' && (
                        <button
                          type="button"
                          className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-muted"
                          onClick={() => {
                            void setFeedbackStatus(item.id, 'new').then(() =>
                              loadFeedback(fbDay, fbDays, fbStatus),
                            )
                          }}
                        >
                          重开
                        </button>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        )}

        {section === 'account' && (
          <section className="mt-4 rounded-3xl border border-line/80 bg-white/90 p-4">
            <h2 className="text-sm font-semibold text-ink">修改密码</h2>
            <form onSubmit={onChangePw} className="mt-3 space-y-3">
              <label className="block text-xs text-muted">
                旧密码
                <input
                  type="password"
                  className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                  value={oldPw}
                  onChange={(e) => setOldPw(e.target.value)}
                  required
                />
              </label>
              <label className="block text-xs text-muted">
                新密码（至少 6 位）
                <input
                  type="password"
                  className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  minLength={6}
                  required
                />
              </label>
              {pwMsg && (
                <p
                  className={`text-sm ${
                    pwMsg === '密码已更新' ? 'text-brand' : 'text-rose-600'
                  }`}
                >
                  {pwMsg}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                保存新密码
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}
