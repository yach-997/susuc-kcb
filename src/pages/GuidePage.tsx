import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TermMetaForm } from '../components/TermMetaForm'
import {
  base64ToArrayBuffer,
  clearImportDraft,
  fileToBase64,
  isInAppBrowser,
  loadImportDraft,
  looksLikePdf,
  readBlobBuffer,
  saveImportDraft,
} from '../lib/importDraft'
import { parseZfPdfBuffer } from '../lib/parsePdf'
import { prefetchCriticalCmaps } from '../lib/pdfAssets'
import { buildMockPayload } from '../lib/mockData'
import { normalizeTermLabel } from '../lib/storage'
import type { TimetablePayload } from '../types'

interface Props {
  onImport: (payload: TimetablePayload) => void
}

export function GuidePage({ onImport }: Props) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const parsingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [pending, setPending] = useState<TimetablePayload | null>(null)
  const [inApp] = useState(() => isInAppBrowser())

  const finishImport = (payload: TimetablePayload, tip: string) => {
    clearImportDraft()
    onImport(payload)
    setPending(null)
    setError(null)
    setOkMsg(tip)
    window.setTimeout(() => navigate('/'), 700)
  }

  /** PDF：先填学期信息再入库 */
  const askMetaThenImport = (
    payload: TimetablePayload,
    name?: string | null,
  ) => {
    setError(null)
    setOkMsg(null)
    if (payload.termStart && payload.termLabel) {
      finishImport(payload, `已导入 ${payload.courses.length} 门课`)
      return
    }
    const draftName = name || fileName || loadImportDraft()?.fileName
    saveImportDraft({
      pending: payload,
      pdfBase64: undefined,
      fileName: draftName,
    })
    setPending(payload)
  }

  const parseBuffer = async (buf: ArrayBuffer, name: string) => {
    if (parsingRef.current) return
    parsingRef.current = true
    setBusy(true)
    setError(null)
    setOkMsg(null)
    setFileName(name)
    try {
      const payload = await parseZfPdfBuffer(buf)
      askMetaThenImport(payload, name)
    } catch (e) {
      // 避免挂载恢复时反复自动重试失败文件
      saveImportDraft({ pdfBase64: undefined, fileName: name, pending: undefined })
      setOkMsg(null)
      setError(e instanceof Error ? e.message : 'PDF 解析失败')
    } finally {
      parsingRef.current = false
      setBusy(false)
    }
  }

  const handlePdf = async (file: File | null) => {
    if (!file) return
    if (!looksLikePdf(file)) {
      setError('请选择教务导出的课表 PDF 文件')
      return
    }
    setError(null)
    setOkMsg(null)
    setFileName(file.name)
    setBusy(true)
    try {
      // 立刻读入并缓存：手机选文件返回时页面常被挂起/重载
      const buf = await readBlobBuffer(file)
      const b64 = await fileToBase64(new Blob([buf], { type: 'application/pdf' }))
      saveImportDraft({
        fileName: file.name,
        pdfBase64: b64,
        pending: undefined,
      })
      parsingRef.current = false
      await parseBuffer(buf, file.name)
    } catch (e) {
      parsingRef.current = false
      setBusy(false)
      setOkMsg(null)
      setError(e instanceof Error ? e.message : '读取 PDF 失败')
    }
  }

  // 恢复：已识别待填学期 / 已选文件未解析完
  useEffect(() => {
    prefetchCriticalCmaps()
    const draft = loadImportDraft()
    if (!draft) return
    if (draft.pending?.courses?.length) {
      setPending(draft.pending)
      setFileName(draft.fileName || null)
      return
    }
    if (draft.pdfBase64 && draft.fileName) {
      setFileName(draft.fileName)
      void parseBuffer(base64ToArrayBuffer(draft.pdfBase64), draft.fileName)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时恢复
  }, [])

  const handleDemo = () => {
    clearImportDraft()
    finishImport(buildMockPayload(0), '已载入演示课表')
  }

  if (pending) {
    return (
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5 animate-fade-in">
        <h1 className="font-display text-2xl font-bold text-ink">确认学期</h1>
        <p className="mt-1 text-sm text-muted leading-relaxed">
          已识别 {pending.courses.length}{' '}
          门课。可先去别处再回来，进度会保留；确认后写入课表。
        </p>
        <div className="mt-5">
          <TermMetaForm
            initialLabel={pending.termLabel}
            initialStart={pending.termStart}
            courseCount={pending.courses.length}
            onCancel={() => {
              clearImportDraft()
              setPending(null)
            }}
            onSubmit={({ termLabel, termStart }) => {
              finishImport(
                {
                  ...pending,
                  termLabel: normalizeTermLabel(termLabel),
                  termStart,
                  updatedAt: new Date().toISOString(),
                },
                `已导入 ${pending.courses.length} 门课`,
              )
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5 animate-fade-in">
      <h1 className="font-display text-2xl font-bold text-ink">导入课表</h1>
      <p className="mt-1 text-sm text-muted leading-relaxed">
        上传教务导出的课表 PDF（表格式 / 列表式均可）。识别后请填写学期与第一周日期。
      </p>

      {inApp && (
        <p className="mt-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted leading-relaxed">
          当前是微信/QQ 内打开，部分机型解析会不稳定。若导入失败，可在系统浏览器中打开本站重试。
        </p>
      )}

      <section className="mt-5 rounded-2xl border border-line bg-white/90 p-4 shadow-sm">
        <div className="text-xs font-semibold text-brand">上传 PDF</div>
        <h2 className="mt-1 font-semibold text-ink">导入教务课表文件</h2>

        <ol className="mt-3 space-y-2 text-sm text-muted leading-relaxed">
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[0.7rem] font-bold text-white">
              1
            </span>
            <span>
              打开教务{' '}
              <span className="font-mono text-[0.7rem] text-ink">61.139.105.138</span>
              ，登录后进入课表
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[0.7rem] font-bold text-white">
              2
            </span>
            <span>点「打印」或「导出 PDF」，保存到手机</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[0.7rem] font-bold text-white">
              3
            </span>
            <span>点下方按钮选择该 PDF（直接选中即可，无需先预览）</span>
          </li>
        </ol>

        <input
          ref={fileRef}
          id="timetable-pdf-input"
          type="file"
          accept="application/pdf,.pdf,application/octet-stream"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            // 允许重复选同一文件
            e.target.value = ''
            void handlePdf(f)
          }}
        />

        <label
          htmlFor="timetable-pdf-input"
          aria-disabled={busy}
          className={`mt-4 flex w-full cursor-pointer items-center justify-center rounded-xl bg-brand px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-brand/20 active:scale-[0.99] transition ${
            busy ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          {busy ? '正在识别课表…' : '选择课表 PDF'}
        </label>

        {fileName && (
          <p className="mt-2 truncate text-center text-[0.75rem] text-muted">
            {busy ? '识别中：' : '已选：'}
            {fileName}
          </p>
        )}

        {error && (
          <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-expired leading-relaxed">
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
    </div>
  )
}
