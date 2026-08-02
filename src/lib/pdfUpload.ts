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
    // 拷贝一份，避免后续 pdf.js 转移 ArrayBuffer 影响上传
    const copy =
      data instanceof Blob
        ? blob
        : new Blob([data.slice(0)], { type: 'application/pdf' })
    const { error } = await sb.storage.from('timetable-uploads').upload(path, copy, {
      contentType: 'application/pdf',
      upsert: false,
    })
    if (error) {
      console.warn('[pdfUpload]', error.message)
      return null
    }
    return path
  } catch (e) {
    console.warn('[pdfUpload]', e)
    return null
  }
}

export async function createPdfDownloadUrl(
  storagePath: string,
  fileName?: string | null,
): Promise<string | null> {
  if (!storagePath || !isSupabaseConfigured()) return null
  const sb = getSupabase()
  if (!sb) return null
  try {
    const opts = fileName?.trim()
      ? { download: fileName.trim() }
      : { download: 'timetable.pdf' }
    let { data, error } = await sb.storage
      .from('timetable-uploads')
      .createSignedUrl(storagePath, 600, opts)
    // 兼容旧 SDK：不带 download 选项再试一次
    if (error || !data?.signedUrl) {
      ;({ data, error } = await sb.storage
        .from('timetable-uploads')
        .createSignedUrl(storagePath, 600))
    }
    if (error || !data?.signedUrl) {
      console.warn('[pdfDownload]', error?.message)
      return null
    }
    return data.signedUrl
  } catch (e) {
    console.warn('[pdfDownload]', e)
    return null
  }
}

/** 手机端 window.open 常被拦截，改为拉取后触发下载/预览 */
export async function downloadPdfFile(
  storagePath: string,
  fileName?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = await createPdfDownloadUrl(storagePath, fileName)
  if (!url) {
    return {
      ok: false,
      error: '无法生成下载链接（请确认已执行 admin_uploads.sql，且该条有附件）',
    }
  }
  const name = (fileName && fileName.trim()) || 'timetable.pdf'
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const obj = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = obj
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(obj), 30_000)
    return { ok: true }
  } catch {
    // 回退：新开页（部分环境 fetch 跨域受限）
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) {
      window.location.href = url
    }
    return { ok: true }
  }
}
