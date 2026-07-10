import type { TimetablePayload } from '../types'

const DRAFT_KEY = 'susuc-import-draft'

export type ImportDraft = {
  v: 1
  fileName?: string
  /** 选中后立刻缓存，防止手机选文件返回时页面重载丢文件 */
  pdfBase64?: string
  /** 已识别、待填学期 */
  pending?: TimetablePayload
  updatedAt: number
}

function canUseStorage(): boolean {
  try {
    return typeof sessionStorage !== 'undefined'
  } catch {
    return false
  }
}

export function loadImportDraft(): ImportDraft | null {
  if (!canUseStorage()) return null
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as ImportDraft
    if (data?.v !== 1) return null
    // 超过 2 小时丢弃，避免脏数据
    if (Date.now() - (data.updatedAt || 0) > 2 * 60 * 60 * 1000) {
      clearImportDraft()
      return null
    }
    return data
  } catch {
    return null
  }
}

export function saveImportDraft(patch: Partial<ImportDraft>): ImportDraft {
  const prev = loadImportDraft() || { v: 1 as const, updatedAt: Date.now() }
  const next: ImportDraft = {
    ...prev,
    ...patch,
    v: 1,
    updatedAt: Date.now(),
  }
  if (canUseStorage()) {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next))
    } catch {
      // quota：丢掉 PDF 字节，至少保住识别结果
      try {
        const slim = { ...next, pdfBase64: undefined }
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(slim))
        return slim
      } catch {
        /* ignore */
      }
    }
  }
  return next
}

export function clearImportDraft(): void {
  if (!canUseStorage()) return
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

export async function fileToBase64(file: Blob): Promise<string> {
  const buf = await readBlobBuffer(file)
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** 手机上 File.arrayBuffer 偶发失败，用 FileReader 兜底 */
export function readBlobBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer().catch(() => readViaFileReader(blob))
  }
  return readViaFileReader(blob)
}

function readViaFileReader(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result)
      else reject(new Error('读取文件失败'))
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsArrayBuffer(blob)
  })
}

/** 手机常无 MIME、无扩展名，尽量放行再交给解析报错 */
export function looksLikePdf(file: File): boolean {
  if (file.type === 'application/pdf') return true
  if (/\.pdf$/i.test(file.name)) return true
  if (
    !file.type ||
    file.type === 'application/octet-stream' ||
    file.type === 'binary/octet-stream' ||
    file.type === 'application/x-pdf'
  ) {
    return file.size > 80 && file.size < 30 * 1024 * 1024
  }
  return false
}

export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || ''
  return /MicroMessenger|QQ\//i.test(ua) && !/QQBrowser/i.test(ua)
}
