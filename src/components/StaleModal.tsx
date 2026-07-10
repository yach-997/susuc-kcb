interface Props {
  open: boolean
  days: number
  onClose: () => void
  onGoGuide: () => void
}

export function StaleModal({ open, days, onClose, onGoGuide }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 modal-backdrop bg-black/45">
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stale-title"
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-2xl text-orange-600">
          !
        </div>
        <h2 id="stale-title" className="font-display text-lg font-bold text-ink">
          课表可能已过期
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          距离上次导入已过去 <span className="font-semibold text-stale">{days}</span>{' '}
          天。调课、停课信息可能未同步，建议重新用书签从教务系统导入。
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onGoGuide}
            className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] transition"
          >
            查看导入方法
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-dark active:scale-[0.98] transition"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  )
}
