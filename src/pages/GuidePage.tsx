import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BOOKMARKLET_TARGET_PLACEHOLDER,
  buildBookmarkletSource,
  minifyBookmarklet,
} from '../lib/bookmarklet'
import { PASTE_EXAMPLE, parsePastedTimetable } from '../lib/parsePaste'
import { parseZfPdfFile } from '../lib/parsePdf'
import { buildMockPayload } from '../lib/mockData'
import type { TimetablePayload } from '../types'

interface Props {
  onImport: (payload: TimetablePayload) => void
}

export function GuidePage({ onImport }: Props) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [target, setTarget] = useState(() => {
    const { origin, pathname } = window.location
    const base = pathname.replace(/\/index\.html$/, '').replace(/\/$/, '') || ''
    return `${origin}${base}/`
  })

  const href = useMemo(() => {
    const src = buildBookmarkletSource(target || BOOKMARKLET_TARGET_PLACEHOLDER)
    return minifyBookmarklet(src)
  }, [target])

  const doImport = (payload: TimetablePayload, tip: string) => {
    onImport(payload)
    setError(null)
    setOkMsg(tip)
    window.setTimeout(() => navigate('/'), 900)
  }

  const handlePdf = async (file: File | null) => {
    if (!file) return
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setError('请选择 PDF 文件（教务系统里下载的课表）')
      return
    }
    setBusy(true)
    setError(null)
    setOkMsg(null)
    setFileName(file.name)
    try {
      const payload = await parseZfPdfFile(file)
      doImport(payload, `已从 PDF 导入 ${payload.courses.length} 门课`)
    } catch (e) {
      setOkMsg(null)
      setError(e instanceof Error ? e.message : 'PDF 解析失败')
    } finally {
      setBusy(false)
    }
  }

  const handlePasteImport = () => {
    try {
      const payload = parsePastedTimetable(text)
      doImport(payload, `已导入 ${payload.courses.length} 门课`)
    } catch (e) {
      setOkMsg(null)
      setError(e instanceof Error ? e.message : '导入失败')
    }
  }

  const handleDemo = () => {
    doImport(buildMockPayload(0), '已载入演示课表')
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(href)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = href
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5 animate-fade-in">
      <h1 className="font-display text-2xl font-bold text-ink">导入课表</h1>
      <p className="mt-1 text-sm text-muted leading-relaxed">
        最简单：教务下载 PDF → 在这里上传。数据只存在你手机里。
      </p>

      <section className="mt-5 rounded-2xl border border-line bg-white/90 p-4 shadow-sm">
        <div className="text-xs font-semibold text-brand">推荐 · 上传 PDF</div>
        <h2 className="mt-1 font-semibold text-ink">导入教务课表文件</h2>

        <ol className="mt-3 space-y-2 text-sm text-muted leading-relaxed">
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[0.7rem] font-bold text-white">
              1
            </span>
            <span>
              手机打开教务{' '}
              <span className="font-mono text-[0.7rem] text-ink">61.139.105.138</span>
              ，登录后打开课表
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[0.7rem] font-bold text-white">
              2
            </span>
            <span>点页面上的「打印」或「导出 PDF」，保存到手机</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[0.7rem] font-bold text-white">
              3
            </span>
            <span>回到本页，点下面按钮选择这个 PDF</span>
          </li>
        </ol>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => handlePdf(e.target.files?.[0] ?? null)}
        />

        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="mt-4 w-full rounded-xl bg-brand px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-brand/20 active:scale-[0.99] transition disabled:opacity-60"
        >
          {busy ? '正在识别课表…' : '选择课表 PDF'}
        </button>

        {fileName && (
          <p className="mt-2 truncate text-center text-[0.75rem] text-muted">
            已选：{fileName}
          </p>
        )}

        {error && (
          <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-expired">
            {error}
          </p>
        )}
        {okMsg && (
          <p className="mt-2 rounded-xl border border-brand/30 bg-brand-soft px-3 py-2 text-sm text-brand-dark">
            {okMsg}
          </p>
        )}

        <button
          type="button"
          onClick={handleDemo}
          className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink"
        >
          先看演示课表（不用上传）
        </button>
      </section>

      <details className="mt-4 rounded-2xl border border-line bg-white/90 p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          备选：复制粘贴文字
        </summary>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          PDF 不好用时，可在教务长按复制课表文字，粘贴到下面。
        </p>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          rows={6}
          placeholder={`在这里长按粘贴…\n\n示例：\n${PASTE_EXAMPLE}`}
          className="mt-3 w-full resize-y rounded-xl border border-line bg-surface px-3 py-3 text-sm leading-relaxed outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={handlePasteImport}
          className="mt-2 w-full rounded-xl bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand-dark"
        >
          从文字导入
        </button>
      </details>

      <details className="mt-3 rounded-2xl border border-line bg-white/90 p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          高级：电脑书签（一般不用）
        </summary>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          手机浏览器通常会拦截书签脚本。请优先用上面的 PDF 上传。
        </p>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="mt-3 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
          placeholder={BOOKMARKLET_TARGET_PLACEHOLDER}
        />
        <a
          href={href}
          onClick={(e) => e.preventDefault()}
          draggable
          className="mt-3 flex items-center justify-center rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white"
          title="拖到书签栏"
        >
          川轻化·导入课表（拖到书签栏）
        </a>
        <button
          type="button"
          onClick={copyCode}
          className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium"
        >
          {copied ? '已复制' : '复制书签代码'}
        </button>
      </details>
    </div>
  )
}
