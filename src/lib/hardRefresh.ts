/**
 * 清理 SW / Cache 后刷新。
 *
 * 不能跳转到 clear.html：旧 Service Worker 会劫持同目录导航，
 * 手机浏览器常直接显示「网站暂时无法打开」。
 * 做法：在当前页清理 → 经 blob: 中转跳出 SW 控制 → 再回首页。
 */
export async function hardRefreshApp(options?: {
  clearTimetable?: boolean
}): Promise<void> {
  const clearData = Boolean(options?.clearTimetable)
  const base = import.meta.env.BASE_URL || '/'
  const home =
    `${window.location.origin}${base}index.html?_v=${Date.now()}` +
    (clearData ? '&cleared=1' : '') +
    '#/'

  try {
    try {
      sessionStorage.clear()
    } catch {
      /* ignore */
    }

    if (clearData) {
      try {
        const keys: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k?.startsWith('susuc-')) keys.push(k)
        }
        keys.forEach((k) => localStorage.removeItem(k))
      } catch {
        /* ignore */
      }
    }

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }

    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* 仍继续跳转 */
  }

  // blob: 不在 SW scope 内，下一跳不会被旧 Worker 拦截
  const escapeHtml = `<!doctype html><meta charset="utf-8" />
<meta http-equiv="Cache-Control" content="no-store" />
<title>正在进入新版…</title>
<body style="font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#eef6f2;color:#14231e;margin:0">
<p>缓存已清理，正在进入新版…</p>
<script>
  location.replace(${JSON.stringify(home)});
<\/script>
</body>`

  const blobUrl = URL.createObjectURL(
    new Blob([escapeHtml], { type: 'text/html;charset=utf-8' }),
  )
  window.location.href = blobUrl
}

/** @deprecated 保留给旧链接；优先用 hardRefreshApp */
export function clearPageUrl(clearTimetable = false): string {
  const base = import.meta.env.BASE_URL || '/'
  const url = new URL('update.html', `${window.location.origin}${base}`)
  url.searchParams.set('t', String(Date.now()))
  if (clearTimetable) url.searchParams.set('data', '1')
  return url.href
}
