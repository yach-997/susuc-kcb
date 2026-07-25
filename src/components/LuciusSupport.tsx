import { useEffect } from 'react'
import { ChatWidget } from '@lucius-ai/chat-widget'

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
      widgetId="wgt_56dtde6o"
      position="right"
      headerColor="#0d6e5a"
      companyName="校园百事通"
      zIndex={60}
    />
  )
}
