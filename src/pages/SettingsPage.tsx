import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AddToHomeButton } from '../components/AddToHomeButton'
import { RestoreByName } from '../components/RestoreByName'
import { TermMetaForm } from '../components/TermMetaForm'
import { APP_VERSION } from '../appVersion'
import { submitUserFeedback } from '../lib/adminApi'
import { clearImportDraft } from '../lib/importDraft'
import { hardRefreshApp } from '../lib/hardRefresh'
import {
  clearTimetable,
  normalizeTermLabel,
  saveTimetable,
  studentNameFromPayload,
  summarizeCourses,
} from '../lib/storage'
import type { TimetablePayload } from '../types'
import { canCloudBackup, loadCloudIdentity } from '../lib/studentCloud'

interface Props {
  data: TimetablePayload | null
  onImport: (payload: TimetablePayload) => void
  onClear: () => void
}

function CloudIdForm({
  data,
  onSave,
}: {
  data: TimetablePayload
  onSave: (next: TimetablePayload) => void
}) {
  const remembered = loadCloudIdentity()
  const [studentId, setStudentId] = useState(
    data.studentId || remembered.studentId,
  )
  const [studentName, setStudentName] = useState(
    data.studentName || remembered.studentName,
  )
  return (
    <form
      className="mt-2 space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({
          ...data,
          studentId: studentId.trim(),
          studentName: studentName.trim(),
        })
      }}
    >
      <p className="text-[11px] text-muted">补全学号和姓名后可云端备份</p>
      <div className="flex gap-1.5">
        <input
          name="studentId"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          required
          autoComplete="off"
          placeholder="学号"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-brand"
        />
        <input
          name="studentName"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          required
          autoComplete="off"
          placeholder="姓名"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-brand"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-brand px-2.5 py-1.5 text-[12px] font-semibold text-white"
        >
          备份
        </button>
      </div>
    </form>
  )
}

function formatUpdatedAt(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function SettingsPage({ data, onImport, onClear }: Props) {
  const navigate = useNavigate()
  const [msg, setMsg] = useState<string | null>(null)
  const [editingTerm, setEditingTerm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [fbContent, setFbContent] = useState('')
  const [fbContact, setFbContact] = useState('')
  const [fbBusy, setFbBusy] = useState(false)
  const [fbMsg, setFbMsg] = useState<string | null>(null)
  const [fbErr, setFbErr] = useState<string | null>(null)

  const flash = (text: string) => {
    setMsg(text)
    window.setTimeout(() => setMsg(null), 2000)
  }

  const onSubmitFeedback = async (e: FormEvent) => {
    e.preventDefault()
    setFbErr(null)
    setFbMsg(null)
    setFbBusy(true)
    try {
      const res = await submitUserFeedback(fbContent, fbContact)
      if (!res.ok) {
        setFbErr(res.error)
        return
      }
      setFbContent('')
      setFbContact('')
      setFbMsg('已提交，谢谢反馈')
    } finally {
      setFbBusy(false)
    }
  }

  const handleHardRefresh = () => {
    if (!confirm('将清理应用缓存并重新加载（课表数据保留），确定吗？')) return
    setRefreshing(true)
    setMsg('正在清理缓存…')
    window.setTimeout(() => {
      window.location.reload()
    }, 4000)
    void hardRefreshApp({ clearTimetable: false }).catch(() => {
      window.location.reload()
    })
  }

  const handleClearTimetable = () => {
    if (!confirm('确定清除本地课表？')) return
    clearImportDraft()
    clearTimetable()
    onClear()
    flash('已清除')
  }

  const summary =
    data && data.courses.length > 0 ? summarizeCourses(data.courses) : null
  const studentName = data ? studentNameFromPayload(data) : ''

  return (
    <div className="flex-1 overflow-y-auto px-3.5 pb-5 pt-3.5 animate-fade-in">
      <h1 className="font-display text-xl font-bold text-ink">设置</h1>

      {msg && (
        <div className="mt-2 rounded-lg border border-brand/20 bg-brand-soft px-2.5 py-1.5 text-xs text-brand-dark">
          {msg}
        </div>
      )}

      {/* 主卡片：课表 + 学期 */}
      <section className="mt-3 rounded-2xl border border-line bg-white p-3.5">
        {summary && data ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {studentName ? (
                  <p className="truncate text-[15px] font-semibold text-ink">
                    {studentName}
                  </p>
                ) : (
                  <p className="text-[15px] font-semibold text-ink">当前课表</p>
                )}
                <p className="mt-0.5 text-[11px] text-muted">
                  {summary.unique} 门课 · {summary.slots} 条课次 ·{' '}
                  {formatUpdatedAt(data.updatedAt)}
                </p>
                {canCloudBackup(data) ? (
                  <p className="mt-1 text-[11px] text-brand-dark">
                    已备份云端 · 学号 {data.studentId} · 姓名 {data.studentName}
                  </p>
                ) : (
                  <CloudIdForm
                    data={data}
                    onSave={(next) => {
                      saveTimetable(next)
                      onImport(next)
                      flash('已保存，正在备份云端')
                    }}
                  />
                )}
              </div>
            </div>

            <dl className="mt-2.5 space-y-1.5 border-t border-line/70 pt-2.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">学期</dt>
                <dd className="text-right font-medium text-ink">
                  {data.termLabel || '未填写'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">第 1 周周一</dt>
                <dd className="text-right font-medium text-ink">
                  {data.termStart || '未填写'}
                </dd>
              </div>
            </dl>

            {editingTerm ? (
              <div className="mt-2.5 border-t border-line/70 pt-2.5">
                <TermMetaForm
                  initialLabel={data.termLabel}
                  initialStart={data.termStart}
                  submitText="保存"
                  onCancel={() => setEditingTerm(false)}
                  onSubmit={({ termLabel, termStart }) => {
                    const next: TimetablePayload = {
                      ...data,
                      termLabel: normalizeTermLabel(termLabel),
                      termStart,
                    }
                    saveTimetable(next)
                    onImport(next)
                    setEditingTerm(false)
                    flash('学期信息已更新')
                  }}
                />
              </div>
            ) : (
              <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => navigate('/guide')}
                  className="rounded-xl bg-brand px-2 py-2.5 text-[13px] font-semibold text-white"
                >
                  重新导入
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTerm(true)}
                  className="rounded-xl border border-line bg-surface px-2 py-2.5 text-[13px] font-medium text-ink"
                >
                  改学期
                </button>
              </div>
            )}
            {!editingTerm && (
              <button
                type="button"
                onClick={handleClearTimetable}
                className="mt-1.5 w-full py-1.5 text-center text-[12px] text-muted"
              >
                清除本地课表
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-[13px] text-muted">还没有导入课表</p>
            <button
              type="button"
              onClick={() => navigate('/guide')}
              className="mt-2.5 w-full rounded-xl bg-brand px-3 py-2.5 text-[13px] font-semibold text-white"
            >
              去导入课表
            </button>
            <RestoreByName onRestored={onImport} />
          </>
        )}
      </section>

      {/* 快捷：桌面（折叠）+ 缓存 */}
      <section className="mt-2 overflow-hidden rounded-2xl border border-line bg-white">
        <details className="group border-b border-line/70">
          <summary className="cursor-pointer list-none px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              <span>
                <span className="block text-[13px] font-medium text-ink">
                  添加到桌面
                </span>
                <span className="block text-[11px] text-muted">打开更快</span>
              </span>
              <span className="text-[12px] text-muted group-open:hidden">
                展开
              </span>
              <span className="hidden text-[12px] text-muted group-open:inline">
                收起
              </span>
            </span>
          </summary>
          <div className="px-3.5 pb-3 [&_.mt-3]:mt-0">
            <AddToHomeButton />
          </div>
        </details>
        <button
          type="button"
          disabled={refreshing}
          onClick={handleHardRefresh}
          className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left disabled:opacity-60"
        >
          <div>
            <p className="text-[13px] font-medium text-ink">
              {refreshing ? '正在清理…' : '清理缓存并刷新'}
            </p>
            <p className="text-[11px] text-muted">页面异常或仍是旧版时用</p>
          </div>
          <span className="text-[12px] text-muted">›</span>
        </button>
      </section>

      {/* 反馈：默认折叠 */}
      <details className="mt-2 rounded-2xl border border-line bg-white open:pb-3">
        <summary className="cursor-pointer list-none px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span>
              <span className="block text-[13px] font-medium text-ink">
                帮助与反馈
              </span>
              <span className="block text-[11px] text-muted">
                留言或加群联系
              </span>
            </span>
            <span className="text-[12px] text-muted">展开</span>
          </span>
        </summary>
        <div className="border-t border-line/70 px-3.5 pt-2.5">
          <div className="flex gap-1.5">
            <a
              href="https://qm.qq.com/q/iy0gyxKnrq"
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 rounded-lg bg-surface py-1.5 text-center text-[12px] font-medium text-ink"
            >
              QQ 客服
            </a>
            <a
              href="https://qm.qq.com/q/ZwGz3jrQis"
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 rounded-lg bg-surface py-1.5 text-center text-[12px] font-medium text-ink"
            >
              维护群
            </a>
            <a
              href="https://pd.qq.com/s/6d36qjaxs?b=9"
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 rounded-lg bg-surface py-1.5 text-center text-[12px] font-medium text-ink"
            >
              QQ 频道
            </a>
          </div>
          <form onSubmit={onSubmitFeedback} className="mt-2 space-y-1.5">
            <textarea
              value={fbContent}
              onChange={(e) => setFbContent(e.target.value)}
              rows={2}
              maxLength={2000}
              required
              placeholder="留言反馈…"
              className="w-full resize-none rounded-xl border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none focus:border-brand"
            />
            <div className="flex gap-1.5">
              <input
                type="text"
                value={fbContact}
                onChange={(e) => setFbContact(e.target.value)}
                maxLength={120}
                placeholder="选填 QQ/微信"
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none focus:border-brand"
              />
              <button
                type="submit"
                disabled={fbBusy || !fbContent.trim()}
                className="shrink-0 rounded-xl bg-ink px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {fbBusy ? '…' : '提交'}
              </button>
            </div>
            {fbErr && <p className="text-xs text-expired">{fbErr}</p>}
            {fbMsg && <p className="text-xs text-brand-dark">{fbMsg}</p>}
          </form>
        </div>
      </details>

      {/* 关于：一行底栏 */}
      <footer className="mt-4 space-y-1 px-0.5 text-center text-[11px] leading-relaxed text-muted">
        <p>
          川轻化课表助手 · v{APP_VERSION}
        </p>
        <p>
          <a
            className="text-brand"
            href="https://susuc-kcb.shipstatic.com"
          >
            固定地址
          </a>
          <span className="mx-1.5 text-line">·</span>
          <a
            className="text-brand"
            href="https://jwgl.suse.edu.cn"
            target="_blank"
            rel="noreferrer"
          >
            正方教务
          </a>
        </p>
      </footer>
    </div>
  )
}
