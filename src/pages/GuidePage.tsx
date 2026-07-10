import { useMemo, useState } from 'react'
import {
  BOOKMARKLET_TARGET_PLACEHOLDER,
  buildBookmarkletSource,
  minifyBookmarklet,
} from '../lib/bookmarklet'

export function GuidePage() {
  const [copied, setCopied] = useState(false)
  const [target, setTarget] = useState(() => {
    // 默认指向当前部署地址
    const { origin, pathname } = window.location
    const base = pathname.replace(/\/index\.html$/, '').replace(/\/$/, '') || ''
    return `${origin}${base}/`
  })

  const href = useMemo(() => {
    const src = buildBookmarkletSource(target || BOOKMARKLET_TARGET_PLACEHOLDER)
    return minifyBookmarklet(src)
  }, [target])

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = href
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5 animate-fade-in">
      <h1 className="font-display text-2xl font-bold text-ink">导入课表</h1>
      <p className="mt-1 text-sm text-muted">用书签从正方教务一键带走课表，数据只存本机。</p>

      <ol className="mt-6 space-y-4">
        <li className="rounded-2xl border border-line bg-white/90 p-4 shadow-sm">
          <div className="text-xs font-semibold text-brand">步骤 1</div>
          <h2 className="mt-1 font-semibold text-ink">确认 PWA 地址</h2>
          <p className="mt-1 text-sm text-muted">部署到 GitHub Pages 后，把下面地址改成你的站点。</p>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-3 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
            placeholder={BOOKMARKLET_TARGET_PLACEHOLDER}
          />
        </li>

        <li className="rounded-2xl border border-line bg-white/90 p-4 shadow-sm">
          <div className="text-xs font-semibold text-brand">步骤 2</div>
          <h2 className="mt-1 font-semibold text-ink">保存书签</h2>
          <p className="mt-1 text-sm text-muted">
            手机：复制下方代码 → 新建书签 → 把网址整段替换成代码。
            <br />
            电脑：把绿色按钮拖到书签栏。
          </p>
          <a
            href={href}
            onClick={(e) => e.preventDefault()}
            draggable
            className="mt-3 flex items-center justify-center rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand/20"
            title="拖到书签栏"
          >
            川轻化·导入课表
          </a>
          <button
            type="button"
            onClick={copyCode}
            className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink"
          >
            {copied ? '已复制' : '复制 Bookmarklet 代码'}
          </button>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted">查看代码预览</summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-ink p-3 text-[0.65rem] leading-relaxed text-green-200 break-all whitespace-pre-wrap">
              {href.slice(0, 500)}…
            </pre>
          </details>
        </li>

        <li className="rounded-2xl border border-line bg-white/90 p-4 shadow-sm">
          <div className="text-xs font-semibold text-brand">步骤 3</div>
          <h2 className="mt-1 font-semibold text-ink">在正方课表页点击书签</h2>
          <p className="mt-1 text-sm text-muted leading-relaxed">
            打开教务系统课表页（
            <span className="font-mono text-[0.7rem]">61.139.105.138</span>
            ），点书签。当前为<strong>模拟数据</strong>模式，会跳回本站并写入示例课表；换成真实解析后，才会导入你的课。
          </p>
        </li>
      </ol>

      <section className="mt-5 rounded-2xl border border-line bg-white/90 p-4 shadow-sm">
        <div className="text-xs font-semibold text-brand">给开发者 / 升级真实解析</div>
        <h2 className="mt-1 font-semibold text-ink">如何截取真实课表页</h2>
        <p className="mt-1 text-sm text-muted leading-relaxed">
          当前书签还是模拟数据。把真实课表发给开发者后，才能改成真正从正方页面提取课程。
        </p>

        <h3 className="mt-4 text-sm font-semibold text-ink">1. 打开课表</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted leading-relaxed">
          <li>
            浏览器打开教务：
            <span className="font-mono text-[0.7rem]">61.139.105.138</span>
          </li>
          <li>登录后进入「个人课表」或「学期理论课表」</li>
          <li>确保能看到周一到周日、按节次排列的大表格</li>
        </ol>

        <h3 className="mt-4 text-sm font-semibold text-ink">2. 截图（二选一）</h3>
        <div className="mt-2 space-y-3 text-sm text-muted leading-relaxed">
          <div className="rounded-xl bg-surface px-3 py-2.5">
            <p className="font-medium text-ink">方法 A：整页截图（推荐，Chrome / Edge）</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>按 F12 打开开发者工具</li>
              <li>按 Ctrl + Shift + P，输入 screenshot</li>
              <li>选 Capture full size screenshot（截取全尺寸屏幕截图）</li>
              <li>把下载的长图发给开发者</li>
            </ol>
          </div>
          <div className="rounded-xl bg-surface px-3 py-2.5">
            <p className="font-medium text-ink">方法 B：普通截图</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>按 Win + Shift + S</li>
              <li>框选整张课表表格</li>
              <li>粘贴到微信 / QQ 发给开发者，或先保存成图片</li>
            </ol>
          </div>
        </div>

        <h3 className="mt-4 text-sm font-semibold text-ink">3. 复制 HTML（更准，可选但强烈建议）</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted leading-relaxed">
          <li>在课表表格上右键 → 检查</li>
          <li>左侧高亮到 &lt;table&gt; 或带 kbgrid 的区域</li>
          <li>右键 → Copy → Copy element（复制元素）</li>
          <li>粘贴到记事本，保存为「课表.html」发给开发者</li>
        </ol>

        <p className="mt-3 text-sm text-muted leading-relaxed">
          至少发 2～3 张清晰截图也可以先改一版；有 HTML 解析会更准。请注明是本学期个人课表，尽量让单双周、连堂课也出现在画面里。
        </p>
      </section>

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        提示：部分手机浏览器会拦截过长的 javascript: 书签。若无法保存，请用电脑 Chrome
        生成书签后同步，或使用「设置 → 载入演示数据」先体验界面。
      </div>
    </div>
  )
}
