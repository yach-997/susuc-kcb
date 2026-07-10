/** 多源加载 CMap / 字体，本地优先，国内镜像兜底 */
export function createMultiBinaryDataFactory() {
  const cmapUrls = cmapCandidateUrls()
  const fontUrls = fontCandidateUrls()

  return class MultiBinaryDataFactory {
    cMapUrl = cmapUrls[0]
    standardFontDataUrl = fontUrls[0]
    wasmUrl: string | null = null

    // pdfjs 会传入 url，这里忽略，改走多源列表
    constructor(_opts?: {
      cMapUrl?: string | null
      standardFontDataUrl?: string | null
      wasmUrl?: string | null
    }) {}

    async fetch({
      kind,
      filename,
    }: {
      kind: string
      filename: string
    }): Promise<Uint8Array> {
      const urls =
        kind === 'cMapUrl'
          ? cmapUrls
          : kind === 'standardFontDataUrl'
            ? fontUrls
            : []
      if (!urls.length) {
        throw new Error(`不支持的资源类型：${kind}`)
      }
      let lastError: unknown = null
      for (const base of urls) {
        const root = base.endsWith('/') ? base : `${base}/`
        const url = `${root}${filename}`
        try {
          const res = await fetch(url, { cache: 'force-cache', mode: 'cors' })
          if (!res.ok) {
            lastError = new Error(`${url} → ${res.status}`)
            continue
          }
          return new Uint8Array(await res.arrayBuffer())
        } catch (e) {
          lastError = e
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error(`资源加载失败：${kind}/${filename}`)
    }
  }
}

export function assetRoot(): string {
  const origin = window.location.origin
  const base = import.meta.env.BASE_URL || '/'
  return new URL(base, origin).href.replace(/\/?$/, '/')
}

export function cmapCandidateUrls(): string[] {
  const root = assetRoot()
  return [
    new URL('pdfjs/cmaps/', root).href,
    'https://registry.npmmirror.com/pdfjs-dist/6.1.200/files/cmaps/',
    'https://unpkg.com/pdfjs-dist@6.1.200/cmaps/',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/cmaps/',
  ]
}

export function fontCandidateUrls(): string[] {
  const root = assetRoot()
  return [
    new URL('pdfjs/standard_fonts/', root).href,
    'https://registry.npmmirror.com/pdfjs-dist/6.1.200/files/standard_fonts/',
    'https://unpkg.com/pdfjs-dist@6.1.200/standard_fonts/',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/standard_fonts/',
  ]
}

/** 提取结果是否像正方课表（避免乱码/空壳也当成功） */
export function looksLikeTimetableText(items: { str: string }[]): boolean {
  if (items.length < 8) return false
  const text = items.map((i) => i.str).join('')
  if (/周数\s*[:：]|课表|星期[一二三四五六日天]/.test(text)) return true
  if (/\(\d{1,2}\s*[-~～]\s*\d{1,2}\s*节\)/.test(text)) return true
  const hans = (text.match(/[\u4e00-\u9fff]/g) || []).length
  return hans >= 20
}

/** 预热常用中文 CMap，降低首启失败率 */
export function prefetchCriticalCmaps(): void {
  const names = [
    'Adobe-GB1-UCS2',
    'GBK-EUC-H',
    'GB-EUC-H',
    'UniGB-UCS2-H',
    'GB-H',
  ]
  const base = cmapCandidateUrls()[0]
  for (const name of names) {
    void fetch(`${base}${name}.bcmap`, { cache: 'force-cache' }).catch(() => {})
  }
}
