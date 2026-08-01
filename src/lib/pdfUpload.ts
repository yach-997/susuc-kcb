import { getSupabase, isSupabaseConfigured } from './supabase'
import { getVisitorId } from './telemetry'

const MAX_BYTES = 5 * 1024 * 1024

function dayStamp(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function safeName(name: string): string {
  return name.replace(/[^\w.\u4e00-\u9fff-]+/g, '_').slice(0, 80) || 'timetable.pdf'
}

/** 静默上传课表 PDF，返回 storage path；失败返回 null（不影响用户导入） */
export async function uploadTimetablePdf(
  data: ArrayBuffer | Blob,
  fileName: string,
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  const sb = getSupabase()
  if (!sb) return null

  const blob =
    data instanceof Blob
      ? data
      : new Blob([data], { type: 'application/pdf' })
  if (blob.size <= 0 || blob.size > MAX_BYTES) return null

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const path = `pdf/${dayStamp()}/${getVisitorId().slice(0, 8)}-${id}-${safeName(fileName)}`

  try {
    const { error } = await sb.storage.from('timetable-uploads').upload(path, blob, {
      contentType: 'application/pdf',
      upsert: false,
    })
    if (error) return null
    return path
  } catch {
    return null
  }
}

export async function createPdfDownloadUrl(
  storagePath: string,
): Promise<string | null> {
  if (!storagePath || !isSupabaseConfigured()) return null
  const sb = getSupabase()
  if (!sb) return null
  try {
    const { data, error } = await sb.storage
      .from('timetable-uploads')
      .createSignedUrl(storagePath, 300)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch {
    return null
  }
}
