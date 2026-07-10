import { useCallback, useEffect, useState } from 'react'
import type { TimetablePayload } from '../types'
import { loadTimetable, saveTimetable } from '../lib/storage'

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
    saveTimetable(payload)
    setData(payload)
  }, [])

  const refresh = useCallback(() => {
    setData(loadTimetable())
  }, [])

  return { data, importData, refresh, setData }
}
