import { useEffect } from 'react'
import { trackPageOpen } from '../lib/telemetry'

/** 静默上报每日打开（需配置 Supabase） */
export function TelemetryBoot() {
  useEffect(() => {
    trackPageOpen()
  }, [])
  return null
}
