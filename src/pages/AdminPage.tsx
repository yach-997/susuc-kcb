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
  fetchAdminStats,
  fetchAdminVisitors,
  fetchDayReport,
  isAdminConfigured,
  readAdminToken,
  setFeedbackStatus,
  type AdminEvent,
  type AdminStats,
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
              无 PDF 附件
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
  onChange,
  onRefresh,
}: {
  day: string
  onChange: (d: string) => void
  onRefresh: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isToday = day === todayLocal()

  return (
    <div className="mt-4 overflow-hidden rounded-3xl border border-line/80 bg-white/90 p-3 shadow-[0_10px_36px_-28px_rgba(20,35,30,0.5)]">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          aria-label="前一天"
          className="flex h-12 w-11 shrink-0 items-center justify-center rounded-2xl border border-line text-lg text-ink"
          onClick={() => onChange(shiftDay(day, -1))}
        >
          ‹
        </button>
        <button
          type="button"
          className="relative min-w-0 flex-1 rounded-2xl bg-surface px-2 py-2 text-center"
          onClick={() => {
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
            {formatDayLabel(day)}
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-muted">
            {day.replace(/-/g, '/')} · 点此选日期
          </div>
          <input
            ref={inputRef}
            type="date"
            value={day}
            max={todayLocal()}
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value)
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="选择日期"
          />
        </button>
        <button
          type="button"
          aria-label="后一天"
          disabled={day >= todayLocal()}
          className="flex h-12 w-11 shrink-0 items-center justify-center rounded-2xl border border-line text-lg text-ink disabled:opacity-35"
          onClick={() => onChange(shiftDay(day, 1))}
        >
          ›
        </button>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onChange(todayLocal())}
          className={`rounded-full py-1.5 text-[11px] font-medium ${
            isToday ? 'bg-brand/12 text-brand' : 'bg-surface text-muted'
          }`}
        >
          今天
        </button>
        <button
          type="button"
          onClick={() => onChange(shiftDay(todayLocal(), -1))}
          className="rounded-full bg-surface py-1.5 text-[11px] font-medium text-muted"
        >
          昨天
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-full border border-line py-1.5 text-[11px] font-medium text-ink"
        >
          刷新
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

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [day, setDay] = useState(todayLocal)
  const [report, setReport] = useState<DayReport | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [dayTab, setDayTab] = useState<DayTab>('fails')

  const [visitors, setVisitors] = useState<AdminVisitor[]>([])
  const [visitorTotal, setVisitorTotal] = useState(0)
  const [visitorError, setVisitorError] = useState<string | null>(null)

  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [feedbackNew, setFeedbackNew] = useState(0)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setStatsError(null)
    const res = await fetchAdminStats()
    if (!res.ok) {
      if (res.error === 'unauthorized') setToken(null)
      setStatsError(res.error === 'unauthorized' ? '请重新登录' : res.error)
      setStats(null)
      return
    }
    setStats(res.stats)
  }, [])

  const loadDay = useCallback(async (d: string) => {
    setReportLoading(true)
    setReportError(null)
    try {
      const res = await fetchDayReport(d)
      if (!res.ok) {
        if (res.error === 'unauthorized') setToken(null)
        setReportError(
          res.error === 'unauthorized'
            ? '请重新登录'
            : res.error.includes('admin_day_report') ||
                res.error.includes('Could not find')
              ? '请先在 Supabase 执行 supabase/admin_uploads.sql'
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

  const loadVisitors = useCallback(async () => {
    setVisitorError(null)
    const res = await fetchAdminVisitors()
    if (!res.ok) {
      if (res.error === 'unauthorized') setToken(null)
      setVisitorError(res.error)
      setVisitors([])
      return
    }
    setVisitors(res.visitors)
    setVisitorTotal(res.total)
  }, [])

  const loadFeedback = useCallback(async () => {
    setFeedbackError(null)
    const res = await fetchAdminFeedback()
    if (!res.ok) {
      if (res.error === 'unauthorized') setToken(null)
      setFeedbackError(res.error)
      setFeedback([])
      return
    }
    setFeedback(res.items)
    setFeedbackNew(res.newCount)
  }, [])

  useEffect(() => {
    if (!token) return
    void loadStats()
    void loadFeedback()
  }, [token, loadStats, loadFeedback])

  useEffect(() => {
    if (!token || section !== 'daily') return
    void loadDay(day)
  }, [token, section, day, loadDay])

  useEffect(() => {
    if (!token || section !== 'users') return
    void loadVisitors()
  }, [token, section, loadVisitors])

  useEffect(() => {
    if (!token || section !== 'feedback') return
    void loadFeedback()
  }, [token, section, loadFeedback])

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
              setStats(null)
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
              onChange={setDay}
              onRefresh={() => {
                void loadStats()
                void loadDay(day)
              }}
            />

            {reportError && (
              <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {reportError}
              </p>
            )}
            {statsError && !reportError && (
              <p className="mt-3 text-sm text-rose-600">{statsError}</p>
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

            {stats && (
              <section className="mt-6">
                <h2 className="text-sm font-semibold text-ink">累计概览</h2>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    ['独立访客', stats.visitors],
                    ['近7日访客', stats.visitors7d],
                    ['累计成功', stats.importTotal],
                    ['累计失败', stats.failTotal],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="rounded-2xl border border-line/70 bg-white/80 px-3 py-2.5"
                    >
                      <div className="text-[11px] text-muted">{label}</div>
                      <div className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
                        {Number(value).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {section === 'users' && (
          <section className="mt-4">
            <div className="rounded-3xl border border-line/80 bg-white/95 p-4">
              <p className="text-xs text-muted">匿名访客（设备随机 ID）</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">
                {visitorTotal}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                显示为稳定匿名号（如 访客·A3F2），不暴露真实标识；同一设备始终同一号，便于对照失败记录。
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
                  暂无访客数据
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
          <section className="mt-4">
            <div className="rounded-3xl border border-line/80 bg-white/95 p-4">
              <p className="text-xs text-muted">待处理反馈</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">
                {feedbackNew}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                来自设置页「使用问题反馈」，可直接在此闭环处理。
              </p>
              <button
                type="button"
                onClick={() => void loadFeedback()}
                className="mt-3 rounded-full border border-line px-3 py-1 text-[11px] font-medium text-ink"
              >
                刷新
              </button>
            </div>
            {feedbackError && (
              <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {feedbackError}
              </p>
            )}
            <ul className="mt-3 space-y-2">
              {feedback.length === 0 && !feedbackError ? (
                <li className="rounded-3xl border border-line/80 bg-white px-4 py-10 text-center text-sm text-muted">
                  暂无反馈
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
                              loadFeedback(),
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
                              loadFeedback(),
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
                              loadFeedback(),
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
