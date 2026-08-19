import type { TimetablePayload } from '../types'
import { getSupabase, isSupabaseConfigured } from './supabase'

export const JUST_IMPORTED_KEY = 'susuc-just-imported'
export const RESTORED_TIP_KEY = 'susuc-restored-tip'
/** 云端找回统一密码：方便浏览器弹出「保存密码」 */
export const CLOUD_LOGIN_PASSWORD = '123456'
const IDENTITY_KEY = 'susuc-cloud-identity'
const REMEMBER_KEY = 'susuc-cloud-remember'

export type RememberedCloudCreds = { studentId: string; password: string }

export function readRememberedCloudCreds(): RememberedCloudCreds | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<RememberedCloudCreds>
    const studentId = normalizeStudentId(String(o.studentId || ''))
    if (!looksLikeStudentId(studentId)) return null
    const password =
      String(o.password || CLOUD_LOGIN_PASSWORD).trim() || CLOUD_LOGIN_PASSWORD
    return { studentId, password }
  } catch {
    return null
  }
}

export function saveRememberedCloudCreds(
  studentId: string,
  password: string = CLOUD_LOGIN_PASSWORD,
): void {
  const id = normalizeStudentId(studentId)
  const pwd = (password || CLOUD_LOGIN_PASSWORD).trim() || CLOUD_LOGIN_PASSWORD
  if (!looksLikeStudentId(id)) return
  try {
    localStorage.setItem(
      REMEMBER_KEY,
      JSON.stringify({ studentId: id, password: pwd }),
    )
  } catch {
    /* ignore */
  }
  saveCloudIdentity(id, pwd)
}

export function clearRememberedCloudCreds(): void {
  try {
    localStorage.removeItem(REMEMBER_KEY)
  } catch {
    /* ignore */
  }
}

export function loadCloudIdentity(): { studentId: string; password: string } {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    if (!raw) return { studentId: '', password: CLOUD_LOGIN_PASSWORD }
    const o = JSON.parse(raw) as {
      studentId?: string
      password?: string
      studentName?: string
    }
    return {
      studentId: String(o.studentId || ''),
      password: String(o.password || CLOUD_LOGIN_PASSWORD),
    }
  } catch {
    return { studentId: '', password: CLOUD_LOGIN_PASSWORD }
  }
}

export function saveCloudIdentity(studentId: string, password?: string): void {
  const prev = loadCloudIdentity()
  const id = normalizeStudentId(studentId) || prev.studentId
  const pwd = (password || prev.password || CLOUD_LOGIN_PASSWORD).trim()
  if (!id) return
  try {
    localStorage.setItem(
      IDENTITY_KEY,
      JSON.stringify({ studentId: id, password: pwd || CLOUD_LOGIN_PASSWORD }),
    )
  } catch {
    /* ignore */
  }
}

/** 学号形态，用来过滤掉后台 admin 等账号 */
export function looksLikeStudentId(raw: string): boolean {
  return /^[0-9A-Za-z]{8,16}$/.test(normalizeStudentId(raw))
}

/**
 * 写入本机 + 浏览器密码库（账号=学号，密码=123456）。
 * 和后台 admin 一样，点选可一键填入。
 */
export async function rememberCloudIdentity(
  studentId: string,
  password: string = CLOUD_LOGIN_PASSWORD,
): Promise<void> {
  const id = normalizeStudentId(studentId)
  const pwd = (password || CLOUD_LOGIN_PASSWORD).trim() || CLOUD_LOGIN_PASSWORD
  if (!looksLikeStudentId(id)) return
  saveCloudIdentity(id, pwd)
  try {
    const Cred = (
      window as unknown as {
        PasswordCredential?: new (data: {
          id: string
          name?: string
          password: string
        }) => Credential
      }
    ).PasswordCredential
    if (!Cred || !navigator.credentials?.store) return
    await navigator.credentials.store(
      new Cred({
        id,
        name: id,
        password: pwd,
      }),
    )
  } catch {
    /* 不支持或用户拒绝 */
  }
}

/** 点选密码库账号；忽略 admin 等非学号项 */
export async function pickCloudIdentityFromPasswordManager(): Promise<{
  studentId: string
  password: string
} | null> {
  try {
    if (!navigator.credentials?.get) return null
    const cred = (await navigator.credentials.get({
      password: true,
      mediation: 'optional',
    } as CredentialRequestOptions)) as
      | (Credential & { id?: string; password?: string })
      | null
    if (!cred?.id || !looksLikeStudentId(cred.id)) return null
    const password = (cred.password || CLOUD_LOGIN_PASSWORD).trim()
    saveCloudIdentity(cred.id, password)
    return {
      studentId: normalizeStudentId(cred.id),
      password: password || CLOUD_LOGIN_PASSWORD,
    }
  } catch {
    return null
  }
}

export function normalizeStudentId(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

export function normalizeStudentName(raw: string): string {
  return raw.replace(/\s+/g, '').trim()
}

export function canCloudBackup(data: TimetablePayload | null): boolean {
  if (!data?.courses?.length) return false
  const id = normalizeStudentId(data.studentId || '')
  const name = normalizeStudentName(data.studentName || '')
  return /^[0-9A-Z]{8,16}$/.test(id) && name.length >= 2 && name.length <= 8
}

export async function backupStudentTimetable(
  payload: TimetablePayload,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !canCloudBackup(payload)) {
    return { ok: false, error: 'skip' }
  }
  const sb = getSupabase()
  if (!sb) return { ok: false, error: 'skip' }
  try {
    const { data, error } = await sb.rpc('save_student_timetable', {
      p_student_id: normalizeStudentId(payload.studentId || ''),
      p_student_name: normalizeStudentName(payload.studentName || ''),
      p_payload: payload,
    })
    if (error) {
      const msg = error.message || ''
      if (/schema cache|does not exist|404/i.test(msg)) return { ok: false, error: 'need_sql' }
      return { ok: false, error: 'network' }
    }
    const row = data as { ok?: boolean; error?: string } | null
    if (!row?.ok) return { ok: false, error: row?.error || 'fail' }
    void rememberCloudIdentity(payload.studentId || '', CLOUD_LOGIN_PASSWORD)
    return { ok: true }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export async function restoreStudentTimetable(
  studentId: string,
  password: string,
): Promise<
  | { ok: true; payload: TimetablePayload }
  | { ok: false; error: 'missing' | 'mismatch' | 'too_many' | 'need_sql' | 'network' }
> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'need_sql' }
  const sb = getSupabase()
  if (!sb) return { ok: false, error: 'need_sql' }
  try {
    const { data, error } = await sb.rpc('restore_student_timetable', {
      p_student_id: normalizeStudentId(studentId),
      p_password: (password || '').trim(),
    })
    if (error) {
      const msg = error.message || ''
      if (/schema cache|does not exist|404|Could not find/i.test(msg)) {
        return { ok: false, error: 'need_sql' }
      }
      return { ok: false, error: 'network' }
    }
    const row = data as {
      ok?: boolean
      error?: string
      payload?: TimetablePayload
    } | null
    if (!row?.ok) {
      const err = row?.error
      if (err === 'missing' || err === 'mismatch' || err === 'too_many') {
        return { ok: false, error: err }
      }
      return { ok: false, error: 'mismatch' }
    }
    if (!row.payload?.courses?.length) return { ok: false, error: 'missing' }
    return { ok: true, payload: row.payload }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export function restoreErrorText(
  error: 'missing' | 'mismatch' | 'too_many' | 'need_sql' | 'network',
): string {
  switch (error) {
    case 'missing':
      return '还没有导入过备份'
    case 'mismatch':
      return '账号或密码不正确'
    case 'too_many':
      return '尝试次数过多，请稍后再试'
    case 'need_sql':
      return '云端找回脚本未更新，请在 Supabase 执行 student_cloud_restore_fix.sql'
    default:
      return '网络异常，请稍后重试'
  }
}
