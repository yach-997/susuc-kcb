import type { FreshnessInfo } from '../types'

interface Props {
  info: FreshnessInfo
}

export function StatusBanner({ info }: Props) {
  return (
    <div
      className={`mx-3 mt-3 rounded-xl border px-3 py-2.5 text-sm font-medium shadow-sm animate-slide-up ${info.bannerClass}`}
      role="status"
    >
      {info.label}
    </div>
  )
}
