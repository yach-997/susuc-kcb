/**
 * 清理 SW / Cache 后刷新。
 * 留在当前域名，避免跳 clear.html / blob / index.html 导致国产浏览器打不开。
 */
export async function hardRefreshApp(options?: {
  clearTimetable?: boolean
}): Promise<void> {
  const clearData = Boolean(options?.clearTimetable)

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

  const next = new URL(window.location.href)
  next.pathname = next.pathname.replace(/index\.html$/i, '')
  if (!next.pathname.endsWith('/')) next.pathname += '/'
  next.search = ''
  next.searchParams.set('_v', String(Date.now()))
  if (clearData) next.searchParams.set('cleared', '1')
  next.hash = '#/'
  window.location.replace(next.toString())
}

export function clearPageUrl(clearTimetable = false): string {
  const next = new URL(window.location.href)
  next.pathname = next.pathname.replace(/index\.html$/i, '')
  if (!next.pathname.endsWith('/')) next.pathname += '/'
  next.search = ''
  next.searchParams.set('_v', String(Date.now()))
  if (clearTimetable) next.searchParams.set('cleared', '1')
  next.hash = '#/'
  return next.href
}
