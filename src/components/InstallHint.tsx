import { useEffect, useState } from 'react'

const HIDE_KEY = 'susuc-hide-install-hint'

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

function platformHint(): { title: string; body: string; canPrompt: boolean } {
  const ua = navigator.userAgent || ''
  const ios = /iPhone|iPad|iPod/i.test(ua)
  const wechat = /MicroMessenger/i.test(ua)
  const qq = /QQ\//i.test(ua) && !/QQBrowser/i.test(ua)

  if (wechat || qq) {
    return {
      title: '添加到手机桌面',
      body: '先点右上角 ··· → 在浏览器打开，再用浏览器菜单「添加到主屏幕」。',
      canPrompt: false,
    }
  }
  if (ios) {
    return {
      title: '添加到手机桌面',
      body: '点底部分享按钮，再选「添加到主屏幕」。',
      canPrompt: false,
    }
  }
  return {
    title: '添加到手机桌面',
    body: '点下方按钮安装；若没有按钮，用浏览器菜单「添加到主屏幕 / 安装应用」。',
    canPrompt: true,
  }
}

/** 首页底部：引导把课表助手加到桌面（可关闭） */
export function InstallHint() {
  const [visible, setVisible] = useState(false)
  const [hint] = useState(() => platformHint())
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(HIDE_KEY) === '1') return
    } catch {
      /* ignore */
    }
    if (isStandalone()) return
    setVisible(true)

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  if (!visible) return null

  const dismiss = () => {
    try {
      localStorage.setItem(HIDE_KEY, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  const install = async () => {
    if (!deferred) return
    setBusy(true)
    try {
      await deferred.prompt()
      await deferred.userChoice
      setDeferred(null)
      dismiss()
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-3 mb-3 rounded-2xl border border-brand/25 bg-brand-soft/80 px-3 py-3 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-dark">{hint.title}</p>
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted">
            {hint.body}
          </p>
        </div>
        <button
          type="button"
          aria-label="关闭"
          onClick={dismiss}
          className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted"
        >
          ×
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        {hint.canPrompt && deferred && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void install()}
            className="flex-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? '请稍候…' : '一键添加到桌面'}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className={`rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink ${
            hint.canPrompt && deferred ? '' : 'flex-1'
          }`}
        >
          知道了
        </button>
      </div>
    </div>
  )
}
