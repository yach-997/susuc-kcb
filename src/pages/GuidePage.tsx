import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TermMetaForm } from '../components/TermMetaForm'
import {
  base64ToArrayBuffer,
  clearImportDraft,
  fileToBase64,
  inAppBrowserKind,
  isInAppBrowser,
  loadImportDraft,
  looksLikePdf,
  publicAppUrl,
  readBlobBuffer,
  saveImportDraft,
} from '../lib/importDraft'
import { parseZfPdfBuffer } from '../lib/parsePdf'
import { prefetchCriticalCmaps } from '../lib/pdfAssets'
import { hardRefreshApp } from '../lib/hardRefresh'
import { normalizeTermLabel, summarizeCourses } from '../lib/storage'
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
  const [appKind] = useState(() => inAppBrowserKind())
  const [copied, setCopied] = useState(false)

  const copySiteLink = async () => {
    const url = publicAppUrl()
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('复制下面的链接，到手机浏览器打开：', url)
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

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
      finishImport(payload, `已导入 ${summarizeCourses(payload.courses).label}`)
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
      const raw = e instanceof Error ? e.message : String(e)
      let msg =
        raw.startsWith('PDF') ||
        raw.includes('识别') ||
        raw.includes('课表')
          ? raw
          : `PDF 解析失败：${raw}`
      setError(msg)
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

  if (pending) {
    return (
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5 animate-fade-in">
        <h1 className="font-display text-2xl font-bold text-ink">确认学期</h1>
        <p className="mt-1 text-sm text-muted leading-relaxed">
          已识别 {summarizeCourses(pending.courses).label}
          。可先去别处再回来，进度会保留；确认后写入课表。
        </p>
        <div className="mt-5">
          <TermMetaForm
            initialLabel={pending.termLabel}
            initialStart={pending.termStart}
            courseSummary={summarizeCourses(pending.courses).label}
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
                `已导入 ${summarizeCourses(pending.courses).label}`,
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
        上传教务导出的课表 PDF 文件（表格式 / 列表式均可）。识别后请填写学期与开学上课第 1 周星期一的日期。
      </p>

      <section className="mt-5 rounded-2xl border border-line bg-white/90 p-4 shadow-sm">
        <div className="text-xs font-semibold text-brand">上传 PDF</div>
        <h2 className="mt-1 font-semibold text-ink">导入教务课表文件</h2>
        <p className="mt-1 text-[0.75rem] text-muted leading-relaxed">
          跟着截图操作，共 3 步。
        </p>

        <ol className="mt-4 space-y-5 text-sm text-ink leading-relaxed">
          <li>
            <div className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[0.7rem] font-bold text-white">
                1
              </span>
              <p className="min-w-0 flex-1">
                浏览器打开{' '}
                <a
                  className="break-all font-medium text-brand underline"
                  href="https://jwgl.suse.edu.cn"
                  target="_blank"
                  rel="noreferrer"
                >
                  https://jwgl.suse.edu.cn
                </a>
                {' '}登录，再进「个人课表查询」
              </p>
            </div>
            <figure className="mx-auto mt-2 w-full max-w-full rounded-xl border border-line bg-surface p-0">
              <img
                src={`${import.meta.env.BASE_URL}guide/01-login.png`}
                alt="登录教务系统"
                className="mx-auto block h-auto w-full max-w-full object-contain"
                loading="lazy"
              />
            </figure>
            <p className="mt-2 text-center text-[0.75rem] text-muted">
              下面两种入口任选一种：
            </p>
            <div className="mx-auto mt-1.5 grid w-full gap-2">
              <figure className="mx-auto w-full max-w-full rounded-xl border border-line bg-surface">
                <img
                  src={`${import.meta.env.BASE_URL}guide/02-xuan-ke.png`}
                  alt="选课 → 个人课表查询"
                  className="mx-auto block h-auto w-full max-w-full object-contain"
                  loading="lazy"
                />
              </figure>
              <figure className="mx-auto w-full max-w-full rounded-xl border border-line bg-surface">
                <img
                  src={`${import.meta.env.BASE_URL}guide/03-xinxi-chaxun.png`}
                  alt="信息查询 → 个人课表查询"
                  className="mx-auto block h-auto w-full max-w-full object-contain"
                  loading="lazy"
                />
              </figure>
            </div>
          </li>

          <li>
            <div className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[0.7rem] font-bold text-white">
                2
              </span>
              <p className="min-w-0 flex-1">点右上角「输出 PDF」，保存到手机</p>
            </div>
            <figure className="mx-auto mt-2 w-full max-w-full rounded-xl border border-line bg-surface">
              <img
                src={`${import.meta.env.BASE_URL}guide/04-export-pdf.png`}
                alt="点输出PDF"
                className="mx-auto block h-auto w-full max-w-full object-contain"
                loading="lazy"
              />
            </figure>
          </li>

          <li>
            <div className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[0.7rem] font-bold text-white">
                3
              </span>
              <p className="min-w-0 flex-1">点下方按钮，上传刚下载的 PDF 文件</p>
            </div>
          </li>
        </ol>

        <input
          ref={fileRef}
          id="timetable-pdf-input"
          type="file"
          accept="application/pdf,.pdf"
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
          {busy ? '正在识别…最多约 45 秒' : '选择课表 PDF'}
        </label>

        {busy && (
          <p className="mt-2 text-center text-[0.75rem] text-muted">
            正在主线程解析课表，请稍候；超时会自动提示
          </p>
        )}

        {fileName && (
          <p className="mt-2 truncate text-center text-[0.75rem] text-muted">
            {busy ? '识别中：' : '已选：'}
            {fileName}
          </p>
        )}

        {error && (
          <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-expired leading-relaxed">
            <p>{error}</p>
            {inApp && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-ink">
                <p className="text-[0.8rem] font-semibold">
                  当前是在
                  {appKind === 'wechat' ? '微信' : appKind === 'qq' ? 'QQ' : '内置浏览器'}
                  里打开，部分机型会导入失败
                </p>
                <p className="mt-1 text-[0.75rem] text-muted">
                  可改用手机浏览器：右上角 ··· →「
                  {appKind === 'qq' ? '用浏览器打开' : '在浏览器打开'}
                  」，或先复制链接再粘贴打开。
                </p>
                <button
                  type="button"
                  onClick={() => void copySiteLink()}
                  className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-brand-dark"
                >
                  {copied ? '已复制链接' : '复制本站链接'}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirm('清理缓存并刷新页面？课表数据会保留。')) {
                  void hardRefreshApp({ clearTimetable: false })
                }
              }}
              className="mt-2 w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink border border-red-200"
            >
              清理缓存并刷新后再试
            </button>
          </div>
        )}
        {okMsg && (
          <p className="mt-2 rounded-xl border border-brand/30 bg-brand-soft px-3 py-2 text-sm text-brand-dark">
            {okMsg}
          </p>
        )}

        {inApp && !error && (
          <p className="mt-3 text-center text-[0.7rem] leading-relaxed text-muted">
            当前是在
            {appKind === 'wechat' ? '微信' : appKind === 'qq' ? 'QQ' : '内置浏览器'}
            里打开。若导入失败，可点右上角 ··· →「
            {appKind === 'qq' ? '用浏览器打开' : '在浏览器打开'}
            」，或
            <button
              type="button"
              onClick={() => void copySiteLink()}
              className="mx-0.5 font-medium text-brand underline"
            >
              {copied ? '已复制链接' : '复制本站链接'}
            </button>
            到手机浏览器打开。
          </p>
        )}
      </section>
    </div>
  )
}
