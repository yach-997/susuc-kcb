import type { Course, TimetablePayload, WeekParity } from '../types'
import { parseWeekParity, uid } from './storage'
import { installPdfCompat } from './pdfCompat'

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

/** 列表式详情：`(3-4节)1-3周,6-13周/校区:…/场地:…/教师:…` */
function parseListCell(text: string): {
  name: string
  startSection: number
  endSection: number
  weekParts: { weeks: string; parity: WeekParity }[]
  room: string
  teacher: string
} | null {
  const compact = text.replace(/\s+/g, '')
  const m =
    compact.match(/^(.+?[★☆■])\((\d{1,2})[-~～](\d{1,2})节\)(.+)$/) ||
    compact.match(
      /^([\u4e00-\u9fffA-Za-z0-9（）()\-·]{2,40}?)\((\d{1,2})[-~～](\d{1,2})节\)(.+)$/,
    )
  if (!m) return null

  const name = cleanCourseName(
    (() => {
      const raw = m[1]
      const marked = [
        ...raw.matchAll(/([\u4e00-\u9fffA-Za-z0-9（）()\-·]{1,30}[★☆■])/g),
      ].map((x) => x[1])
      if (marked.length) return marked[marked.length - 1]
      return raw
    })(),
  )

  const startSection = Number(m[2])
  const endSection = Number(m[3])
  const rest = m[4]

  const weeksRaw = (rest.split('/')[0] || '1-16').replace(/周/g, '')
  const weekParts = weeksRaw
    .split(/[,，]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => parseWeeksField(p))

  if (!weekParts.length) weekParts.push(parseWeeksField('1-16'))

  const room =
    rest.match(/场地[:：]?([^/]+)/)?.[1]?.trim() ||
    rest.match(/地点[:：]?([^/]+)/)?.[1]?.trim() ||
    '未知教室'
  const teacher =
    rest.match(/教师[:：]?([^/]+)/)?.[1]?.trim() || '未知教师'

  return { name, startSection, endSection, weekParts, room, teacher }
}

/** 列表式：同一天内用课名锚点（★ 或独立课名块）切分单元格 */
function collectListAnchors(dayItems: PdfTextItem[]): PdfTextItem[] {
  const stars = dayItems
    .filter((it) => NAME_MARK_RE.test(it.str))
    .sort((a, b) => a.x - b.x)

  const extras = dayItems.filter((it) => {
    if (NAME_MARK_RE.test(it.str)) return false
    if (/[（(]\d|校区|场地|地点|教师|教学班|学分|考核|选课|学时|组成|备注/.test(it.str))
      return false
    if (!/^[\u4e00-\u9fffA-Za-z0-9（）()\-·]+$/.test(it.str)) return false
    if (it.str.length < 2 || it.str.length > 24) return false
    return stars.every((s) => Math.abs(s.x - it.x) > 55)
  })

  // 额外锚点按 x 聚类，每簇取最靠上（y 最大）的一条
  const extraAnchors: PdfTextItem[] = []
  const sortedExtras = [...extras].sort((a, b) => a.x - b.x)
  let cluster: PdfTextItem[] = []
  for (const it of sortedExtras) {
    if (cluster.length && it.x - cluster[cluster.length - 1].x > 40) {
      extraAnchors.push(cluster.sort((a, b) => b.y - a.y)[0])
      cluster = []
    }
    cluster.push(it)
  }
  if (cluster.length) extraAnchors.push(cluster.sort((a, b) => b.y - a.y)[0])

  return [...stars, ...extraAnchors].sort((a, b) => a.x - b.x)
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
 * 兼容两种导出样式：
 * - 表格式：星期为列，详情以「周数:/地点:」开头（如陈春升样例）
 * - 列表式：星期为行，详情为「(3-4节)周次/场地:」（如毛茂婷样例）
 */
export function parseZfPdfItems(items: PdfTextItem[]): TimetablePayload {
  if (!items.length) throw new Error('PDF 里没有可读文字')

  const student =
    items.find((it) => /课表$/.test(it.str))?.str.replace(/课表$/, '') || ''
  const term =
    items.find((it) => /\d{4}-\d{4}学年/.test(it.str))?.str ||
    items.find((it) => /学年第/.test(it.str))?.str ||
    ''

  const courses = isListStylePdf(items)
    ? parseListStyleCourses(items)
    : parseGridStyleCourses(items)

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
    school: student ? `四川轻化工大学 · ${student}` : '四川轻化工大学',
    updatedAt: new Date().toISOString(),
    courses: unique,
    termLabel: term || undefined,
    termStart: undefined,
  }
}

/** 列表式：单元格内带 (节次)周次/场地 */
function isListStylePdf(items: PdfTextItem[]): boolean {
  const inline = items.filter((it) =>
    /\(\d{1,2}\s*[-~～]\s*\d{1,2}\s*节\)/.test(it.str),
  ).length
  const zhouShu = items.filter((it) => DETAIL_START_RE.test(it.str)).length
  return inline >= 2 && inline >= zhouShu
}

function isNoiseItem(it: PdfTextItem): boolean {
  const s = it.str.trim()
  if (!s) return true
  if (WEEKDAY_RE.test(s)) return true
  if (/^节次$|^时间段$|^上午$|^下午$|^晚上$/.test(s)) return true
  if (/学号|打印时间|课程设计|理论学时|实验学时|实践学时/.test(s) && s.length < 80)
    return true
  if (/课表$/.test(s)) return true
  if (/\d{4}-\d{4}学年/.test(s)) return true
  // 底部节次序号 1..11
  if (/^\d{1,2}$/.test(s) && it.y < 100) return true
  if (s.startsWith(':') && s.includes('★')) return true
  return false
}

/**
 * 列表式课表：星期为行、节次为列；课名与「(1-2节)周次/场地/教师」写在同一格。
 */
function parseListStyleCourses(items: PdfTextItem[]): Course[] {
  const labels = items
    .map((it) => {
      const m = it.str.match(WEEKDAY_RE)
      if (!m) return null
      return { y: it.y, weekday: WEEKDAY_MAP[m[1]], page: it.page }
    })
    .filter((x): x is { y: number; weekday: number; page: number } => !!x)
    .sort((a, b) => b.y - a.y)

  const firstPage = labels.length ? Math.min(...labels.map((x) => x.page)) : 1
  const bandLabels = labels.filter((l) => l.page === firstPage)
  if (!bandLabels.length) return []

  const weekdayForY = (y: number): number | null => {
    let best: number | null = null
    let bestY = Infinity
    for (const lab of bandLabels) {
      if (lab.y + 8 >= y && lab.y < bestY) {
        bestY = lab.y
        best = lab.weekday
      }
    }
    return best
  }

  type DayBucket = { weekday: number; items: PdfTextItem[]; overflows: PdfTextItem[] }
  const days = new Map<number, DayBucket>()
  for (const lab of bandLabels) {
    days.set(lab.weekday, { weekday: lab.weekday, items: [], overflows: [] })
  }

  const sortedItems = [...items].sort(
    (a, b) => a.page - b.page || b.y - a.y || a.x - b.x,
  )

  for (const it of sortedItems) {
    if (isNoiseItem(it)) continue
    const wd = weekdayForY(it.y)
    if (wd == null) continue
    const bucket = days.get(wd)
    if (!bucket) continue
    // 次页内容多为跨页续写，不参与锚点切分
    if (it.page > firstPage) {
      bucket.overflows.push(it)
      continue
    }
    if (it.x < 82) continue
    bucket.items.push(it)
  }

  const courses: Course[] = []

  for (const bucket of days.values()) {
    const dayItems = bucket.items
    if (!dayItems.length && !bucket.overflows.length) continue

    // 以课名锚点切分：课名就近归★，详情归「左侧最近★」（避免长详情挤进隔壁）
    const anchors = collectListAnchors(dayItems)
    const groups: PdfTextItem[][] = []

    if (!anchors.length) {
      groups.push([...dayItems, ...bucket.overflows])
    } else {
      const buckets: PdfTextItem[][] = anchors.map(() => [])
      const isNameish = (s: string) => {
        if (NAME_MARK_RE.test(s)) return true
        if (/[;；]/.test(s) || /^[:：]/.test(s.trim())) return false
        if (
          /\d+\s*[-~～]\s*\d+\s*节|校区|场地|地点|教师|教学班|学分|考核|选课|学时|组成|备注|方式|思政\d/.test(
            s,
          )
        )
          return false
        if (/^\(/.test(s.trim()) || /^\d+[-~～]\d+周/.test(s.trim())) return false
        return /^[\u4e00-\u9fffA-Za-z0-9（）()\-·]{2,24}$/.test(s)
      }

      for (const it of dayItems) {
        let idx = -1
        if (!isNameish(it.str)) {
          for (let i = 0; i < anchors.length; i++) {
            if (anchors[i].x <= it.x + 2) idx = i
          }
        } else {
          let bestD = Infinity
          for (let i = 0; i < anchors.length; i++) {
            const d = Math.abs(anchors[i].x - it.x)
            if (d < bestD && d < 55) {
              bestD = d
              idx = i
            }
          }
        }
        if (idx < 0) {
          let bestD = Infinity
          for (let i = 0; i < anchors.length; i++) {
            const d = Math.abs(anchors[i].x - it.x)
            if (d < bestD) {
              bestD = d
              idx = i
            }
          }
        }
        buckets[idx].push(it)
      }
      groups.push(...buckets)

      if (bucket.overflows.length) {
        let target = groups.length - 1
        for (let i = groups.length - 1; i >= 0; i--) {
          const t = groups[i]
            .slice()
            .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
            .map((x) => x.str)
            .join('')
          const withOverflow = (t + bucket.overflows.map((x) => x.str).join('')).replace(
            /\s+/g,
            '',
          )
          if (parseListCell(withOverflow)) {
            target = i
            break
          }
          if (!parseListCell(t.replace(/\s+/g, ''))) {
            target = i
            break
          }
        }
        groups[target].push(...bucket.overflows)
      }
    }

    for (const group of groups) {
      const text = group
        .slice()
        .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
        .map((x) => x.str)
        .join('')
      const parsed = parseListCell(text)
      if (!parsed) continue
      for (const wp of parsed.weekParts) {
        courses.push({
          id: uid(),
          name: parsed.name,
          teacher: parsed.teacher,
          room: parsed.room,
          weekday: bucket.weekday,
          startSection: parsed.startSection,
          endSection: parsed.endSection,
          weeks: wp.weeks,
          weekParity: wp.parity,
          source: 'import',
        })
      }
    }
  }

  for (const it of items) {
    if (it.str.includes('其他课程') || it.str.includes('组班上课')) {
      courses.push(...parseOtherCourses(it.str))
    }
  }

  return courses
}

/** 表格式课表：星期为列，独立节次「1-2」+「周数:」详情 */
function parseGridStyleCourses(items: PdfTextItem[]): Course[] {
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
          source: 'import',
        })
      }
    }

    for (const it of pageItems) {
      if (it.str.includes('其他课程') || it.str.includes('组班上课')) {
        courses.push(...parseOtherCourses(it.str))
      }
    }
  }

  return courses
}

/** 在浏览器中用 pdfjs 提取文本项 */
export async function extractPdfTextItems(
  data: ArrayBuffer,
): Promise<PdfTextItem[]> {
  installPdfCompat()
  // legacy 构建对中文 CMap / 旧手机更稳
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const origin = window.location.origin
  const base = import.meta.env.BASE_URL || '/'
  const root = new URL(base, origin).href.replace(/\/?$/, '/')
  const workerSrc = new URL('pdfjs/pdf.worker.min.mjs', root).href
  const localCmap = new URL('pdfjs/cmaps/', root).href
  const localFonts = new URL('pdfjs/standard_fonts/', root).href
  const cdnCmap = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/cmaps/'
  const cdnFonts =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/standard_fonts/'

  const bytes = new Uint8Array(data.slice(0))

  const tryLoad = async (opts: {
    cMapUrl: string
    standardFontDataUrl: string
    worker: boolean
  }) => {
    pdfjs.GlobalWorkerOptions.workerSrc = opts.worker ? workerSrc : ''
    const loadingTask = pdfjs.getDocument({
      data: bytes.slice(0),
      useSystemFonts: true,
      cMapUrl: opts.cMapUrl,
      cMapPacked: true,
      standardFontDataUrl: opts.standardFontDataUrl,
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

  const attempts = [
    { cMapUrl: localCmap, standardFontDataUrl: localFonts, worker: false },
    { cMapUrl: localCmap, standardFontDataUrl: localFonts, worker: true },
    { cMapUrl: cdnCmap, standardFontDataUrl: cdnFonts, worker: false },
  ]

  let lastError: unknown = null
  for (const attempt of attempts) {
    try {
      const items = await tryLoad(attempt)
      if (items.length > 0) return items
    } catch (e) {
      lastError = e
    }
  }

  if (lastError) {
    throw new Error(
      lastError instanceof Error
        ? `PDF 解析失败：${lastError.message}`
        : 'PDF 解析失败',
    )
  }
  throw new Error(
    'PDF 里没有可读文字。请确认是教务「导出/打印」的课表 PDF（不是截图）；也可展开下方「复制粘贴文字」导入。',
  )
}

export async function parseZfPdfFile(file: File): Promise<TimetablePayload> {
  const buf = await file.arrayBuffer()
  const items = await extractPdfTextItems(buf)
  return parseZfPdfItems(items)
}
