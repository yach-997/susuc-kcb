import { getChannelUrl } from '../lib/storage'

export function ChannelCTA() {
  const url = getChannelUrl()

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mx-3 mb-2 flex items-center gap-3 rounded-2xl border border-brand/20 bg-gradient-to-r from-brand to-brand-dark px-4 py-3 text-white shadow-lg shadow-brand/20 active:scale-[0.99] transition animate-slide-up"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg font-display font-bold">
        通
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight">加入频道获取调课通知</div>
        <div className="mt-0.5 text-[0.7rem] text-white/80 truncate">
          第一时间同步停课 / 调课 / 考试安排
        </div>
      </div>
      <span className="text-white/90 text-lg" aria-hidden>
        →
      </span>
    </a>
  )
}
