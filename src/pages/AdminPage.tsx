import { useEffect, useState, type FormEvent } from 'react'
import {
  adminChangePassword,
  adminLogin,
  clearAdminToken,
  fetchAdminStats,
  isAdminConfigured,
  readAdminToken,
  type AdminStats,
} from '../lib/adminApi'

function formatTime(iso: string): string {
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

function failMessage(meta: AdminStats['recentFails'][number]['meta']): string {
  if (!meta || typeof meta !== 'object') return '未知原因'
  const m = meta.message
  if (typeof m === 'string' && m.trim()) return m
  return '未知原因'
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
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState<string | null>(null)

  const loadStats = async () => {
    setStatsError(null)
    const res = await fetchAdminStats()
    if (!res.ok) {
      if (res.error === 'unauthorized') setToken(null)
      setStatsError(res.error === 'unauthorized' ? '请重新登录' : res.error)
      setStats(null)
      return
    }
    setStats(res.stats)
  }

  useEffect(() => {
    if (!token) return
    void loadStats()
  }, [token])

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
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5">
        <h1 className="font-display text-2xl font-bold text-ink">管理后台</h1>
        <p className="mt-3 text-sm text-muted leading-relaxed">
          尚未配置 Supabase。请按说明创建免费项目并填写环境变量后重新部署。
        </p>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5">
        <h1 className="font-display text-2xl font-bold text-ink">管理后台</h1>
        <p className="mt-1 text-sm text-muted">仅维护者登录，不在导航里展示。</p>
        <form onSubmit={onLogin} className="mt-6 space-y-3">
          <label className="block text-sm text-ink">
            账号
            <input
              type="text"
              autoComplete="username"
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
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
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {loginError && (
            <p className="text-sm text-red-600">{loginError}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">管理后台</h1>
          <p className="mt-1 text-sm text-muted">匿名用量与解析失败（不含 PDF）</p>
        </div>
        <button
          type="button"
          className="shrink-0 text-sm text-muted underline"
          onClick={() => {
            clearAdminToken()
            setToken(null)
            setStats(null)
          }}
        >
          退出
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void loadStats()}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink"
        >
          刷新数据
        </button>
      </div>

      {statsError && (
        <p className="mt-3 text-sm text-red-600">{statsError}</p>
      )}

      {stats && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            ['独立访客', stats.visitors],
            ['近7日访客', stats.visitors7d],
            ['打开次数', stats.pageTotal],
            ['近7日打开', stats.page7d],
            ['导入成功', stats.importTotal],
            ['近7日导入', stats.import7d],
            ['解析失败', stats.failTotal],
            ['近7日失败', stats.fail7d],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-2xl border border-line bg-white/90 px-3 py-3"
            >
              <div className="text-xs text-muted">{label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-ink">
                {Number(value).toLocaleString('zh-CN')}
              </div>
            </div>
          ))}
        </div>
      )}

      {stats && stats.recentFails.length > 0 && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-ink">最近解析失败</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-white/90">
            {stats.recentFails.map((ev, i) => (
              <li key={`${ev.created_at}-f-${i}`} className="px-3 py-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 break-words text-ink leading-relaxed">
                    {failMessage(ev.meta)}
                  </span>
                  <span className="shrink-0 text-muted tabular-nums">
                    {formatTime(ev.created_at)}
                  </span>
                </div>
                {typeof ev.meta?.fileName === 'string' && ev.meta.fileName && (
                  <div className="mt-1 text-muted">文件：{ev.meta.fileName}</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats && stats.recent.length > 0 && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-ink">最近动态</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-white/90">
            {stats.recent.map((ev, i) => (
              <li
                key={`${ev.created_at}-${i}`}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <span className="text-ink">{kindLabel(ev.kind)}</span>
                <span className="text-muted tabular-nums">
                  {formatTime(ev.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-line bg-white/90 p-4">
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
                pwMsg === '密码已更新' ? 'text-brand' : 'text-red-600'
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
  )
}
