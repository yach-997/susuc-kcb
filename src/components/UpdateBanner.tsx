import { useEffect, useState } from 'react'
import { APP_VERSION } from '../appVersion'
import { hardRefreshApp } from '../lib/hardRefresh'
import { fetchRemoteVersion, isOutdated } from '../lib/versionCheck'

const DISMISS_KEY = 'susuc-update-dismiss'

/** 发现非最新版时顶部提示升级 */
export function UpdateBanner() {
  const [remote, setRemote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()

    const check = async () => {
      const info = await fetchRemoteVersion(ctrl.signal)
      if (!alive || !info) return
      try {
        if (sessionStorage.getItem(DISMISS_KEY) === info.version) return
      } catch {
        /* ignore */
      }
      if (isOutdated(APP_VERSION, info.version)) setRemote(info.version)
      else setRemote(null)
    }

    void check()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => void check(), 5 * 60 * 1000)

    return () => {
      alive = false
      ctrl.abort()
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [])

  if (!remote) return null

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, remote)
    } catch {
      /* ignore */
    }
    setRemote(null)
  }

  const upgrade = () => {
    setBusy(true)
    // 防止 hardRefresh 异常挂起时按钮永久转圈
    window.setTimeout(() => {
      window.location.reload()
    }, 4000)
    void hardRefreshApp({ clearTimetable: false }).catch(() => {
      window.location.reload()
    })
  }

  return (
    <div className="shrink-0 border-b border-brand/20 bg-brand-soft px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-dark">发现新版本</p>
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted">
            当前 {APP_VERSION}，最新 {remote}。请升级后再用，避免功能或识别异常。
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg px-2 py-1 text-[0.7rem] text-muted"
          aria-label="稍后"
        >
          稍后
        </button>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={upgrade}
        className="mt-2 w-full rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? '正在更新…' : '立即升级'}
      </button>
    </div>
  )
}
