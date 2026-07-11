import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AddToHomeButton } from '../components/AddToHomeButton'
import { TermMetaForm } from '../components/TermMetaForm'
import { hardRefreshApp } from '../lib/hardRefresh'
import { buildMockPayload } from '../lib/mockData'
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

export function SettingsPage({ data, onImport, onClear }: Props) {
  const navigate = useNavigate()
  const [msg, setMsg] = useState<string | null>(null)
  const [editingTerm, setEditingTerm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const flash = (text: string) => {
    setMsg(text)
    window.setTimeout(() => setMsg(null), 2000)
  }

  const loadDemo = () => {
    if (
      data?.courses?.length &&
      !confirm('将用演示课表覆盖当前课表，确定吗？')
    ) {
      return
    }
    onImport(buildMockPayload(0))
    flash('已载入演示课表')
    window.setTimeout(() => navigate('/'), 500)
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
    clearTimetable()
    onClear()
    flash('已清除')
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5 animate-fade-in">
      <h1 className="font-display text-2xl font-bold text-ink">设置</h1>

      {msg && (
        <div className="mt-3 rounded-xl border border-brand/20 bg-brand-soft px-3 py-2 text-sm text-brand-dark">
          {msg}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-line bg-white p-4">
        <h2 className="text-[0.95rem] font-semibold text-ink">更新 / 清理</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          同学请收藏这一个固定地址（更新后刷新即可，不用换链接）：
        </p>
        <a
          className="mt-2.5 block break-all rounded-lg bg-surface px-3 py-2.5 text-sm font-medium text-brand"
          href="https://susuc-kcb.shipstatic.com"
        >
          https://susuc-kcb.shipstatic.com
        </a>
        <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">
          若页面还是旧版，先清理缓存；不要的课表可在下方清除。
        </p>
        <button
          type="button"
          disabled={refreshing}
          onClick={handleHardRefresh}
          className="mt-3.5 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {refreshing ? '正在清理…' : '清理缓存并刷新'}
        </button>
        <button
          type="button"
          onClick={handleClearTimetable}
          className="mt-2 w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-expired"
        >
          清除本地课表
        </button>
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-white p-4">
        <h2 className="text-[0.95rem] font-semibold text-ink">学期信息</h2>
        {data && data.courses.length > 0 ? (
          <>
            <p className="mt-1.5 text-sm text-muted">
              {data.termLabel || '未填写学期'}
              {data.termStart ? ` · 第一周 ${data.termStart}` : ' · 未填第一周日期'}
            </p>
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
        <h2 className="text-[0.95rem] font-semibold text-ink">课表数据</h2>
        <p className="mt-1.5 text-sm text-muted">
          {data
            ? `${summarizeCourses(data.courses).label} · 更新于 ${new Date(data.updatedAt).toLocaleString('zh-CN')}`
            : '暂无数据'}
        </p>
        <button
          type="button"
          onClick={loadDemo}
          className="mt-3 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink"
        >
          先看演示课表
        </button>
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-white p-4">
        <h2 className="text-[0.95rem] font-semibold text-ink">添加到桌面</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          放到手机桌面后，打开更快，也更像一个 App。
        </p>
        <AddToHomeButton />
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
        <p className="mt-2 text-ink">四川轻化工大学课表助手</p>
        <p className="mt-1">
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
        <p className="mt-1">版本 1.3.23</p>
        <p className="mt-2 break-all text-xs text-muted/80">
          https://susuc-kcb.shipstatic.com
        </p>
      </section>
    </div>
  )
}
