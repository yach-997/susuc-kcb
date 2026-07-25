import { useEffect } from 'react'
import { ChatWidget } from '@lucius-ai/chat-widget'

/** 腾讯云 SCF 香港反代（国内手机可达） */
const WORKER = 'https://1307642541-fjzcu650c3.ap-hongkong.tencentscf.com'
const WIDGET_ID = 'wgt_56dtde6o'
const apiBaseUrl =
  (import.meta.env.VITE_LUCIUS_API_BASE as string | undefined)?.trim() ||
  `${WORKER}/api/v2`
const sendUrl =
  (import.meta.env.VITE_LUCIUS_SEND_URL as string | undefined)?.trim() ||
  `${WORKER}/bot/message`

/** Lucius 现要求 visitorEmail；无邮箱时接口会失败一直转圈 */
function ensureVisitorEmail() {
  try {
    const key = `lcw-email-${WIDGET_ID}`
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, 'guest@susuc-kcb.local')
    }
  } catch {
    /* ignore */
  }
}

/** 抬高客服悬浮按钮，避免挡住底部导航 */
function liftFab() {
  document.querySelectorAll('div').forEach((el) => {
    const s = (el as HTMLElement).style
    if (
      s.position === 'fixed' &&
      (s.bottom === '24px' || s.bottom === '24') &&
      (s.right === '24px' || s.right === '24' || s.left === '24px' || s.left === '24')
    ) {
      s.bottom = '80px'
    }
  })
}

export function LuciusSupport() {
  useEffect(() => {
    ensureVisitorEmail()
    liftFab()
    const t1 = window.setTimeout(liftFab, 300)
    const t2 = window.setTimeout(liftFab, 1200)
    const obs = new MutationObserver(liftFab)
    obs.observe(document.body, { childList: true, subtree: true })
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      obs.disconnect()
    }
  }, [])

  return (
    <ChatWidget
      widgetId={WIDGET_ID}
      position="right"
      headerColor="#0d6e5a"
      companyName="校园百事通"
      zIndex={60}
      apiBaseUrl={apiBaseUrl}
      sendUrl={sendUrl}
    />
  )
}
