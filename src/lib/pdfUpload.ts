import { getSupabase, isSupabaseConfigured } from './supabase'
import { getVisitorId } from './telemetry'

const MAX_BYTES = 5 * 1024 * 1024

function dayStamp(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 存储路径只用 ASCII，中文文件名会导致部分环境上传失败 */
function safeName(name: string): string {
  const base = name
    .replace(/\.pdf$/i, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48)
  return `${base || 'timetable'}.pdf`
}

export type UploadPdfResult = {
  path: string | null
  error: string | null
}

/** 静默上传课表 PDF；失败不影响用户导入 */
export async function uploadTimetablePdf(
  data: ArrayBuffer | Blob,
  fileName: string,
): Promise<UploadPdfResult> {
  if (!isSupabaseConfigured()) {
    return { path: null, error: 'supabase_not_configured' }
  }
  const sb = getSupabase()
  if (!sb) return { path: null, error: 'supabase_not_configured' }

  const copy =
    data instanceof Blob
      ? data
      : new Blob([data.slice(0)], { type: 'application/pdf' })
  if (copy.size <= 0) return { path: null, error: 'empty_file' }
  if (copy.size > MAX_BYTES) return { path: null, error: 'file_too_large' }

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const path = `pdf/${dayStamp()}/${getVisitorId().slice(0, 8)}-${id}-${safeName(fileName)}`

  const tryUpload = async (): Promise<UploadPdfResult> => {
    const { error } = await sb.storage.from('timetable-uploads').upload(path, copy, {
      contentType: 'application/pdf',
      upsert: false,
    })
    if (error) {
      console.warn('[pdfUpload]', error.message)
      return { path: null, error: error.message }
    }
    return { path, error: null }
  }

  try {
    let res = await tryUpload()
    // 常见：桶未建好时瞬时失败，短延迟重试一次
    if (!res.path) {
      await new Promise((r) => setTimeout(r, 400))
      res = await tryUpload()
    }
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'upload_failed'
    console.warn('[pdfUpload]', e)
    return { path: null, error: msg }
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
      error: '无法生成下载链接（请确认已执行 admin_uploads.sql）',
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
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) window.location.href = url
    return { ok: true }
  }
}
