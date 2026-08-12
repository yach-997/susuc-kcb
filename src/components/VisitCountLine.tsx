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

/** 同一次页面加载只打一次 RPC（StrictMode 双挂载复用同一 Promise） */
let bumpPromise: Promise<number | null> | null = null

async function doBumpPageview(): Promise<number | null> {
  if (!isSupabaseConfigured()) return null
  const sb = getSupabase()
  if (!sb) return null

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, error } = await sb.rpc('bump_pageview', {
        p_visitor_id: getVisitorId(),
      })
      if (error) {
        if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * attempt))
        continue
      }
      const row = data as { ok?: boolean; realTotal?: number } | null
      if (!row?.ok) {
        if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * attempt))
        continue
      }
      return Math.max(0, Number(row.realTotal) || 0)
    } catch {
      if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * attempt))
    }
  }
  return null
}

function bumpSharedVisitOnce(): Promise<number | null> {
  if (!bumpPromise) bumpPromise = doBumpPageview()
  return bumpPromise
}

function useVisitTotal(): number | null {
  const [total, setTotal] = useState<number | null>(() =>
    readStoredNumber(VISIT_CACHE_TOTAL_KEY),
  )
  const floorTotal = useMemo(() => computeVisitTotal(0), [])

  useEffect(() => {
    let alive = true

    const apply = (real: number) => {
      if (!alive) return
      const safeReal = Math.max(0, Math.floor(real))
      const prevShown = readStoredNumber(VISIT_CACHE_TOTAL_KEY) ?? 0
      writeStoredNumber(VISIT_CACHE_REAL_KEY, safeReal)
      const next = computeVisitTotal(safeReal)
      // 展示不回退；真实次数以服务端为准
      const shown = Math.max(next, floorTotal, prevShown)
      setTotal(shown)
      writeStoredNumber(VISIT_CACHE_TOTAL_KEY, shown)
    }

    void bumpSharedVisitOnce().then((remote) => {
      if (!alive) return

      if (remote != null) {
        apply(remote)
        return
      }

      // 接口失败：只展示已缓存值，绝不本地瞎 +1（否则关开会「还原」）
      const cached = readStoredNumber(VISIT_CACHE_TOTAL_KEY)
      if (cached != null) setTotal(Math.max(cached, floorTotal))
      else setTotal(floorTotal)
    })

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
