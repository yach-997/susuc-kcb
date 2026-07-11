import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { decodeImportPayload, summarizeCourses } from '../lib/storage'
import type { TimetablePayload } from '../types'

interface Props {
  onImport: (payload: TimetablePayload) => void
}

export function ImportPage({ onImport }: Props) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)

  const encoded = useMemo(() => {
    // hash 路由下 query 可能在 hash 内：#/import?d=...
    const fromSearch = params.get('d')
    if (fromSearch) return fromSearch
    const hash = window.location.hash
    const q = hash.indexOf('?')
    if (q >= 0) {
      return new URLSearchParams(hash.slice(q + 1)).get('d')
    }
    return null
  }, [params])

  useEffect(() => {
    if (!encoded) {
      setError('缺少课表数据参数')
      return
    }
    try {
      const payload = decodeImportPayload(encoded)
      onImport(payload)
      setSummary(summarizeCourses(payload.courses).label)
      const t = window.setTimeout(() => navigate('/', { replace: true }), 1200)
      return () => window.clearTimeout(t)
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析失败')
    }
  }, [encoded, onImport, navigate])

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center animate-fade-in">
      {error ? (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-expired font-bold">
            ×
          </div>
          <h1 className="mt-4 text-lg font-bold text-ink">导入失败</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button
            type="button"
            className="mt-6 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white"
            onClick={() => navigate('/guide')}
          >
            返回导入说明
          </button>
        </>
      ) : (
        <>
          <div className="h-12 w-12 animate-pulse rounded-full border-4 border-brand border-t-transparent" />
          <h1 className="mt-5 text-lg font-bold text-ink">正在导入课表</h1>
          <p className="mt-2 text-sm text-muted">
            {summary != null ? `已写入 ${summary}，即将跳转…` : '解析数据中…'}
          </p>
        </>
      )}
    </div>
  )
}
