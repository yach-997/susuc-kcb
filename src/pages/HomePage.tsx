import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChannelCTA } from '../components/ChannelCTA'
import { StatusBanner } from '../components/StatusBanner'
import { StaleModal } from '../components/StaleModal'
import { WeekView } from '../components/WeekView'
import {
  currentTeachingWeek,
  getFreshness,
} from '../lib/storage'
import type { TimetablePayload } from '../types'

const STALE_DISMISS_KEY = 'susuc-stale-dismissed-at'

interface Props {
  data: TimetablePayload | null
}

export function HomePage({ data }: Props) {
  const navigate = useNavigate()
  const freshness = useMemo(() => getFreshness(data?.updatedAt), [data?.updatedAt])
  const teachingWeek = currentTeachingWeek(data?.termStart)
  const today = ((new Date().getDay() + 6) % 7) + 1
  const [weekday, setWeekday] = useState(today)
  const [showStale, setShowStale] = useState(false)

  useEffect(() => {
    if (!data?.updatedAt) return
    if (freshness.days == null || freshness.days <= 7) return
    const dismissed = sessionStorage.getItem(STALE_DISMISS_KEY)
    if (dismissed === data.updatedAt) return
    setShowStale(true)
  }, [data?.updatedAt, freshness.days])

  const dismissStale = () => {
    if (data?.updatedAt) sessionStorage.setItem(STALE_DISMISS_KEY, data.updatedAt)
    setShowStale(false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-4 pt-5 pb-1">
        <p className="font-display text-[0.7rem] font-semibold tracking-[0.18em] uppercase text-brand">
          SUSUC
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">
          川轻化课表
        </h1>
        <p className="mt-1 text-sm text-muted">
          {data
            ? `${data.school}${teachingWeek ? ` · 第 ${teachingWeek} 周` : ''}`
            : '本地课表 · 零后端'}
        </p>
      </header>

      <StatusBanner info={freshness} />

      {data && data.courses.length > 0 ? (
        <WeekView
          courses={data.courses}
          teachingWeek={teachingWeek}
          selectedWeekday={weekday}
          onSelectWeekday={setWeekday}
        />
      ) : (
        <div className="mx-3 mt-6 flex flex-1 flex-col items-center rounded-2xl border border-dashed border-line bg-white/70 px-6 py-12 text-center animate-slide-up">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand font-display text-xl font-bold">
            课
          </div>
          <h2 className="mt-4 text-lg font-semibold text-ink">还没有课表</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            从教务下载课表 PDF，回来上传即可。数据只保存在你手机里。
          </p>
          <Link
            to="/guide"
            className="mt-6 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-md shadow-brand/20"
          >
            去导入课表
          </Link>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-brand"
            onClick={() => navigate('/guide')}
          >
            或先看演示课表
          </button>
        </div>
      )}

      <ChannelCTA />

      <StaleModal
        open={showStale}
        days={freshness.days ?? 0}
        onClose={dismissStale}
        onGoGuide={() => {
          dismissStale()
          navigate('/guide')
        }}
      />
    </div>
  )
}
