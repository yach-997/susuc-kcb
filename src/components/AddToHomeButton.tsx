import { useEffect, useMemo, useState } from 'react'
import { publicAppUrl } from '../lib/importDraft'

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

function installHint(): string {
  const ua = navigator.userAgent || ''
  if (/MicroMessenger/i.test(ua)) {
    return '微信里不能直接加桌面：点右上角 ··· →「在浏览器打开」，再用浏览器菜单添加。'
  }
  if (/QQ\//i.test(ua) && !/QQBrowser/i.test(ua)) {
    return 'QQ 里不能直接加桌面：点右上角 ··· →「在浏览器打开」，再用浏览器菜单添加。'
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return '请用 Safari 打开本站，点底部分享（方框↑）→「添加到主屏幕」。'
  }
  if (/Android/i.test(ua)) {
    return '安卓请点浏览器右上角 ··· / 菜单 →「添加到主屏幕」或「安装应用」。若菜单里没有，先点下方复制链接，用系统浏览器打开后再添加。'
  }
  return '请点浏览器菜单 →「添加到主屏幕 / 安装应用」。'
}

/** 设置页：添加到手机桌面 */
export function AddToHomeButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(() => isStandalone())
  const [copied, setCopied] = useState(false)
  const hint = useMemo(() => installHint(), [])

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

  const copyLink = async () => {
    const url = publicAppUrl()
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('复制链接后，用手机浏览器打开再添加到桌面：', url)
    }
  }

  const onInstallClick = async () => {
    if (done || !deferred) return
    setBusy(true)
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      setDeferred(null)
      if (choice.outcome === 'accepted') setDone(true)
    } catch {
      /* 看下方说明 */
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <p className="mt-3 rounded-xl bg-brand-soft px-3 py-2.5 text-sm font-medium text-brand-dark">
        已在桌面打开，可直接使用。
      </p>
    )
  }

  return (
    <div className="mt-3">
      <p className="rounded-xl bg-surface px-3 py-2.5 text-[0.8rem] leading-relaxed text-muted">
        {hint}
      </p>

      {deferred ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onInstallClick()}
          className="mt-3 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? '请稍候…' : '一键添加到桌面'}
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => void copyLink()}
        className={`mt-2 w-full rounded-xl px-4 py-3 text-sm font-semibold ${
          deferred
            ? 'border border-line bg-surface text-ink'
            : 'bg-brand text-white'
        }`}
      >
        {copied ? '已复制，请到浏览器粘贴打开' : '复制链接'}
      </button>
    </div>
  )
}
