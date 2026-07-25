import { useEffect, useMemo, useState } from 'react'
import {
  VISIT_BASE,
  VISIT_CACHE_REAL_KEY,
  VISIT_CACHE_TOTAL_KEY,
  fakeVisitGrowth,
  formatVisitCount,
  parseCounterValue,
  readStoredNumber,
  writeStoredNumber,
} from '../lib/visitStats'

const COUNTER_UP_URL =
  'https://api.counterapi.dev/v1/susuc-kcb/pageviews/up'

/** 整页刷新只计 1 次（避免 React StrictMode 双调用） */
let hitLock = false

async function hitRemoteCounter(): Promise<number | null> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(COUNTER_UP_URL, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data: unknown = await res.json()
    return parseCounterValue(data)
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * 累计 = 1450 + 每日虚增 + 真实访问。
 * 真实访问优先走 CounterAPI（每次打开 +1）；失败则本地 real +1，保证刷新有变化。
 */
function useVisitTotal(): number | null {
  const fake = useMemo(() => fakeVisitGrowth(), [])
  const [display, setDisplay] = useState<number | null>(() =>
    readStoredNumber(VISIT_CACHE_TOTAL_KEY),
  )

  useEffect(() => {
    let alive = true

    const commit = (real: number) => {
      if (!alive) return
      const safeReal = Math.max(0, Math.floor(real))
      writeStoredNumber(VISIT_CACHE_REAL_KEY, safeReal)
      const next = VISIT_BASE + fake + safeReal
      const prev = readStoredNumber(VISIT_CACHE_TOTAL_KEY) ?? 0
      // 展示不回退，避免切换计数源时数字突然变小
      const shown = Math.max(next, prev)
      setDisplay(shown)
      writeStoredNumber(VISIT_CACHE_TOTAL_KEY, shown)
    }

    const run = async () => {
      if (hitLock) return
      hitLock = true

      const prevReal = readStoredNumber(VISIT_CACHE_REAL_KEY) ?? 0
      const remote = await hitRemoteCounter()

      if (!alive) return

      if (remote != null && remote > 0) {
        // 每次打开至少 +1；API 更大时以 API 为准（多端汇总）
        commit(Math.max(remote, prevReal + 1))
        return
      }

      // API 失败：本地仍 +1，刷新能看到变化
      commit(prevReal + 1)
    }

    void run()

    return () => {
      alive = false
    }
  }, [fake])

  return display
}

/** 底部导航上方：有无课表都常驻可见 */
export function VisitCountHint() {
  const total = useVisitTotal()
  return (
    <p className="text-center text-[0.65rem] tabular-nums tracking-wide text-muted">
      累计访问量 {total == null ? '…' : formatVisitCount(total)}
    </p>
  )
}
