/**
 * 清理 SW / Cache 后刷新。
 * 留在当前域名，避免跳 clear.html / blob / index.html 导致国产浏览器打不开。
 * iOS 等环境上 SW/Cache API 可能挂起，必须带超时，否则会一直停在「正在更新」。
 */

function withTimeout(task: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    window.setTimeout(finish, ms)
    task.then(finish, finish)
  })
}

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
      await withTimeout(
        (async () => {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map((r) => r.unregister()))
        })(),
        1500,
      )
    }

    if ('caches' in window) {
      await withTimeout(
        (async () => {
          const keys = await caches.keys()
          await Promise.all(keys.map((k) => caches.delete(k)))
        })(),
        1500,
      )
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

  // 个别 WebView replace 无效时兜底
  window.setTimeout(() => {
    window.location.reload()
  }, 800)
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
