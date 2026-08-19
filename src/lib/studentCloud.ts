import type { TimetablePayload } from '../types'
import { getSupabase, isSupabaseConfigured } from './supabase'

export const JUST_IMPORTED_KEY = 'susuc-just-imported'
export const RESTORED_TIP_KEY = 'susuc-restored-tip'
const IDENTITY_KEY = 'susuc-cloud-identity'

export function loadCloudIdentity(): { studentId: string; studentName: string } {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    if (!raw) return { studentId: '', studentName: '' }
    const o = JSON.parse(raw) as { studentId?: string; studentName?: string }
    return {
      studentId: String(o.studentId || ''),
      studentName: String(o.studentName || ''),
    }
  } catch {
    return { studentId: '', studentName: '' }
  }
}

export function saveCloudIdentity(studentId: string, studentName: string): void {
  const prev = loadCloudIdentity()
  const id = normalizeStudentId(studentId) || prev.studentId
  const name = normalizeStudentName(studentName) || prev.studentName
  if (!id && !name) return
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ studentId: id, studentName: name }))
  } catch {
    /* ignore */
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
    return { ok: true }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export async function restoreStudentTimetable(
  studentId: string,
  studentName: string,
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
      p_student_name: normalizeStudentName(studentName),
    })
    if (error) {
      const msg = error.message || ''
      if (/schema cache|does not exist|404/i.test(msg)) return { ok: false, error: 'need_sql' }
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
      return '学号或姓名不一致'
    case 'too_many':
      return '尝试次数过多，请稍后再试'
    case 'need_sql':
      return '云端备份尚未开通'
    default:
      return '网络异常，请稍后重试'
  }
}
