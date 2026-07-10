import { useCallback, useEffect, useState } from 'react'
import type { TimetablePayload } from '../types'
import { loadTimetable, saveTimetable } from '../lib/storage'

function mergeKeepingManual(
  incoming: TimetablePayload,
  existing: TimetablePayload | null,
): TimetablePayload {
  const withSource = (payload: TimetablePayload): TimetablePayload => ({
    ...payload,
    courses: payload.courses.map((c) => ({
      ...c,
      source: c.source || 'import',
    })),
  })

  if (!existing?.courses?.length) return withSource(incoming)

  const manuals = existing.courses.filter((c) => c.source === 'manual')
  if (!manuals.length) return withSource(incoming)

  const imported = incoming.courses.map((c) => ({
    ...c,
    source: (c.source === 'manual' ? 'manual' : 'import') as 'import' | 'manual',
  }))

  return {
    ...incoming,
    termLabel: incoming.termLabel || existing.termLabel,
    termStart: incoming.termStart || existing.termStart,
    courses: [...imported, ...manuals],
  }
}

export function useTimetable() {
  const [data, setData] = useState<TimetablePayload | null>(() => loadTimetable())

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'susuc-timetable-v1') setData(loadTimetable())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const importData = useCallback((payload: TimetablePayload) => {
    const merged = mergeKeepingManual(payload, loadTimetable())
    saveTimetable(merged)
    setData(merged)
  }, [])

  const refresh = useCallback(() => {
    setData(loadTimetable())
  }, [])

  return { data, importData, refresh, setData }
}
