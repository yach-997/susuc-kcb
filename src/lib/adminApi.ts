import { downloadPdfFile } from './pdfUpload'
import { getSupabase, isSupabaseConfigured } from './supabase'

const TOKEN_KEY = 'susuc-admin-token'
const REMEMBER_KEY = 'susuc-admin-remember'

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
    // 优先 localStorage：关标签/重启浏览器仍保持登录
    return (
      localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
    )
  } catch {
    return null
  }
}

export function clearAdminToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

function saveAdminToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    try {
      sessionStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* ignore */
    }
  }
}

export type RememberedCreds = { username: string; password: string }

export function readRememberedCreds(): RememberedCreds | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<RememberedCreds>
    if (
      typeof o.username === 'string' &&
      o.username &&
      typeof o.password === 'string'
    ) {
      return { username: o.username, password: o.password }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function saveRememberedCreds(username: string, password: string) {
  try {
    localStorage.setItem(
      REMEMBER_KEY,
      JSON.stringify({ username: username.trim(), password }),
    )
  } catch {
    /* ignore */
  }
}

export function clearRememberedCreds() {
  try {
    localStorage.removeItem(REMEMBER_KEY)
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

async function removeStoragePaths(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  paths: string[],
): Promise<{ ok: true; pdfCount: number } | { ok: false; error: string }> {
  const clean = paths
    .map((p) => String(p || '').trim())
    .filter((p) => p.startsWith('pdf/') && !p.includes('..'))
  if (clean.length === 0) return { ok: true, pdfCount: 0 }

  let pdfCount = 0
  const chunkSize = 50
  for (let i = 0; i < clean.length; i += chunkSize) {
    const chunk = clean.slice(i, i + chunkSize)
    const { data, error } = await sb.storage
      .from('timetable-uploads')
      .remove(chunk)
    if (error) {
      return {
        ok: false,
        error:
          error.message.includes('not allowed') ||
          error.message.includes('policy')
            ? '请重新执行 supabase/admin_uploads.sql（需删除策略）'
            : error.message,
      }
    }
    pdfCount += Array.isArray(data) ? data.length : chunk.length
  }
  return { ok: true, pdfCount }
}

export async function clearAdminEvents(opts: {
  day?: string | null
  days?: number
  all?: boolean
}): Promise<
  | { ok: true; eventCount: number; pdfCount: number; all: boolean }
  | { ok: false; error: string }
> {
  const sb = getSupabase()
  const token = readAdminToken()
  if (!sb || !token) return { ok: false, error: 'unauthorized' }

  const baseArgs = {
    p_token: token,
    p_day: opts.all ? null : (opts.day ?? null),
    p_days: opts.days ?? 1,
    p_all: !!opts.all,
  }

  // 1) 准备：拿路径 + 短时授权（不删埋点）
  const prep = await sb.rpc('admin_clear_events', {
    ...baseArgs,
    p_commit: false,
  })
  if (prep.error) {
    return {
      ok: false,
      error:
        prep.error.message.includes('admin_clear_events') ||
        prep.error.message.includes('Could not find') ||
        prep.error.message.includes('storage tables')
          ? '请重新执行 supabase/admin_uploads.sql'
          : prep.error.message,
    }
  }
  const prepRow = prep.data as {
    ok?: boolean
    error?: string
    paths?: string[]
    eventCount?: number
    all?: boolean
  } | null
  if (!prepRow?.ok) {
    if (prepRow?.error === 'unauthorized') clearAdminToken()
    return { ok: false, error: prepRow?.error || '清理失败' }
  }

  const paths = Array.isArray(prepRow.paths) ? prepRow.paths : []
  const removed = await removeStoragePaths(sb, paths)
  if (!removed.ok) return removed

  // 2) 提交：删埋点
  const { data, error } = await sb.rpc('admin_clear_events', {
    ...baseArgs,
    p_commit: true,
  })
  if (error) {
    return {
      ok: false,
      error:
        error.message.includes('admin_clear_events') ||
        error.message.includes('Could not find')
          ? '请重新执行 supabase/admin_uploads.sql'
          : `PDF 已删，但记录清理失败：${error.message}`,
    }
  }
  const row = data as {
    ok?: boolean
    error?: string
    eventCount?: number
    all?: boolean
  } | null
  if (!row?.ok) {
    if (row?.error === 'unauthorized') clearAdminToken()
    return {
      ok: false,
      error: row?.error
        ? `PDF 已删，但记录清理失败：${row.error}`
        : 'PDF 已删，但记录清理失败',
    }
  }
  return {
    ok: true,
    eventCount: Number(row.eventCount) || 0,
    pdfCount: removed.pdfCount,
    all: !!row.all,
  }
}

export async function fetchDayReport(
  day: string,
  days = 1,
): Promise<{ ok: true; report: DayReport } | { ok: false; error: string }> {
  const sb = getSupabase()
  const token = readAdminToken()
  if (!sb || !token) return { ok: false, error: 'unauthorized' }
  const { data, error } = await sb.rpc('admin_day_report', {
    p_token: token,
    p_day: day,
    p_days: days,
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

export async function fetchAdminVisitors(opts?: {
  day?: string | null
  days?: number
}): Promise<
  | { ok: true; total: number; visitors: AdminVisitor[] }
  | { ok: false; error: string }
> {
  const sb = getSupabase()
  const token = readAdminToken()
  if (!sb || !token) return { ok: false, error: 'unauthorized' }
  const { data, error } = await sb.rpc('admin_visitors', {
    p_token: token,
    p_day: opts?.day ?? null,
    p_days: opts?.days ?? 1,
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

export async function fetchAdminFeedback(opts?: {
  day?: string | null
  days?: number
  status?: string | null
}): Promise<
  | { ok: true; newCount: number; items: FeedbackItem[] }
  | { ok: false; error: string }
> {
  const sb = getSupabase()
  const token = readAdminToken()
  if (!sb || !token) return { ok: false, error: 'unauthorized' }
  const { data, error } = await sb.rpc('admin_feedback_list', {
    p_token: token,
    p_day: opts?.day ?? null,
    p_status: opts?.status ?? null,
    p_days: opts?.days ?? 1,
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
  const sb = getSupabase()
  const token = readAdminToken()
  if (!sb || !token) return { ok: false, error: '请先登录' }

  // 先校验后台 token 并写入短时 grant，再签名下载
  const { data, error } = await sb.rpc('admin_authorize_pdf', {
    p_token: token,
    p_path: path,
  })
  if (error) {
    return {
      ok: false,
      error:
        error.message.includes('admin_authorize_pdf') ||
        error.message.includes('Could not find')
          ? '请重新执行 supabase/admin_uploads.sql'
          : error.message,
    }
  }
  const row = data as { ok?: boolean; error?: string } | null
  if (!row?.ok) {
    if (row?.error === 'unauthorized') clearAdminToken()
    return {
      ok: false,
      error:
        row?.error === 'unauthorized'
          ? '登录已过期，请重新登录'
          : row?.error === 'invalid_path'
            ? 'PDF 路径无效'
            : '授权失败',
    }
  }

  const fileName =
    typeof ev.meta?.fileName === 'string' ? ev.meta.fileName : null
  return downloadPdfFile(path, fileName)
}
