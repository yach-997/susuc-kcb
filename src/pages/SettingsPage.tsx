import { useState } from 'react'
import { TermMetaForm } from '../components/TermMetaForm'
import { hardRefreshApp } from '../lib/hardRefresh'
import { buildMockPayload } from '../lib/mockData'
import {
  clearTimetable,
  normalizeTermLabel,
  saveTimetable,
} from '../lib/storage'
import type { TimetablePayload } from '../types'

interface Props {
  data: TimetablePayload | null
  onImport: (payload: TimetablePayload) => void
  onClear: () => void
}

export function SettingsPage({ data, onImport, onClear }: Props) {
  const [msg, setMsg] = useState<string | null>(null)
  const [editingTerm, setEditingTerm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const flash = (text: string) => {
    setMsg(text)
    window.setTimeout(() => setMsg(null), 2000)
  }

  const loadDemo = () => {
    onImport(buildMockPayload(0))
    flash('已载入演示课表')
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

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5 animate-fade-in">
      <h1 className="font-display text-2xl font-bold text-ink">设置</h1>

      {msg && (
        <div className="mt-3 rounded-xl border border-brand/30 bg-brand-soft px-3 py-2 text-sm text-brand-dark">
          {msg}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <h2 className="font-semibold text-ink">更新 / 修复识别</h2>
        <p className="mt-1 text-sm text-muted leading-relaxed">
          同学请收藏这一个固定地址（更新后刷新即可，不用换链接）：
        </p>
        <a
          className="mt-2 block break-all rounded-xl bg-white px-3 py-2 text-sm font-medium text-brand underline border border-brand/20"
          href="https://susuc-kcb.shipstatic.com"
        >
          https://susuc-kcb.shipstatic.com
        </a>
        <p className="mt-2 text-[0.75rem] text-muted leading-relaxed">
          若页面还是旧版，点下方清理缓存。
        </p>
        <button
          type="button"
          disabled={refreshing}
          onClick={handleHardRefresh}
          className="mt-3 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {refreshing ? '正在清理…' : '清理缓存并刷新'}
        </button>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-white/90 p-4 shadow-sm">
        <h2 className="font-semibold text-ink">学期信息</h2>
        {data && data.courses.length > 0 ? (
          <>
            <p className="mt-1 text-sm text-muted">
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
                className="mt-3 w-full rounded-xl bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand-dark"
              >
                修改学期 / 第一周日期
              </button>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">导入课表后可在此修改学期与开学周。</p>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-white/90 p-4 shadow-sm">
        <h2 className="font-semibold text-ink">课表数据</h2>
        <p className="mt-1 text-sm text-muted">
          {data
            ? `${data.courses.length} 门课 · 更新于 ${new Date(data.updatedAt).toLocaleString('zh-CN')}`
            : '暂无数据'}
        </p>
        <div className="mt-3 grid gap-2">
          <button
            type="button"
            onClick={loadDemo}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"
          >
            载入演示课表
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('确定清除本地课表？')) {
                clearTimetable()
                onClear()
                flash('已清除')
              }
            }}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-expired"
          >
            清除本地课表
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-white/90 p-4 shadow-sm">
        <h2 className="font-semibold text-ink">联系我们</h2>
        <p className="mt-1 text-sm text-muted">使用有问题可联系客服或加入维护群。</p>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <a
            href="https://qm.qq.com/q/iy0gyxKnrq"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-brand active:opacity-70"
          >
            <span className="text-[0.7rem] opacity-70">QQ</span>
            客服
          </a>
          <span className="h-3 w-px bg-line" aria-hidden />
          <a
            href="https://qm.qq.com/q/ZwGz3jrQis"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-brand active:opacity-70"
          >
            <span className="text-[0.7rem] opacity-70">QQ</span>
            维护群
          </a>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-white/90 p-4 shadow-sm text-sm text-muted leading-relaxed">
        <h2 className="font-semibold text-ink">关于</h2>
        <p className="mt-2">四川轻化工大学课表助手</p>
        <p className="mt-1">
          正方教务：{' '}
          <a
            className="break-all text-brand underline"
            href="https://jwgl.suse.edu.cn"
            target="_blank"
            rel="noreferrer"
          >
            https://jwgl.suse.edu.cn
          </a>
        </p>
        <p className="mt-1">版本 1.3.7</p>
        <p className="mt-2 break-all text-xs text-muted">
          https://susuc-kcb.shipstatic.com
        </p>
      </section>
    </div>
  )
}
