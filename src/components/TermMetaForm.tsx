import { useMemo, useState, type FormEvent } from 'react'
import {
  guessTermLabel,
  normalizeTermLabel,
  toMondayIso,
} from '../lib/storage'

export interface TermMeta {
  termLabel: string
  termStart: string
}

interface Props {
  initialLabel?: string
  initialStart?: string
  /** 如「9 门课 · 27 条课次」 */
  courseSummary?: string
  submitText?: string
  onSubmit: (meta: TermMeta) => void
  onCancel?: () => void
}

export function TermMetaForm({
  initialLabel,
  initialStart,
  courseSummary,
  submitText = '保存并查看课表',
  onSubmit,
  onCancel,
}: Props) {
  const [termLabel, setTermLabel] = useState(
    () => normalizeTermLabel(initialLabel) || guessTermLabel(),
  )
  const [termStart, setTermStart] = useState(initialStart || '')
  const [error, setError] = useState<string | null>(null)

  const mondayHint = useMemo(() => {
    if (!termStart) return null
    const iso = toMondayIso(termStart)
    if (!iso || iso === termStart) return null
    const [, m, d] = iso.split('-')
    return `已按周一对齐：${Number(m)}月${Number(d)}日`
  }, [termStart])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const label = termLabel.trim()
    if (!label) {
      setError('请填写学期，例如：2025-2026 上学期')
      return
    }
    if (!termStart) {
      setError('请选择第 1 周星期一的日期')
      return
    }
    const monday = toMondayIso(termStart)
    if (!monday) {
      setError('日期格式不对，请重新选择')
      return
    }
    setError(null)
    onSubmit({ termLabel: label, termStart: monday })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-line bg-white/95 p-4 shadow-sm animate-slide-up"
    >
      <div className="text-xs font-semibold text-brand">还差一步</div>
      <h2 className="mt-1 text-lg font-semibold text-ink">填写学期信息</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        {courseSummary != null
          ? `已识别 ${courseSummary}。再填两项，课表就能按日期自动跳到本周、显示今天的课。`
          : '填好后，课表会按日期自动跳到本周，并优先显示今天的课。'}
      </p>

      <label className="mt-4 block text-sm font-medium text-ink">
        这是哪个学期？
        <input
          value={termLabel}
          onChange={(e) => {
            setTermLabel(e.target.value)
            setError(null)
          }}
          className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
          placeholder="例如：2025-2026 上学期"
          autoComplete="off"
        />
      </label>

      <label className="mt-3 block text-sm font-medium text-ink">
        开学上课第 1 周星期一是几月几号？
        <span className="mt-0.5 block text-xs font-normal text-muted">
          请填校历上第 1 周的星期一；若填了别的天，会自动对齐到那周周一
        </span>
        <input
          type="date"
          value={termStart}
          onChange={(e) => {
            setTermStart(e.target.value)
            setError(null)
          }}
          className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
        />
      </label>
      {mondayHint && (
        <p className="mt-1 text-xs text-brand-dark">{mondayHint}</p>
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-expired">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="mt-4 w-full rounded-xl bg-brand px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-brand/20"
      >
        {submitText}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink"
        >
          取消
        </button>
      )}
    </form>
  )
}
