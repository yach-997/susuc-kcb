import { useEffect, useRef, useState } from 'react'

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

/** 设置页：一键添加到手机桌面 */
export function AddToHomeButton() {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(() => isStandalone())
  const [msg, setMsg] = useState<string | null>(null)

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
      // SW 刚注册时事件可能稍晚到达，短等一会儿
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
      setMsg('当前浏览器不支持一键添加')
      return
    }

    setBusy(true)
    try {
      await event.prompt()
      const choice = await event.userChoice
      deferredRef.current = null
      if (choice.outcome === 'accepted') setDone(true)
    } catch {
      setMsg('添加未完成，请稍后再试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={busy || done}
        onClick={() => void onClick()}
        className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {done ? '已添加到桌面' : busy ? '请稍候…' : '一键添加到桌面'}
      </button>
      {msg && !done && (
        <p className="mt-2 text-center text-[0.75rem] text-muted">{msg}</p>
      )}
    </div>
  )
}
