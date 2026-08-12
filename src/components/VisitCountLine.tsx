import { useEffect, useMemo, useState } from 'react'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { getVisitorId } from '../lib/telemetry'
import {
  VISIT_CACHE_REAL_KEY,
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

function useVisitTotal(): number | null {
  const [total, setTotal] = useState<number | null>(() =>
    readStoredNumber(VISIT_CACHE_TOTAL_KEY),
  )
  const floorTotal = useMemo(() => computeVisitTotal(0), [])

  useEffect(() => {
    let alive = true

    const commit = (real: number) => {
      if (!alive) return
      const safeReal = Math.max(0, Math.floor(real))
      writeStoredNumber(VISIT_CACHE_REAL_KEY, safeReal)
      const next = computeVisitTotal(safeReal)
      const shown = Math.max(next, floorTotal)
      setTotal(shown)
      writeStoredNumber(VISIT_CACHE_TOTAL_KEY, shown)
    }

    const run = async () => {
      if (hitLock) return
      hitLock = true

      const prevReal = readStoredNumber(VISIT_CACHE_REAL_KEY) ?? 0
      const remote = await bumpSharedVisit()

      if (!alive) return

      if (remote) {
        commit(remote.realTotal)
        return
      }

      commit(prevReal + 1)
    }

    void run()

    return () => {
      alive = false
    }
  }, [floorTotal])

  return total
}

/** 底部导航上方 */
export function VisitCountHint() {
  const total = useVisitTotal()
  return (
    <p className="text-center text-[0.65rem] leading-relaxed tabular-nums tracking-wide text-muted">
      累计访问量 {total == null ? '…' : `${formatVisitCount(total)}次`}
    </p>
  )
}
