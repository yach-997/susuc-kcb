import { downloadPdfFile } from './pdfUpload'
import { getSupabase, isSupabaseConfigured } from './supabase'

const TOKEN_KEY = 'susuc-admin-token'

export type AdminEvent = {
  id?: number
  kind: string
  visitor_id: string | null
  created_at: string
  meta?: {
    message?: string
    fileName?: string
    storagePath?: string
    courseCount?: number
    termLabel?: string | null
    [k: string]: unknown
  } | null
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

export type DayReport = {
  day: string
  pageCount: number
  importCount: number
  failCount: number
  imports: AdminEvent[]
  fails: AdminEvent[]
  events: AdminEvent[]
}

export type AdminVisitor = {
  visitor_id: string
  event_count: number
  page_count: number
  import_count: number
  fail_count: number
  first_seen: string
  last_seen: string
}

export type FeedbackItem = {
  id: number
  visitor_id: string | null
  content: string
  contact: string | null
  status: 'new' | 'read' | 'done' | string
  created_at: string
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

export async function fetchDayReport(
  day: string,
): Promise<{ ok: true; report: DayReport } | { ok: false; error: string }> {
  const sb = getSupabase()
  const token = readAdminToken()
  if (!sb || !token) return { ok: false, error: 'unauthorized' }
  const { data, error } = await sb.rpc('admin_day_report', {
    p_token: token,
    p_day: day,
  })
  if (error) return { ok: false, error: error.message }
  const row = data as (DayReport & { ok?: boolean; error?: string }) | null
  if (!row?.ok) {
    if (row?.error === 'unauthorized') clearAdminToken()
    return { ok: false, error: row?.error || '加载失败' }
  }
  return {
    ok: true,
    report: {
      day: String(row.day || day),
      pageCount: Number(row.pageCount) || 0,
      importCount: Number(row.importCount) || 0,
      failCount: Number(row.failCount) || 0,
      imports: Array.isArray(row.imports) ? row.imports : [],
      fails: Array.isArray(row.fails) ? row.fails : [],
      events: Array.isArray(row.events) ? row.events : [],
    },
  }
}

export async function fetchAdminVisitors(): Promise<
  | { ok: true; total: number; visitors: AdminVisitor[] }
  | { ok: false; error: string }
> {
  const sb = getSupabase()
  const token = readAdminToken()
  if (!sb || !token) return { ok: false, error: 'unauthorized' }
  const { data, error } = await sb.rpc('admin_visitors', {
    p_token: token,
    p_limit: 150,
  })
  if (error) {
    return {
      ok: false,
      error:
        error.message.includes('admin_visitors') ||
        error.message.includes('Could not find')
          ? '请先在 Supabase 执行 supabase/admin_ops.sql'
          : error.message,
    }
  }
  const row = data as {
    ok?: boolean
    error?: string
    total?: number
    visitors?: AdminVisitor[]
  } | null
  if (!row?.ok) {
    if (row?.error === 'unauthorized') clearAdminToken()
    return { ok: false, error: row?.error || '加载失败' }
  }
  return {
    ok: true,
    total: Number(row.total) || 0,
    visitors: Array.isArray(row.visitors) ? row.visitors : [],
  }
}

export async function fetchAdminFeedback(): Promise<
  | { ok: true; newCount: number; items: FeedbackItem[] }
  | { ok: false; error: string }
> {
  const sb = getSupabase()
  const token = readAdminToken()
  if (!sb || !token) return { ok: false, error: 'unauthorized' }
  const { data, error } = await sb.rpc('admin_feedback_list', {
    p_token: token,
    p_limit: 100,
  })
  if (error) {
    return {
      ok: false,
      error:
        error.message.includes('admin_feedback') ||
        error.message.includes('Could not find')
          ? '请先在 Supabase 执行 supabase/admin_ops.sql'
          : error.message,
    }
  }
  const row = data as {
    ok?: boolean
    error?: string
    newCount?: number
    items?: FeedbackItem[]
  } | null
  if (!row?.ok) {
    if (row?.error === 'unauthorized') clearAdminToken()
    return { ok: false, error: row?.error || '加载失败' }
  }
  return {
    ok: true,
    newCount: Number(row.newCount) || 0,
    items: Array.isArray(row.items) ? row.items : [],
  }
}

export async function setFeedbackStatus(
  id: number,
  status: 'new' | 'read' | 'done',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  const token = readAdminToken()
  if (!sb || !token) return { ok: false, error: 'unauthorized' }
  const { data, error } = await sb.rpc('admin_feedback_set_status', {
    p_token: token,
    p_id: id,
    p_status: status,
  })
  if (error) return { ok: false, error: error.message }
  const row = data as { ok?: boolean; error?: string } | null
  if (!row?.ok) {
    if (row?.error === 'unauthorized') clearAdminToken()
    return { ok: false, error: row?.error || '更新失败' }
  }
  return { ok: true }
}

export async function submitUserFeedback(
  content: string,
  contact?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false, error: '服务暂不可用' }
  const { getVisitorId } = await import('./telemetry')
  const { data, error } = await sb.rpc('submit_feedback', {
    p_visitor_id: getVisitorId(),
    p_content: content,
    p_contact: contact?.trim() || null,
  })
  if (error) {
    return {
      ok: false,
      error:
        error.message.includes('submit_feedback') ||
        error.message.includes('Could not find')
          ? '反馈通道未就绪，请稍后再试'
          : error.message,
    }
  }
  const row = data as { ok?: boolean; error?: string } | null
  if (!row?.ok) {
    const map: Record<string, string> = {
      content_too_short: '请写得稍微具体一点（至少 2 个字）',
      content_too_long: '内容太长了，请控制在 2000 字内',
    }
    return { ok: false, error: map[row?.error || ''] || '提交失败' }
  }
  return { ok: true }
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

export async function downloadEventPdf(
  ev: AdminEvent,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const path = ev.meta?.storagePath
  if (typeof path !== 'string' || !path) {
    return { ok: false, error: '此条没有 PDF 附件（多为升级前的旧记录）' }
  }
  const fileName =
    typeof ev.meta?.fileName === 'string' ? ev.meta.fileName : null
  return downloadPdfFile(path, fileName)
}
