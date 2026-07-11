import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    const nav = window.navigator as Navigator & { standalone?: boolean }
    if (nav.standalone) return true
  } catch {
    /* ignore */
  }
  return false
}

function fallbackInstallTip(): string {
  const ua = navigator.userAgent || ''
  if (/MicroMessenger|QQ\//i.test(ua) && !/QQBrowser/i.test(ua)) {
    return '请先点右上角 ··· → 在浏览器打开，再用浏览器菜单「添加到主屏幕」。'
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return '请点底部分享按钮，再选「添加到主屏幕」。'
  }
  return '请用浏览器菜单「添加到主屏幕 / 安装应用」。'
}

/** 设置页：添加到手机桌面 */
export function AddToHomeButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(() => isStandalone())

  useEffect(() => {
    if (isStandalone()) {
      setDone(true)
      return
    }
    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  const onClick = async () => {
    if (done) return
    if (deferred) {
      setBusy(true)
      try {
        await deferred.prompt()
        const choice = await deferred.userChoice
        setDeferred(null)
        if (choice.outcome === 'accepted') setDone(true)
      } catch {
        window.alert(fallbackInstallTip())
      } finally {
        setBusy(false)
      }
      return
    }
    window.alert(fallbackInstallTip())
  }

  return (
    <button
      type="button"
      disabled={busy || done}
      onClick={() => void onClick()}
      className="mt-3 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
    >
      {done ? '已在桌面打开' : busy ? '请稍候…' : '添加到手机桌面'}
    </button>
  )
}
