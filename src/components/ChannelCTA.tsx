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
        QQ
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight">使用有问题？点这里联系</div>
        <div className="mt-0.5 text-[0.7rem] text-white/80 truncate">
          跳转 QQ，不懂就问
        </div>
      </div>
      <span className="text-white/90 text-lg" aria-hidden>
        →
      </span>
    </a>
  )
}
