import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import {
  adminChangePassword,
  adminLogin,
  clearAdminEvents,
  clearAdminToken,
  clearRememberedCreds,
  downloadEventPdf,
  fetchAdminFeedback,
  fetchAdminVisitors,
  fetchDayReport,
  isAdminConfigured,
  readAdminToken,
  readRememberedCreds,
  saveRememberedCreds,
  setFeedbackStatus,
  type AdminEvent,
  type AdminVisitor,
  type DayReport,
  type FeedbackItem,
} from '../lib/adminApi'
import { anonVisitorLabel } from '../lib/anonId'

type Section = 'daily' | 'users' | 'feedback' | 'account'
type DayTab = 'fails' | 'imports' | 'all'

/** 与 SQL Asia/Shanghai 对齐，避免日期边界错位 */
function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
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
  const summary =
    ev.kind === 'import_fail'
      ? failMessage(ev.meta)
      : ev.kind === 'import'
        ? [
            courseCount != null ? `${courseCount} 门课` : '导入成功',
            termLabel,
          ]
            .filter(Boolean)
            .join(' · ')
        : null

  return (
    <li className="px-3.5 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${kindTone(ev.kind)}`}
            >
              {kindLabel(ev.kind)}
            </span>
            <span className="text-sm tabular-nums text-muted">
              {formatTime(ev.created_at)}
            </span>
            <span className="text-sm text-muted">
              {anonVisitorLabel(ev.visitor_id)}
            </span>
          </div>
          {showDetail && summary && (
            <p className="mt-1.5 line-clamp-3 text-base leading-snug text-ink">
              {summary}
            </p>
          )}
          {fileName && (
            <p className="mt-1 truncate text-sm text-muted" title={fileName}>
              {fileName}
            </p>
          )}
          {tip && <p className="mt-1 text-sm text-rose-600">{tip}</p>}
        </div>
        {(ev.kind === 'import' || ev.kind === 'import_fail') && (
          <div className="shrink-0 pt-0.5">
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
                className="rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink disabled:opacity-50"
              >
                {busy ? '…' : 'PDF'}
              </button>
            ) : (
              <span className="block max-w-[5rem] text-right text-xs leading-snug text-muted">
                {typeof ev.meta?.uploadError === 'string'
                  ? '上传失败'
                  : '无附件'}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

function parseIsoDay(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

function toIsoDay(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function monthCells(y: number, m: number): Array<number | null> {
  const first = new Date(y, m - 1, 1)
  const startPad = first.getDay() // 0=周日
  const daysInMonth = new Date(y, m, 0).getDate()
  const cells: Array<number | null> = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/** 自绘日历，避免华为等浏览器原生 date 弹层被裁切 */
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
  const [open, setOpen] = useState(false)
  const parsed = parseIsoDay(day)
  const [viewY, setViewY] = useState(parsed.y)
  const [viewM, setViewM] = useState(parsed.m)
  const isToday = day === todayLocal()
  const is30 = days === 30
  const today = todayLocal()
  const todayParts = parseIsoDay(today)
  const cells = monthCells(viewY, viewM)
  const canNextMonth =
    viewY < todayParts.y ||
    (viewY === todayParts.y && viewM < todayParts.m)

  const openSheet = () => {
    const p = parseIsoDay(day)
    setViewY(p.y)
    setViewM(p.m)
    if (is30) onChangeDays(1)
    setOpen(true)
  }

  const shiftMonth = (delta: number) => {
    const dt = new Date(viewY, viewM - 1 + delta, 1)
    setViewY(dt.getFullYear())
    setViewM(dt.getMonth() + 1)
  }

  return (
    <div className="mt-3 rounded-2xl border border-line/80 bg-white px-2.5 py-2">
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          aria-label="前一天"
          disabled={is30}
          className="flex h-11 w-10 shrink-0 items-center justify-center rounded-xl border border-line text-base text-ink disabled:opacity-35"
          onClick={() => onChangeDay(shiftDay(day, -1))}
        >
          ‹
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 rounded-xl bg-surface px-2 py-1.5 text-center"
          onClick={openSheet}
        >
          <div className="truncate text-base font-semibold text-ink">
            {is30 ? '近 30 天' : formatDayLabel(day)}
          </div>
          <div className="text-xs tabular-nums text-muted">
            {is30
              ? `${shiftDay(day, -29).slice(5)} — ${day.slice(5)}`
              : '点选日期'}
          </div>
        </button>
        <button
          type="button"
          aria-label="后一天"
          disabled={is30 || day >= today}
          className="flex h-11 w-10 shrink-0 items-center justify-center rounded-xl border border-line text-base text-ink disabled:opacity-35"
          onClick={() => onChangeDay(shiftDay(day, 1))}
        >
          ›
        </button>
      </div>
      <div className="mt-2 flex gap-1">
        {(
          [
            {
              key: 'today',
              label: '今天',
              active: !is30 && isToday,
              onClick: () => {
                onChangeDays(1)
                onChangeDay(todayLocal())
              },
            },
            {
              key: 'yesterday',
              label: '昨天',
              active: !is30 && day === shiftDay(todayLocal(), -1),
              onClick: () => {
                onChangeDays(1)
                onChangeDay(shiftDay(todayLocal(), -1))
              },
            },
            {
              key: 'd30',
              label: '近30天',
              active: is30,
              onClick: () => {
                onChangeDay(todayLocal())
                onChangeDays(30)
              },
            },
          ] as const
        ).map((btn) => (
          <button
            key={btn.key}
            type="button"
            onClick={btn.onClick}
            className={`flex-1 rounded-lg py-1 text-sm font-semibold transition ${
              btn.active
                ? 'bg-brand text-white'
                : 'bg-surface text-muted'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="选择日期"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-ink"
                aria-label="上一月"
                onClick={() => shiftMonth(-1)}
              >
                ‹
              </button>
              <div className="text-sm font-semibold text-ink">
                {viewY}年{viewM}月
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-ink disabled:opacity-35"
                aria-label="下一月"
                disabled={!canNextMonth}
                onClick={() => shiftMonth(1)}
              >
                ›
              </button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-sm text-muted">
              {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (d == null) {
                  return <div key={`e-${i}`} className="h-10" />
                }
                const iso = toIsoDay(viewY, viewM, d)
                const disabled = iso > today
                const selected = !is30 && iso === day
                const isTodayCell = iso === today
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChangeDays(1)
                      onChangeDay(iso)
                      setOpen(false)
                    }}
                    className={`h-10 rounded-xl text-sm tabular-nums transition disabled:opacity-25 ${
                      selected
                        ? 'bg-brand font-semibold text-white'
                        : isTodayCell
                          ? 'bg-brand/10 font-medium text-brand'
                          : 'text-ink hover:bg-surface'
                    }`}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-2xl border border-line py-2.5 text-sm text-muted"
                onClick={() => setOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="flex-1 rounded-2xl bg-brand py-2.5 text-sm font-semibold text-white"
                onClick={() => {
                  onChangeDays(1)
                  onChangeDay(todayLocal())
                  setOpen(false)
                }}
              >
                回到今天
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function AdminPage() {
  const configured = isAdminConfigured()
  const remembered = readRememberedCreds()
  const [token, setToken] = useState<string | null>(() => readAdminToken())
  const [username, setUsername] = useState(remembered?.username || 'admin')
  const [password, setPassword] = useState(remembered?.password || '')
  const [remember, setRemember] = useState(() => !!remembered)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [section, setSection] = useState<Section>('daily')

  const [day, setDay] = useState(todayLocal)
  const [days, setDays] = useState(1)
  const [report, setReport] = useState<DayReport | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [dayTab, setDayTab] = useState<DayTab>('fails')
  const [clearBusy, setClearBusy] = useState(false)
  const [clearMsg, setClearMsg] = useState<string | null>(null)
  /** 页内二次确认（避免手机浏览器 confirm 无响应） */
  const [clearArmed, setClearArmed] = useState<'range' | 'all' | null>(null)

  const [userDay, setUserDay] = useState(todayLocal)
  const [userDays, setUserDays] = useState(1)
  const [visitors, setVisitors] = useState<AdminVisitor[]>([])
  const [visitorTotal, setVisitorTotal] = useState(0)
  const [visitorError, setVisitorError] = useState<string | null>(null)
  const [visitorLoading, setVisitorLoading] = useState(false)

  const [fbDay, setFbDay] = useState(todayLocal)
  const [fbDays, setFbDays] = useState(1)
  const [fbStatus, setFbStatus] = useState<'all' | 'new' | 'read' | 'done'>('all')
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [feedbackNew, setFeedbackNew] = useState(0)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)

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
    setVisitorLoading(true)
    setVisitorError(null)
    try {
      const res = await fetchAdminVisitors({ day: d, days: span })
      if (!res.ok) {
        if (res.error === 'unauthorized') setToken(null)
        setVisitorError(res.error)
        setVisitors([])
        return
      }
      setVisitors(res.visitors)
      setVisitorTotal(res.total)
    } finally {
      setVisitorLoading(false)
    }
  }, [])

  const refreshFeedbackBadge = useCallback(async () => {
    const res = await fetchAdminFeedback({
      day: todayLocal(),
      days: 30,
      status: 'new',
    })
    if (res.ok) setFeedbackNew(res.newCount)
  }, [])

  const loadFeedback = useCallback(
    async (d: string, span: number, status: string) => {
      setFeedbackLoading(true)
      setFeedbackError(null)
      try {
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
        // 列表里的 newCount 受日期筛选影响；角标单独用近30天
        void refreshFeedbackBadge()
      } finally {
        setFeedbackLoading(false)
      }
    },
    [refreshFeedbackBadge],
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

  // 角标固定：近 30 天未处理，不随日期筛选跳动
  useEffect(() => {
    if (!token) return
    void refreshFeedbackBadge()
  }, [token, refreshFeedbackBadge])

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
      if (remember) {
        saveRememberedCreds(username, password)
      } else {
        clearRememberedCreds()
        setPassword('')
      }
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
      // 若勾选过记住密码，同步更新本地记住的新密码
      if (readRememberedCreds()) {
        saveRememberedCreds(username || 'admin', newPw)
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
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-line accent-brand"
              />
              记住账号密码（本机）
            </label>
            {loginError && <p className="text-sm text-rose-600">{loginError}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? '登录中…' : '进入后台'}
            </button>
            <p className="text-center text-sm leading-relaxed text-muted">
              登录后约 30 天内免重复登录；退出不会清除记住的账号。
            </p>
          </form>
        </div>
      </div>
    )
  }

  const runClear = (all: boolean) => {
    setClearBusy(true)
    setClearMsg(all ? '正在清空全部…' : '正在清理此时段…')
    void clearAdminEvents(all ? { all: true } : { day, days, all: false })
      .then((res) => {
        if (!res.ok) {
          setClearMsg(res.error)
          return
        }
        setClearMsg(
          all
            ? `已清空全部：${res.eventCount} 条，${res.pdfCount} 个 PDF`
            : `已清理 ${res.eventCount} 条，${res.pdfCount} 个 PDF`,
        )
        void loadDay(day, days)
      })
      .catch((e: unknown) => {
        setClearMsg(e instanceof Error ? e.message : '清理失败')
      })
      .finally(() => {
        setClearBusy(false)
        setClearArmed(null)
      })
  }

  return (
    <div className="flex-1 overflow-y-auto pb-8">
      <div className="px-3.5 pt-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold text-ink">管理后台</h1>
          <button
            type="button"
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted"
            onClick={() => {
              clearAdminToken()
              setToken(null)
              setReport(null)
            }}
          >
            退出
          </button>
        </div>

        <nav className="mt-3 grid grid-cols-4 gap-0.5 rounded-xl bg-surface p-0.5">
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
              className={`relative rounded-xl px-1 py-2.5 text-sm font-semibold transition ${
                section === key ? 'bg-white text-ink' : 'text-muted'
              }`}
            >
              {label}
              {key === 'feedback' && feedbackNew > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-[0.9rem] rounded-full bg-rose-500 px-1 text-xs leading-tight text-white">
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
              <p className="mt-2 rounded-xl bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
                {reportError}
              </p>
            )}

            <div className="mt-3 flex items-baseline justify-between gap-2 px-0.5 text-sm text-muted">
              <span>
                打开{' '}
                <span className="font-semibold tabular-nums text-ink">
                  {reportLoading && report == null
                    ? '—'
                    : (report?.pageCount ?? 0)}
                </span>
                <span className="mx-1.5 text-line">·</span>
                成功{' '}
                <span className="font-semibold tabular-nums text-emerald-800">
                  {report?.importCount ?? 0}
                </span>
                <span className="mx-1.5 text-line">·</span>
                失败{' '}
                <span className="font-semibold tabular-nums text-rose-700">
                  {report?.failCount ?? 0}
                </span>
              </span>
              {reportLoading && report && (
                <span className="text-xs">刷新中</span>
              )}
            </div>

            <div className="mt-2 flex gap-1 rounded-xl border border-line/80 bg-white p-0.5">
              {(
                [
                  ['fails', '失败', report?.failCount],
                  ['imports', '成功', report?.importCount],
                  ['all', '全部', report?.events.length],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDayTab(key)}
                  className={`min-w-0 flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
                    dayTab === key
                      ? 'bg-brand text-white'
                      : 'text-muted'
                  }`}
                >
                  {label}{' '}
                  <span className="tabular-nums opacity-80">{count ?? 0}</span>
                </button>
              ))}
            </div>

            <section className="mt-2 overflow-hidden rounded-2xl border border-line/80 bg-white">
              {reportLoading && !report ? (
                <p className="px-3 py-8 text-center text-xs text-muted">
                  加载中…
                </p>
              ) : list.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted">
                  暂无
                  {dayTab === 'fails'
                    ? '失败'
                    : dayTab === 'imports'
                      ? '成功'
                      : '动态'}
                </p>
              ) : (
                <ul className="divide-y divide-line/60">
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
          <section>
            <DatePickerCard
              day={userDay}
              days={userDays}
              onChangeDay={setUserDay}
              onChangeDays={setUserDays}
            />
            <p className="mt-2 px-0.5 text-sm text-muted">
              匿名访客{' '}
              <span className="text-base font-semibold tabular-nums text-ink">
                {visitorTotal}
              </span>
              <span className="ml-1.5 text-xs">同设备同号</span>
            </p>
            {visitorError && (
              <p className="mt-2 rounded-xl bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
                {visitorError}
              </p>
            )}
            <ul className="mt-2 divide-y divide-line/60 overflow-hidden rounded-2xl border border-line/80 bg-white">
              {visitorLoading && visitors.length === 0 ? (
                <li className="px-3 py-8 text-center text-xs text-muted">
                  加载中…
                </li>
              ) : visitors.length === 0 && !visitorError ? (
                <li className="px-3 py-8 text-center text-xs text-muted">
                  暂无访客
                </li>
              ) : (
                visitors.map((v) => (
                  <li key={v.visitor_id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-semibold text-ink">
                        {anonVisitorLabel(v.visitor_id)}
                      </span>
                      <span className="text-xs tabular-nums text-muted">
                        {formatDateTime(v.last_seen)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      打开 {v.page_count}
                      <span className="mx-1 text-line">·</span>
                      成功 {v.import_count}
                      <span className="mx-1 text-line">·</span>
                      失败 {v.fail_count}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </section>
        )}

        {section === 'feedback' && (
          <section>
            <DatePickerCard
              day={fbDay}
              days={fbDays}
              onChangeDay={setFbDay}
              onChangeDays={setFbDays}
            />
            <div className="mt-2 flex gap-1 rounded-xl border border-line/80 bg-white p-0.5">
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
                  className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${
                    fbStatus === key ? 'bg-brand text-white' : 'text-muted'
                  }`}
                >
                  {label}
                  {key === 'new' && feedbackNew > 0 ? ` ${feedbackNew}` : ''}
                </button>
              ))}
            </div>
            {feedbackError && (
              <p className="mt-2 rounded-xl bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
                {feedbackError}
              </p>
            )}
            <ul className="mt-2 space-y-1.5">
              {feedbackLoading && feedback.length === 0 ? (
                <li className="rounded-2xl border border-line/80 bg-white px-3 py-8 text-center text-xs text-muted">
                  加载中…
                </li>
              ) : feedback.length === 0 && !feedbackError ? (
                <li className="rounded-2xl border border-line/80 bg-white px-3 py-8 text-center text-xs text-muted">
                  暂无反馈
                </li>
              ) : (
                feedback.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-line/80 bg-white px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
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
                            ? '完成'
                            : '已读'}
                      </span>
                      <span className="text-sm text-muted">
                        {anonVisitorLabel(item.visitor_id)}
                      </span>
                      <span className="text-xs tabular-nums text-muted">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-snug text-ink">
                      {item.content}
                    </p>
                    {item.contact && (
                      <p className="mt-0.5 text-sm text-muted">
                        联系：{item.contact}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.status === 'new' && (
                        <button
                          type="button"
                          className="rounded-lg border border-line px-2 py-1 text-sm text-ink"
                          onClick={() => {
                            void setFeedbackStatus(item.id, 'read').then(() =>
                              loadFeedback(fbDay, fbDays, fbStatus),
                            )
                          }}
                        >
                          已读
                        </button>
                      )}
                      {item.status !== 'done' && (
                        <button
                          type="button"
                          className="rounded-lg bg-brand px-2 py-1 text-sm font-medium text-white"
                          onClick={() => {
                            void setFeedbackStatus(item.id, 'done').then(() =>
                              loadFeedback(fbDay, fbDays, fbStatus),
                            )
                          }}
                        >
                          完成
                        </button>
                      )}
                      {item.status === 'done' && (
                        <button
                          type="button"
                          className="rounded-lg border border-line px-2 py-1 text-sm text-muted"
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
          <section className="mt-3 space-y-3">
            <div className="rounded-2xl border border-line/80 bg-white p-3.5">
              <h2 className="text-base font-semibold text-ink">修改密码</h2>
              <form onSubmit={onChangePw} className="mt-2.5 space-y-2.5">
                <label className="block text-sm text-muted">
                  旧密码
                  <input
                    type="password"
                    className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                    value={oldPw}
                    onChange={(e) => setOldPw(e.target.value)}
                    required
                  />
                </label>
                <label className="block text-sm text-muted">
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
                    className={`text-xs ${
                      pwMsg === '密码已更新' ? 'text-brand' : 'text-rose-600'
                    }`}
                  >
                    {pwMsg}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-brand px-3.5 py-2 text-[15px] font-semibold text-white disabled:opacity-60"
                >
                  保存
                </button>
              </form>
            </div>

            <details className="rounded-2xl border border-dashed border-line bg-surface/60 open:bg-white open:pb-2.5">
              <summary className="cursor-pointer list-none px-3 py-2 text-sm text-muted [&::-webkit-details-marker]:hidden">
                高级 · 清理动态与 PDF
              </summary>
              <div className="border-t border-line/50 px-3 pt-2">
                <p className="text-sm leading-relaxed text-muted">
                  不可恢复。此时段 =「每日」页当前所选日期/近30天。
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {clearArmed == null && (
                    <>
                      <button
                        type="button"
                        disabled={clearBusy}
                        className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink disabled:opacity-50"
                        onClick={() => {
                          setClearArmed('range')
                          setClearMsg(
                            `将清理「${days === 30 ? '近 30 天' : formatDayLabel(day)}」，再点确认。`,
                          )
                        }}
                      >
                        清理此时段
                      </button>
                      <button
                        type="button"
                        disabled={clearBusy}
                        className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-sm text-rose-700 disabled:opacity-50"
                        onClick={() => {
                          setClearArmed('all')
                          setClearMsg('将清空全部历史，再点确认。')
                        }}
                      >
                        清理全部
                      </button>
                    </>
                  )}
                  {clearArmed != null && (
                    <>
                      <button
                        type="button"
                        disabled={clearBusy}
                        className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                        onClick={() => runClear(clearArmed === 'all')}
                      >
                        {clearBusy
                          ? '清理中…'
                          : clearArmed === 'all'
                            ? '确认清空全部'
                            : '确认清理此时段'}
                      </button>
                      <button
                        type="button"
                        disabled={clearBusy}
                        className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-muted disabled:opacity-50"
                        onClick={() => {
                          setClearArmed(null)
                          setClearMsg(null)
                        }}
                      >
                        取消
                      </button>
                    </>
                  )}
                </div>
                {clearMsg && (
                  <p
                    className={`mt-2 text-sm ${
                      clearMsg.startsWith('已')
                        ? 'text-brand'
                        : clearMsg.startsWith('正在') ||
                            clearMsg.startsWith('将')
                          ? 'text-muted'
                          : 'text-rose-600'
                    }`}
                  >
                    {clearMsg}
                  </p>
                )}
              </div>
            </details>
          </section>
        )}
      </div>
    </div>
  )
}
