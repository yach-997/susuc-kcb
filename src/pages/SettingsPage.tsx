import { useState } from 'react'
import { TermMetaForm } from '../components/TermMetaForm'
import { hardRefreshApp } from '../lib/hardRefresh'
import { buildMockPayload } from '../lib/mockData'
import {
  DEFAULT_CHANNEL_URL,
  clearTimetable,
  getChannelUrl,
  normalizeTermLabel,
  saveTimetable,
  setChannelUrl,
} from '../lib/storage'
import type { TimetablePayload } from '../types'

interface Props {
  data: TimetablePayload | null
  onImport: (payload: TimetablePayload) => void
  onClear: () => void
}

export function SettingsPage({ data, onImport, onClear }: Props) {
  const [channel, setChannel] = useState(getChannelUrl)
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

  const handleHardRefresh = (alsoClearTimetable: boolean) => {
    const tip = alsoClearTimetable
      ? '将清除课表、缓存并重新加载，确定吗？'
      : '将清理应用缓存并重新加载（课表数据保留），确定吗？'
    if (!confirm(tip)) return
    setRefreshing(true)
    setMsg('正在清理缓存…')
    void hardRefreshApp({ clearTimetable: alsoClearTimetable }).catch(() => {
      setRefreshing(false)
      setMsg('自动清理失败，请按下方说明手动清除网站数据')
    })
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5 animate-fade-in">
      <h1 className="font-display text-2xl font-bold text-ink">设置</h1>
      <p className="mt-1 text-sm text-muted">数据仅保存在本机，不会上传。</p>

      {msg && (
        <div className="mt-3 rounded-xl border border-brand/30 bg-brand-soft px-3 py-2 text-sm text-brand-dark">
          {msg}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <h2 className="font-semibold text-ink">更新 / 修复识别</h2>
        <p className="mt-1 text-sm text-muted leading-relaxed">
          手机请用这个地址打开（不要用 jsDelivr，会显示源码）：
        </p>
        <a
          className="mt-2 block break-all rounded-xl bg-white px-3 py-2 text-sm font-medium text-brand underline border border-brand/20"
          href="https://raw.githack.com/yach-997/susuc-kcb/cdn/index.html"
        >
          https://raw.githack.com/yach-997/susuc-kcb/cdn/index.html
        </a>
        <p className="mt-2 text-[0.75rem] text-muted leading-relaxed">
          备用：
          <a
            className="text-brand underline break-all"
            href="https://yach-997.github.io/susuc-kcb/"
          >
            https://yach-997.github.io/susuc-kcb/
          </a>
        </p>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => handleHardRefresh(false)}
          className="mt-3 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {refreshing ? '正在清理…' : '清理缓存并刷新'}
        </button>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => handleHardRefresh(true)}
          className="mt-2 w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink disabled:opacity-60"
        >
          清理缓存 + 清除课表并刷新
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
        <h2 className="font-semibold text-ink">调课通知频道</h2>
        <p className="mt-1 text-sm text-muted">
          底部引流按钮将打开此链接（可改成 QQ/微信/Telegram 等）。
        </p>
        <input
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="mt-3 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
          placeholder={DEFAULT_CHANNEL_URL}
        />
        <button
          type="button"
          onClick={() => {
            setChannelUrl(channel.trim() || DEFAULT_CHANNEL_URL)
            flash('频道链接已保存')
          }}
          className="mt-2 w-full rounded-xl bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand-dark"
        >
          保存链接
        </button>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-white/90 p-4 shadow-sm text-sm text-muted leading-relaxed">
        <h2 className="font-semibold text-ink">关于</h2>
        <p className="mt-2">四川轻化工大学课表助手 · 纯前端 PWA</p>
        <p className="mt-1">正方教务：61.139.105.138</p>
        <p className="mt-1">版本 1.1.7</p>
        <p className="mt-2 break-all text-xs text-muted">
          打开：https://raw.githack.com/yach-997/susuc-kcb/cdn/index.html
        </p>
      </section>
    </div>
  )
}
