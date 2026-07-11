import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AddToHomeButton } from '../components/AddToHomeButton'
import { TermMetaForm } from '../components/TermMetaForm'
import { APP_VERSION } from '../appVersion'
import { clearImportDraft } from '../lib/importDraft'
import { hardRefreshApp } from '../lib/hardRefresh'
import {
  clearTimetable,
  normalizeTermLabel,
  saveTimetable,
  summarizeCourses,
} from '../lib/storage'
import type { TimetablePayload } from '../types'

interface Props {
  data: TimetablePayload | null
  onImport: (payload: TimetablePayload) => void
  onClear: () => void
}

function formatUpdatedAt(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
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

  const flash = (text: string) => {
    setMsg(text)
    window.setTimeout(() => setMsg(null), 2000)
  }

  const handleHardRefresh = () => {
    if (!confirm('将清理应用缓存并重新加载（课表数据保留），确定吗？')) return
    setRefreshing(true)
    setMsg('正在清理缓存…')
    void hardRefreshApp({ clearTimetable: false }).catch(() => {
      setRefreshing(false)
      setMsg('自动清理失败，请手动清除网站数据后再打开')
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

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5 animate-fade-in">
      <h1 className="font-display text-2xl font-bold text-ink">设置</h1>

      {msg && (
        <div className="mt-3 rounded-xl border border-brand/20 bg-brand-soft px-3 py-2 text-sm text-brand-dark">
          {msg}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-line bg-white p-4">
        <h2 className="text-[0.95rem] font-semibold text-ink">当前课表</h2>

        {summary && data ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-surface px-3 py-3 text-center">
                <div className="text-xl font-bold tabular-nums text-ink">
                  {summary.unique}
                </div>
                <div className="mt-0.5 text-[0.7rem] text-muted">门课</div>
              </div>
              <div className="rounded-xl bg-surface px-3 py-3 text-center">
                <div className="text-xl font-bold tabular-nums text-ink">
                  {summary.slots}
                </div>
                <div className="mt-0.5 text-[0.7rem] text-muted">条课次</div>
              </div>
            </div>
            <p className="mt-2.5 text-center text-[0.75rem] text-muted">
              更新于 {formatUpdatedAt(data.updatedAt)}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">还没有导入课表</p>
        )}

        <button
          type="button"
          onClick={() => navigate('/guide')}
          className="mt-3 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white"
        >
          {summary ? '重新导入课表' : '去导入课表'}
        </button>
        {summary && (
          <button
            type="button"
            onClick={handleClearTimetable}
            className="mt-2 w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-expired"
          >
            清除本地课表
          </button>
        )}
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-white p-4">
        <h2 className="text-[0.95rem] font-semibold text-ink">学期信息</h2>
        {data && data.courses.length > 0 ? (
          <>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted">学期</dt>
                <dd className="text-right font-medium text-ink">
                  {data.termLabel || '未填写'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted">第 1 周星期一</dt>
                <dd className="text-right font-medium text-ink">
                  {data.termStart || '未填写'}
                </dd>
              </div>
            </dl>
            {editingTerm ? (
              <div className="mt-3">
                <TermMetaForm
                  initialLabel={data.termLabel}
                  initialStart={data.termStart}
                  submitText="保存学期信息"
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
              <button
                type="button"
                onClick={() => setEditingTerm(true)}
                className="mt-3 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink"
              >
                修改学期 / 第一周日期
              </button>
            )}
          </>
        ) : (
          <p className="mt-1.5 text-sm text-muted">导入课表后可在此修改学期与开学周。</p>
        )}
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-white p-4">
        <h2 className="text-[0.95rem] font-semibold text-ink">添加到桌面</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          放到手机桌面后，打开更快，也更像一个 App。需联网使用。
        </p>
        <AddToHomeButton />
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-white p-4">
        <h2 className="text-[0.95rem] font-semibold text-ink">更新 / 清理</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          固定地址（更新后刷新即可，不用换链接）：
        </p>
        <a
          className="mt-2.5 block break-all rounded-lg bg-surface px-3 py-2.5 text-sm font-medium text-brand"
          href="https://susuc-kcb.shipstatic.com"
        >
          https://susuc-kcb.shipstatic.com
        </a>
        <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">
          若页面还是旧版，点下方清理缓存。
        </p>
        <button
          type="button"
          disabled={refreshing}
          onClick={handleHardRefresh}
          className="mt-3.5 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-60"
        >
          {refreshing ? '正在清理…' : '清理缓存并刷新'}
        </button>
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-white p-4">
        <h2 className="text-[0.95rem] font-semibold text-ink">联系我们</h2>
        <p className="mt-1.5 text-sm text-muted">使用有问题可联系客服或加入维护群。</p>
        <div className="mt-3 flex gap-2">
          <a
            href="https://qm.qq.com/q/iy0gyxKnrq"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-center text-sm font-medium text-ink active:opacity-70"
          >
            QQ 客服
          </a>
          <a
            href="https://qm.qq.com/q/ZwGz3jrQis"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-center text-sm font-medium text-ink active:opacity-70"
          >
            QQ 维护群
          </a>
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-white p-4 text-sm leading-relaxed text-muted">
        <h2 className="text-[0.95rem] font-semibold text-ink">关于</h2>
        <p className="mt-2 text-ink">川轻化课表助手</p>
        <p className="mt-1 text-xs text-muted">四川轻化工大学课表助手</p>
        <p className="mt-2">
          正方教务：{' '}
          <a
            className="break-all text-brand underline decoration-brand/30 underline-offset-2"
            href="https://jwgl.suse.edu.cn"
            target="_blank"
            rel="noreferrer"
          >
            https://jwgl.suse.edu.cn
          </a>
        </p>
        <p className="mt-1">版本 {APP_VERSION}</p>
      </section>
    </div>
  )
}
