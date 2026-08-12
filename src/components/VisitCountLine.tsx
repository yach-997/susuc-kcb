import { useEffect, useMemo, useState } from 'react'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { getVisitorId } from '../lib/telemetry'
import {
  VISIT_CACHE_REAL_KEY,
  VISIT_CACHE_TODAY_KEY,
  VISIT_CACHE_TOTAL_KEY,
  computeVisitTotal,
  formatVisitCount,
  readStoredNumber,
  writeStoredNumber,
} from '../lib/visitStats'

/** 整页刷新只计 1 次（避免 React StrictMode 双调用） */
let hitLock = false

async function bumpSharedVisit(): Promise<{
  realTotal: number
  todayVisitors: number
} | null> {
  if (!isSupabaseConfigured()) return null
  const sb = getSupabase()
  if (!sb) return null
  try {
    const { data, error } = await sb.rpc('bump_pageview', {
      p_visitor_id: getVisitorId(),
    })
    if (error) return null
    const row = data as {
      ok?: boolean
      realTotal?: number
      todayVisitors?: number
    } | null
    if (!row?.ok) return null
    return {
      realTotal: Math.max(0, Number(row.realTotal) || 0),
      todayVisitors: Math.max(0, Number(row.todayVisitors) || 0),
    }
  } catch {
    return null
  }
}

function useVisitStats(): {
  total: number | null
  todayVisitors: number | null
} {
  const [total, setTotal] = useState<number | null>(() =>
    readStoredNumber(VISIT_CACHE_TOTAL_KEY),
  )
  const [todayVisitors, setTodayVisitors] = useState<number | null>(() =>
    readStoredNumber(VISIT_CACHE_TODAY_KEY),
  )
  const floorTotal = useMemo(() => computeVisitTotal(0), [])

  useEffect(() => {
    let alive = true

    const commit = (real: number, today: number) => {
      if (!alive) return
      const safeReal = Math.max(0, Math.floor(real))
      const safeToday = Math.max(0, Math.floor(today))
      writeStoredNumber(VISIT_CACHE_REAL_KEY, safeReal)
      writeStoredNumber(VISIT_CACHE_TODAY_KEY, safeToday)
      const next = computeVisitTotal(safeReal)
      // 不低于锚点虚增底数；允许从旧缓存 1855 升到 5836+
      const shown = Math.max(next, floorTotal)
      setTotal(shown)
      setTodayVisitors(safeToday)
      writeStoredNumber(VISIT_CACHE_TOTAL_KEY, shown)
    }

    const run = async () => {
      if (hitLock) return
      hitLock = true

      const prevReal = readStoredNumber(VISIT_CACHE_REAL_KEY) ?? 0
      const prevToday = readStoredNumber(VISIT_CACHE_TODAY_KEY) ?? 0
      const remote = await bumpSharedVisit()

      if (!alive) return

      if (remote) {
        commit(remote.realTotal, remote.todayVisitors)
        return
      }

      // SQL 未执行 / 网络失败：只保证累计不低于锚点+虚增
      const next = computeVisitTotal(prevReal)
      const shown = Math.max(next, floorTotal)
      setTotal(shown)
      writeStoredNumber(VISIT_CACHE_TOTAL_KEY, shown)
      if (prevToday > 0) setTodayVisitors(prevToday)
    }

    void run()

    return () => {
      alive = false
    }
  }, [floorTotal])

  return { total, todayVisitors }
}

/** 底部导航上方：有无课表都常驻可见 */
export function VisitCountHint() {
  const { total, todayVisitors } = useVisitStats()
  return (
    <p className="text-center text-[0.65rem] leading-relaxed tabular-nums tracking-wide text-muted">
      累计访问量 {total == null ? '…' : `${formatVisitCount(total)}次`}
      {todayVisitors != null && (
        <>
          <span className="mx-1 text-line">·</span>
          今日 {formatVisitCount(todayVisitors)} 人
        </>
      )}
    </p>
  )
}
