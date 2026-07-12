import { useEffect, useMemo, useRef, useState } from 'react'

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

/** 分机型说明（始终展示） */
function deviceTips(): string[] {
  const ua = navigator.userAgent || ''
  if (/MicroMessenger/i.test(ua)) {
    return [
      '微信：点右上角 ··· →「在浏览器打开」',
      '再用浏览器打开后，点下方「一键添加到桌面」',
    ]
  }
  if (/QQ\//i.test(ua) && !/QQBrowser/i.test(ua)) {
    return [
      'QQ：点右上角 ··· →「在浏览器打开」',
      '再用浏览器打开后，点下方「一键添加到桌面」',
    ]
  }
  if (/baidubrowser|baiduboxapp/i.test(ua)) {
    return [
      '百度：请用系统浏览器 / Safari 打开本站',
      '打开后点下方「一键添加到桌面」',
    ]
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return ['苹果：点底部分享（方框↑）→「添加到主屏幕」']
  }
  if (/Android/i.test(ua)) {
    return [
      '安卓：先点下方「一键添加到桌面」',
      '若无弹窗：点浏览器右上角 ··· →「添加到主屏幕」或「安装应用」',
    ]
  }
  return [
    '点下方「一键添加到桌面」',
    '若无反应：浏览器菜单 →「添加到主屏幕 / 安装应用」',
  ]
}

/** 设置页：一键添加 + 分机型说明 */
export function AddToHomeButton() {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(() => isStandalone())
  const [msg, setMsg] = useState<string | null>(null)
  const tips = useMemo(() => deviceTips(), [])

  useEffect(() => {
    if (isStandalone()) {
      setDone(true)
      return
    }
    const onBip = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
      setMsg(null)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  const onClick = async () => {
    if (done || busy) return
    setMsg(null)

    let event = deferredRef.current
    if (!event) {
      setBusy(true)
      const deadline = Date.now() + 3000
      while (!deferredRef.current && Date.now() < deadline) {
        await new Promise((r) => window.setTimeout(r, 150))
        if (isStandalone()) {
          setDone(true)
          setBusy(false)
          return
        }
      }
      event = deferredRef.current
      setBusy(false)
    }

    if (!event) {
      setMsg('当前浏览器不支持一键添加，请按上方说明操作')
      return
    }

    setBusy(true)
    try {
      await event.prompt()
      const choice = await event.userChoice
      deferredRef.current = null
      if (choice.outcome === 'accepted') setDone(true)
    } catch {
      setMsg('添加未完成，请稍后再试或按上方说明操作')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <p className="mt-3 rounded-xl bg-brand-soft px-3 py-2.5 text-sm font-medium text-brand-dark">
        已添加到桌面
      </p>
    )
  }

  return (
    <div className="mt-3">
      <ol className="space-y-1.5 rounded-xl bg-surface px-3 py-2.5 text-[0.8rem] leading-relaxed text-muted">
        {tips.map((t, i) => (
          <li key={t} className="flex gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[0.65rem] font-bold text-white">
              {i + 1}
            </span>
            <span className="min-w-0">{t}</span>
          </li>
        ))}
      </ol>

      <button
        type="button"
        disabled={busy}
        onClick={() => void onClick()}
        className="mt-3 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? '请稍候…' : '一键添加到桌面'}
      </button>
      {msg && (
        <p className="mt-2 text-center text-[0.75rem] text-muted">{msg}</p>
      )}
    </div>
  )
}
