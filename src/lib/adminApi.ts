import { getSupabase, isSupabaseConfigured } from './supabase'

const TOKEN_KEY = 'susuc-admin-token'

export type AdminEvent = {
  kind: string
  visitor_id: string | null
  created_at: string
  meta?: { message?: string; fileName?: string; [k: string]: unknown } | null
}

export type AdminStats = {
  pageTotal: number
  importTotal: number
  failTotal: number
  page7d: number
  import7d: number
  fail7d: number
  visitors: number
  visitors7d: number
  recent: AdminEvent[]
  recentFails: AdminEvent[]
}

export function isAdminConfigured(): boolean {
  return isSupabaseConfigured()
}

export function readAdminToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function clearAdminToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

function saveAdminToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* ignore */
  }
}

export async function adminLogin(
  username: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: '未配置 Supabase' }
  const { data, error } = await sb.rpc('admin_login', {
    p_username: username.trim(),
    p_password: password,
  })
  if (error) return { ok: false, error: error.message }
  const row = data as { ok?: boolean; token?: string; error?: string } | null
  if (!row?.ok || !row.token) {
    return {
      ok: false,
      error: row?.error === 'invalid_password' ? '账号或密码错误' : '登录失败',
    }
  }
  saveAdminToken(row.token)
  return { ok: true }
}

export async function fetchAdminStats(): Promise<
  { ok: true; stats: AdminStats } | { ok: false; error: string }
> {
  const sb = getSupabase()
  const token = readAdminToken()
  if (!sb || !token) return { ok: false, error: 'unauthorized' }
  const { data, error } = await sb.rpc('admin_stats', { p_token: token })
  if (error) return { ok: false, error: error.message }
  const row = data as (AdminStats & { ok?: boolean; error?: string }) | null
  if (!row?.ok) {
    if (row?.error === 'unauthorized') clearAdminToken()
    return { ok: false, error: row?.error || '加载失败' }
  }
  return {
    ok: true,
    stats: {
      pageTotal: Number(row.pageTotal) || 0,
      importTotal: Number(row.importTotal) || 0,
      failTotal: Number(row.failTotal) || 0,
      page7d: Number(row.page7d) || 0,
      import7d: Number(row.import7d) || 0,
      fail7d: Number(row.fail7d) || 0,
      visitors: Number(row.visitors) || 0,
      visitors7d: Number(row.visitors7d) || 0,
      recent: Array.isArray(row.recent) ? row.recent : [],
      recentFails: Array.isArray(row.recentFails) ? row.recentFails : [],
    },
  }
}

export async function adminChangePassword(
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  const token = readAdminToken()
  if (!sb || !token) return { ok: false, error: '请先登录' }
  const { data, error } = await sb.rpc('admin_change_password', {
    p_token: token,
    p_old: oldPassword,
    p_new: newPassword,
  })
  if (error) return { ok: false, error: error.message }
  const row = data as { ok?: boolean; error?: string } | null
  if (!row?.ok) {
    const map: Record<string, string> = {
      unauthorized: '登录已过期，请重新登录',
      invalid_old_password: '旧密码不正确',
      password_too_short: '新密码至少 6 位',
    }
    return { ok: false, error: map[row?.error || ''] || '修改失败' }
  }
  return { ok: true }
}
