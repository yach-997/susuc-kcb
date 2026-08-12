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

/** 整页加载计 1 次（避免 React StrictMode 双调用把一次刷新算两次） */
let hitLock = false

async function bumpSharedVisit(): Promise<{
  realTotal: number
  todayViews: number
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
      todayViews: Math.max(0, Number(row.todayVisitors) || 0),
    }
  } catch {
    return null
  }
}

function useVisitStats(): {
  total: number | null
  todayViews: number | null
} {
  const [total, setTotal] = useState<number | null>(() =>
    readStoredNumber(VISIT_CACHE_TOTAL_KEY),
  )
  const [todayViews, setTodayViews] = useState<number | null>(() =>
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
      const shown = Math.max(next, floorTotal)
      setTotal(shown)
      setTodayViews(safeToday)
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
        commit(remote.realTotal, remote.todayViews)
        return
      }

      // SQL 未就绪：本地仍按刷新 +1，保证你描述的行为在单机可测
      const localReal = prevReal + 1
      const localToday = prevToday + 1
      commit(localReal, localToday)
    }

    void run()

    return () => {
      alive = false
    }
  }, [floorTotal])

  return { total, todayViews }
}

/** 底部导航上方 */
export function VisitCountHint() {
  const { total, todayViews } = useVisitStats()
  return (
    <p className="text-center text-[0.65rem] leading-relaxed tabular-nums tracking-wide text-muted">
      累计访问量 {total == null ? '…' : `${formatVisitCount(total)}次`}
      {todayViews != null && (
        <>
          <span className="mx-1 text-line">·</span>
          今日 {formatVisitCount(todayViews)} 次
        </>
      )}
    </p>
  )
}
