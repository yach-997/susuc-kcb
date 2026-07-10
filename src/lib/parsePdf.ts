import type { Course, TimetablePayload, WeekParity } from '../types'
import { parseWeekParity, uid } from './storage'

export interface PdfTextItem {
  str: string
  x: number
  y: number
  page: number
}

const WEEKDAY_RE = /^星期([一二三四五六日天])$/
const SECTION_RE = /^(\d{1,2})\s*[-~～]\s*(\d{1,2})$/
const DETAIL_START_RE = /周数\s*[:：]/
const NAME_MARK_RE = /[★☆]/

const WEEKDAY_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
}

function nearest<T extends { x: number }>(
  items: T[],
  x: number,
  maxDist = 40,
): T | null {
  let best: T | null = null
  let bestDist = Infinity
  for (const it of items) {
    const d = Math.abs(it.x - x)
    // 距离相同则优先选 x >= 查询点的项（正方 PDF 里节次常在课名右侧一点）
    if (d < bestDist - 0.05 || (Math.abs(d - bestDist) <= 0.05 && best && it.x >= x && best.x < x)) {
      bestDist = d
      best = it
    } else if (d < bestDist) {
      bestDist = d
      best = it
    }
  }
  return bestDist <= maxDist ? best : null
}

function weekdayForX(
  x: number,
  headers: { x: number; weekday: number }[],
): number | null {
  if (!headers.length) return null
  const sorted = [...headers].sort((a, b) => a.x - b.x)
  // 用相邻表头中点分界
  for (let i = 0; i < sorted.length; i++) {
    const left = i === 0 ? -Infinity : (sorted[i - 1].x + sorted[i].x) / 2
    const right =
      i === sorted.length - 1 ? Infinity : (sorted[i].x + sorted[i + 1].x) / 2
    if (x >= left && x < right) return sorted[i].weekday
  }
  return sorted[sorted.length - 1].weekday
}

function parseWeeksField(raw: string): { weeks: string; parity: WeekParity } {
  const m = raw.match(
    /(\d+\s*[-~～至]\s*\d+\s*周?(?:\([^)]*\))?|\d+\s*周?(?:\([^)]*\))?)/,
  )
  let weeks = (m?.[1] || raw || '1-16').replace(/\s/g, '')
  weeks = weeks.replace(/周$/, '')
  // 6-8周(双) → 6-8双
  weeks = weeks.replace(/周?\(双\)/, '双').replace(/周?\(单\)/, '单')
  return { weeks, parity: parseWeekParity(weeks) }
}

function parseDetail(detail: string): {
  weeks: string
  parity: WeekParity
  room: string
  teacher: string
} {
  const weeksMatch = detail.match(/周数\s*[:：]\s*([^/]+)/)
  const roomMatch = detail.match(/地点\s*[:：]\s*([^/]+)/)
  const teacherMatch = detail.match(/教师\s*[:：]\s*([^/]+)/)
  const { weeks, parity } = parseWeeksField(weeksMatch?.[1]?.trim() || '1-16')
  return {
    weeks,
    parity,
    room: (roomMatch?.[1] || '未知教室').trim(),
    teacher: (teacherMatch?.[1] || '未知教师').trim(),
  }
}

function cleanCourseName(raw: string): string {
  return raw
    .replace(/[★☆■]/g, '')
    .replace(/\(理论\)$/, '')
    .replace(/\(实验\)$/, '')
    .trim()
}

/** 合并同一课程格子被拆开的「周数」详情行 */
function mergeDetailBlocks(
  items: PdfTextItem[],
): { x: number; text: string; page: number }[] {
  const detailY = items
    .filter((it) => DETAIL_START_RE.test(it.str))
    .map((it) => it.y)
  if (!detailY.length) return []

  // 详情大致在同一水平带
  const y0 = detailY[0]
  const band = items
    .filter((it) => it.page === items.find((x) => DETAIL_START_RE.test(x.str))!.page)
    .filter((it) => Math.abs(it.y - y0) < 2)
    .sort((a, b) => a.x - b.x)

  // 跨页分别处理
  const byPage = new Map<number, PdfTextItem[]>()
  for (const it of items) {
    if (!byPage.has(it.page)) byPage.set(it.page, [])
  }
  for (const [page] of byPage) {
    const pageItems = items.filter((it) => it.page === page)
    const starts = pageItems.filter((it) => DETAIL_START_RE.test(it.str))
    if (!starts.length) continue
    const yRef = starts[0].y
    const row = pageItems
      .filter((it) => Math.abs(it.y - yRef) < 3)
      .sort((a, b) => a.x - b.x)
    byPage.set(page, row)
  }

  const blocks: { x: number; text: string; page: number }[] = []
  for (const [page, row] of byPage) {
    if (!row.length) continue
    let current: { x: number; text: string; page: number } | null = null
    for (const it of row) {
      if (DETAIL_START_RE.test(it.str)) {
        if (current) blocks.push(current)
        current = { x: it.x, text: it.str, page }
      } else if (current) {
        current.text += it.str
      }
    }
    if (current) blocks.push(current)
  }

  // 也处理：详情 y 不完全相同的情况（用 starts 各自向右吸收碎片）
  if (!blocks.length) {
    const starts = items
      .filter((it) => DETAIL_START_RE.test(it.str))
      .sort((a, b) => a.page - b.page || a.x - b.x)
    for (const s of starts) {
      const extras = items
        .filter(
          (it) =>
            it.page === s.page &&
            it.x > s.x &&
            it.x < s.x + 20 &&
            Math.abs(it.y - s.y) < 3 &&
            !DETAIL_START_RE.test(it.str) &&
            !NAME_MARK_RE.test(it.str) &&
            !SECTION_RE.test(it.str) &&
            !WEEKDAY_RE.test(it.str),
        )
        .sort((a, b) => a.x - b.x)
      blocks.push({
        x: s.x,
        text: s.str + extras.map((e) => e.str).join(''),
        page: s.page,
      })
    }
  }

  void band
  return blocks
}

function parseOtherCourses(text: string): Course[] {
  const courses: Course[] = []
  // [重修]大学物理B2★彭映铨(共8周)/1-8周/无/组班上课：第6-13周 星期三 第7-10节；LA4-206；...
  const re =
    /\[([^\]]*)\]?([^★☆\n/]+?)[★☆]([^/(]*)\(共\d+周\)\/([^/]+)\/[^/]*\/组班上课：第([\d\-]+)周\s*星期([一二三四五六日天])\s*第([\d\-]+)节[；;]?\s*([^；;]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const tag = m[1] ? `[${m[1]}]` : ''
    const name = cleanCourseName(`${tag}${m[2]}`)
    const teacher = m[3].trim() || '未知教师'
    const weeksInfo = parseWeeksField(m[5].includes('-') ? m[5] : m[4])
    const weekday = WEEKDAY_MAP[m[6]] || 1
    const secParts = m[7].split(/[-~～]/).map(Number)
    const room = (m[8] || '未知教室').trim() || '未知教室'
    courses.push({
      id: uid(),
      name,
      teacher,
      room,
      weekday,
      startSection: secParts[0] || 1,
      endSection: secParts[1] || secParts[0] || 1,
      weeks: weeksInfo.weeks,
      weekParity: weeksInfo.parity,
    })
  }
  return courses
}

/**
 * 把正方教务导出的课表 PDF 文本项解析成课程列表。
 * 依赖坐标：同一门课的「课名 / 节次 / 周数详情」x 接近，星期几由表头列决定。
 */
export function parseZfPdfItems(items: PdfTextItem[]): TimetablePayload {
  if (!items.length) throw new Error('PDF 里没有可读文字')

  const student =
    items.find((it) => /课表$/.test(it.str))?.str.replace(/课表$/, '') || ''
  const term =
    items.find((it) => /\d{4}-\d{4}学年/.test(it.str))?.str ||
    items.find((it) => /学年第/.test(it.str))?.str ||
    ''

  const courses: Course[] = []
  const pages = [...new Set(items.map((it) => it.page))].sort((a, b) => a - b)

  for (const page of pages) {
    const pageItems = items.filter((it) => it.page === page)

    const headers = pageItems
      .map((it) => {
        const m = it.str.match(WEEKDAY_RE)
        if (!m) return null
        return { x: it.x, weekday: WEEKDAY_MAP[m[1]] }
      })
      .filter((x): x is { x: number; weekday: number } => !!x)

    const names = pageItems
      .filter((it) => NAME_MARK_RE.test(it.str) && !it.str.includes('理论学时'))
      .filter((it) => !it.str.includes('课程设计') && it.str.length < 40)
      .map((it) => ({ x: it.x, y: it.y, str: it.str }))

    const sections = pageItems
      .map((it) => {
        const m = it.str.trim().match(SECTION_RE)
        if (!m) return null
        return {
          x: it.x,
          start: Number(m[1]),
          end: Number(m[2]),
        }
      })
      .filter((x): x is { x: number; start: number; end: number } => !!x)

    const details = mergeDetailBlocks(pageItems)

    // 节次坐标更居中：先给节次定星期，课名跟最近节次/详情归列，再列内按下标配对
    const secWithDay = sections
      .map((s) => ({ ...s, weekday: weekdayForX(s.x, headers) }))
      .filter((s) => s.weekday != null) as {
      x: number
      start: number
      end: number
      weekday: number
    }[]

    const dayHint = (x: number): number | null => {
      const nearSec = nearest(secWithDay, x, 50)
      if (nearSec) return nearSec.weekday
      return weekdayForX(x, headers)
    }

    const detailWithDay = details
      .map((d) => ({ ...d, weekday: dayHint(d.x) }))
      .filter((d) => d.weekday != null) as {
      x: number
      text: string
      page: number
      weekday: number
    }[]

    const nameWithDay = names
      .map((n) => ({ ...n, weekday: dayHint(n.x) }))
      .filter((n) => n.weekday != null) as {
      x: number
      y: number
      str: string
      weekday: number
    }[]

    const weekdayIds = [
      ...new Set(
        [...secWithDay, ...detailWithDay, ...nameWithDay].map((x) => x.weekday),
      ),
    ].sort((a, b) => a - b)

    for (const wd of weekdayIds) {
      const colNames = nameWithDay
        .filter((n) => n.weekday === wd)
        .sort((a, b) => a.x - b.x)
      const colSecs = secWithDay
        .filter((s) => s.weekday === wd)
        .sort((a, b) => a.x - b.x)
      const colDetails = detailWithDay
        .filter((d) => d.weekday === wd)
        .sort((a, b) => a.x - b.x)

      for (let i = 0; i < colNames.length; i++) {
        const nameItem = colNames[i]
        // 课名与详情数量通常一致，优先按下标；节次可能更少，用最近邻
        const detail =
          (i < colDetails.length ? colDetails[i] : null) ||
          nearest(colDetails, nameItem.x, 60)
        const indexedSec =
          i < colSecs.length && Math.abs(colSecs[i].x - nameItem.x) <= 45
            ? colSecs[i]
            : null
        const sec =
          indexedSec ||
          nearest(colSecs, nameItem.x, 55) ||
          nearest(secWithDay, nameItem.x, 50)
        if (!sec) continue

        const parsed = detail
          ? parseDetail(detail.text)
          : {
              weeks: '1-16',
              parity: 'all' as WeekParity,
              room: '未知教室',
              teacher: '未知教师',
            }

        courses.push({
          id: uid(),
          name: cleanCourseName(nameItem.str),
          teacher: parsed.teacher,
          room: parsed.room,
          weekday: wd,
          startSection: sec.start,
          endSection: sec.end,
          weeks: parsed.weeks,
          weekParity: parsed.parity,
        })
      }
    }

    // 页脚「其他课程」
    for (const it of pageItems) {
      if (it.str.includes('其他课程') || it.str.includes('组班上课')) {
        courses.push(...parseOtherCourses(it.str))
      }
    }
  }

  // 去重
  const seen = new Set<string>()
  const unique = courses.filter((c) => {
    const key = `${c.name}|${c.weekday}|${c.startSection}|${c.endSection}|${c.weeks}|${c.room}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (!unique.length) {
    throw new Error('没有识别出课程，请确认上传的是正方教务导出的课表 PDF')
  }

  return {
    version: 1,
    school: '四川轻化工大学',
    updatedAt: new Date().toISOString(),
    courses: unique,
    termStart: undefined,
    // 附加信息写进 school 方便展示
    ...(student || term
      ? { school: `四川轻化工大学${student ? ` · ${student}` : ''}${term ? ` · ${term}` : ''}` }
      : {}),
  }
}

/** 在浏览器中用 pdfjs 提取文本项 */
export async function extractPdfTextItems(
  data: ArrayBuffer,
): Promise<PdfTextItem[]> {
  const pdfjs = await import('pdfjs-dist')
  const base = import.meta.env.BASE_URL || '/'
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdfjs/pdf.worker.min.mjs`

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
  })
  const doc = await loadingTask.promise
  const items: PdfTextItem[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    for (const raw of content.items) {
      if (!('str' in raw) || !raw.str?.trim()) continue
      const t = raw as { str: string; transform: number[] }
      items.push({
        str: t.str,
        x: +t.transform[4].toFixed(1),
        y: +t.transform[5].toFixed(1),
        page: i,
      })
    }
  }
  return items
}

export async function parseZfPdfFile(file: File): Promise<TimetablePayload> {
  const buf = await file.arrayBuffer()
  const items = await extractPdfTextItems(buf)
  return parseZfPdfItems(items)
}
