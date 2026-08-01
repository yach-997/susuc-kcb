import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  adminChangePassword,
  adminLogin,
  clearAdminToken,
  downloadEventPdf,
  fetchAdminStats,
  fetchDayReport,
  isAdminConfigured,
  readAdminToken,
  type AdminEvent,
  type AdminStats,
  type DayReport,
} from '../lib/adminApi'

type TabKey = 'fails' | 'imports' | 'all'

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

function hasPdf(ev: AdminEvent): boolean {
  return typeof ev.meta?.storagePath === 'string' && !!ev.meta.storagePath
}

async function openPdf(ev: AdminEvent): Promise<void> {
  const url = await downloadEventPdf(ev)
  if (!url) {
    window.alert('暂无 PDF 或链接已失效（需先执行 admin_uploads.sql）')
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

function EventRow({
  ev,
  showDetail,
}: {
  ev: AdminEvent
  showDetail?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const fileName =
    typeof ev.meta?.fileName === 'string' ? ev.meta.fileName : null
  const courseCount =
    typeof ev.meta?.courseCount === 'number' ? ev.meta.courseCount : null
  const termLabel =
    typeof ev.meta?.termLabel === 'string' ? ev.meta.termLabel : null

  return (
    <li className="px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${kindTone(ev.kind)}`}
            >
              {kindLabel(ev.kind)}
            </span>
            <span className="text-[11px] tabular-nums text-muted">
              {formatTime(ev.created_at)}
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
            <p className="mt-1 truncate text-xs text-muted" title={fileName}>
              {fileName}
            </p>
          )}
        </div>
        {hasPdf(ev) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void openPdf(ev).finally(() => setBusy(false))
            }}
            className="shrink-0 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-ink/90 disabled:opacity-50"
          >
            {busy ? '…' : '下载 PDF'}
          </button>
        )}
      </div>
    </li>
  )
}

export function AdminPage() {
  const configured = isAdminConfigured()
  const [token, setToken] = useState<string | null>(() => readAdminToken())
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [day, setDay] = useState(todayLocal)
  const [report, setReport] = useState<DayReport | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [tab, setTab] = useState<TabKey>('fails')
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

  useEffect(() => {
    if (!token) return
    void loadStats()
  }, [token, loadStats])

  useEffect(() => {
    if (!token) return
    void loadDay(day)
  }, [token, day, loadDay])

  const list = useMemo(() => {
    if (!report) return [] as AdminEvent[]
    if (tab === 'fails') return report.fails
    if (tab === 'imports') return report.imports
    return report.events
  }, [report, tab])

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
          <p className="text-xs font-medium tracking-wide text-brand">SUSUC · ADMIN</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink">
            管理后台
          </h1>
          <p className="mt-2 text-sm text-muted">仅维护者登录，不在导航展示。</p>
          <form
            onSubmit={onLogin}
            className="mt-8 space-y-3 rounded-3xl border border-line/80 bg-white/90 p-5 shadow-[0_12px_40px_-24px_rgba(20,35,30,0.45)] backdrop-blur"
          >
            <label className="block text-sm text-ink">
              账号
              <input
                type="text"
                autoComplete="username"
                className="mt-1.5 w-full rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
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
                className="mt-1.5 w-full rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {loginError && <p className="text-sm text-rose-600">{loginError}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-brand py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60"
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
          <div>
            <p className="text-[11px] font-medium tracking-[0.14em] text-brand">
              DAILY OPS
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-ink">
              每日情况
            </h1>
          </div>
          <button
            type="button"
            className="rounded-full border border-line bg-white/80 px-3 py-1.5 text-xs text-muted backdrop-blur transition hover:text-ink"
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

        {/* 日期选择 */}
        <div className="mt-5 rounded-3xl border border-line/80 bg-white/90 p-3.5 shadow-[0_10px_36px_-28px_rgba(20,35,30,0.5)] backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="前一天"
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-line text-ink transition hover:bg-surface"
              onClick={() => setDay((d) => shiftDay(d, -1))}
            >
              ‹
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="text-sm font-semibold text-ink">
                {formatDayLabel(day)}
              </div>
              <input
                type="date"
                value={day}
                max={todayLocal()}
                onChange={(e) => {
                  if (e.target.value) setDay(e.target.value)
                }}
                className="mt-1 w-full max-w-[11rem] rounded-lg border-0 bg-transparent text-center text-xs text-muted outline-none"
              />
            </div>
            <button
              type="button"
              aria-label="后一天"
              disabled={day >= todayLocal()}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-line text-ink transition hover:bg-surface disabled:opacity-35"
              onClick={() => setDay((d) => shiftDay(d, 1))}
            >
              ›
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setDay(todayLocal())}
              className="rounded-full bg-brand/10 px-3 py-1 text-[11px] font-medium text-brand"
            >
              今天
            </button>
            <button
              type="button"
              onClick={() => setDay((d) => shiftDay(d, -1))}
              className="rounded-full bg-surface px-3 py-1 text-[11px] font-medium text-muted"
            >
              昨天
            </button>
            <button
              type="button"
              onClick={() => {
                void loadStats()
                void loadDay(day)
              }}
              className="rounded-full border border-line px-3 py-1 text-[11px] font-medium text-ink"
            >
              刷新
            </button>
          </div>
        </div>

        {reportError && (
          <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {reportError}
          </p>
        )}
        {statsError && !reportError && (
          <p className="mt-3 text-sm text-rose-600">{statsError}</p>
        )}

        {/* 当日指标 */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            {
              label: '打开',
              value: report?.pageCount,
              accent: 'from-slate-50 to-white',
            },
            {
              label: '成功',
              value: report?.importCount,
              accent: 'from-emerald-50 to-white',
            },
            {
              label: '失败',
              value: report?.failCount,
              accent: 'from-rose-50 to-white',
            },
          ].map((c) => (
            <div
              key={c.label}
              className={`rounded-2xl border border-line/70 bg-gradient-to-b ${c.accent} px-3 py-3`}
            >
              <div className="text-[11px] text-muted">{c.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">
                {reportLoading && report == null ? '—' : (c.value ?? 0)}
              </div>
            </div>
          ))}
        </div>

        {/* 分类 Tab */}
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
              onClick={() => setTab(key)}
              className={`flex-1 rounded-xl px-2 py-2 text-xs font-medium transition ${
                tab === key
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {label}
              <span className="ml-1 tabular-nums opacity-70">
                {count ?? 0}
              </span>
            </button>
          ))}
        </div>

        <section className="mt-3 overflow-hidden rounded-3xl border border-line/80 bg-white/95 shadow-[0_10px_36px_-28px_rgba(20,35,30,0.45)]">
          {reportLoading && !report ? (
            <p className="px-4 py-10 text-center text-sm text-muted">加载中…</p>
          ) : list.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">
              这一天暂无
              {tab === 'fails' ? '解析失败' : tab === 'imports' ? '解析成功' : '动态'}
            </p>
          ) : (
            <ul className="divide-y divide-line/70">
              {list.map((ev, i) => (
                <EventRow
                  key={`${ev.id ?? ev.created_at}-${i}`}
                  ev={ev}
                  showDetail={tab !== 'all' || ev.kind !== 'page'}
                />
              ))}
            </ul>
          )}
        </section>

        {/* 累计概览 */}
        {stats && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-ink">累计概览</h2>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                ['独立访客', stats.visitors],
                ['近7日访客', stats.visitors7d],
                ['累计打开', stats.pageTotal],
                ['近7日打开', stats.page7d],
                ['累计成功', stats.importTotal],
                ['近7日成功', stats.import7d],
                ['累计失败', stats.failTotal],
                ['近7日失败', stats.fail7d],
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

        <section className="mt-6 rounded-3xl border border-line/80 bg-white/90 p-4">
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
      </div>
    </div>
  )
}
