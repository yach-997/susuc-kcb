import { getSupabase, isSupabaseConfigured } from './supabase'

const VID_KEY = 'susuc-vid'
const PAGE_ONCE_KEY = 'susuc-telemetry-page-day'

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VID_KEY)
    if (id && id.length >= 8) return id
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(VID_KEY, id)
    return id
  } catch {
    return `v-${Date.now()}`
  }
}

async function track(
  kind: 'page' | 'import' | 'import_fail',
  meta?: Record<string, unknown>,
) {
  if (!isSupabaseConfigured()) return
  const sb = getSupabase()
  if (!sb) return
  try {
    await sb.from('telemetry_events').insert({
      kind,
      visitor_id: getVisitorId(),
      meta: meta ?? null,
    })
  } catch {
    /* ignore */
  }
}

/** 每天每设备最多记 1 次打开（避免刷刷新） */
export function trackPageOpen() {
  try {
    const day = todayKey()
    if (sessionStorage.getItem(PAGE_ONCE_KEY) === day) return
    sessionStorage.setItem(PAGE_ONCE_KEY, day)
  } catch {
    /* ignore */
  }
  void track('page')
}

export function trackImportSuccess(meta?: Record<string, unknown>) {
  void track('import', meta)
}

/** 解析/导入失败：记录原因，便于后台排查 */
export function trackImportFail(meta?: Record<string, unknown>) {
  void track('import_fail', meta)
}
