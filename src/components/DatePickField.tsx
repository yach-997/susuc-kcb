import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function toIso(y: number, m0: number, d: number): string {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`
}

function parseIso(iso: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const y = Number(m[1])
  const m0 = Number(m[2]) - 1
  const d = Number(m[3])
  if (!y || m0 < 0 || m0 > 11 || d < 1 || d > 31) return null
  return { y, m0, d }
}

function formatCn(iso: string): string {
  const p = parseIso(iso)
  if (!p) return ''
  return `${p.y}年${p.m0 + 1}月${p.d}日`
}

function monthCells(y: number, m0: number): (number | null)[] {
  const first = new Date(y, m0, 1)
  const startPad = first.getDay()
  const days = new Date(y, m0 + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  while (cells.length < 42) cells.push(null)
  return cells
}

interface Props {
  id?: string
  value: string
  onChange: (iso: string) => void
}

/** 自绘整月日历，避免华为等机型原生 date 控件被裁切、只显示半个月 */
export function DatePickField({ id, value, onChange }: Props) {
  const initial = parseIso(value) || (() => {
    const n = new Date()
    return { y: n.getFullYear(), m0: n.getMonth(), d: n.getDate() }
  })()
  const [open, setOpen] = useState(false)
  const [viewY, setViewY] = useState(initial.y)
  const [viewM0, setViewM0] = useState(initial.m0)
  const [picked, setPicked] = useState(value)

  useEffect(() => {
    if (!open) return
    const p = parseIso(value)
    const n = new Date()
    setViewY(p?.y ?? n.getFullYear())
    setViewM0(p?.m0 ?? n.getMonth())
    setPicked(value)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const cells = useMemo(() => monthCells(viewY, viewM0), [viewY, viewM0])

  const shiftMonth = (delta: number) => {
    const d = new Date(viewY, viewM0 + delta, 1)
    setViewY(d.getFullYear())
    setViewM0(d.getMonth())
  }

  const confirm = () => {
    if (!picked) return
    onChange(picked)
    setOpen(false)
  }

  const sheet =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="选择日期"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-[480px] rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="rounded-lg px-2 py-1.5 text-sm font-medium text-brand"
                  onClick={() => shiftMonth(-1)}
                >
                  上月
                </button>
                <p className="text-sm font-semibold text-ink">
                  {viewY}年{viewM0 + 1}月
                </p>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1.5 text-sm font-medium text-brand"
                  onClick={() => shiftMonth(1)}
                >
                  下月
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[0.7rem] text-muted">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-1 font-medium">
                    {w}
                  </div>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (day == null) {
                    return <div key={`e-${i}`} className="aspect-square" />
                  }
                  const iso = toIso(viewY, viewM0, day)
                  const selected = picked === iso
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setPicked(iso)}
                      className={`aspect-square rounded-xl text-sm font-medium transition ${
                        selected
                          ? 'bg-brand text-white'
                          : 'text-ink hover:bg-brand-soft'
                      }`}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-line bg-surface py-3 text-sm font-medium text-ink"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={!picked}
                  onClick={confirm}
                  className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  确定
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(true)}
        className="field-shell mt-1.5 flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className={value ? 'text-sm text-ink' : 'text-sm text-muted'}>
          {value ? formatCn(value) : '点这里选择日期'}
        </span>
        <span className="text-xs text-brand">选日期</span>
      </button>
      {sheet}
    </>
  )
}
