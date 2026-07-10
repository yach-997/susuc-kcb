import type { Course, TimetablePayload, WeekParity } from '../types'
import { parseWeekParity, uid } from './storage'
import { installPdfCompat } from './pdfCompat'
import { readBlobBuffer } from './importDraft'

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

/**
 * 表格式星期判定：落在相邻表头之间时取较近一侧；
 * 几乎等距时偏左（末列节次常略越过几何中点）。
 */
function weekdayForX(
  x: number,
  headers: { x: number; weekday: number }[],
): number | null {
  if (!headers.length) return null
  const sorted = [...headers].sort((a, b) => a.x - b.x)
  const rightIdx = sorted.findIndex((h) => h.x >= x)
  if (rightIdx === -1) return sorted[sorted.length - 1].weekday
  if (rightIdx === 0) return sorted[0].weekday
  const left = sorted[rightIdx - 1]
  const right = sorted[rightIdx]
  const distL = x - left.x
  const distR = right.x - x
  // 偏左 8pt：411 距周三 43、周四 42 仍归周三
  if (distL <= distR + 8) return left.weekday
  return right.weekday
}

/** 节次匹配：课名常在节次左侧，近距时略偏好右侧节次 */
function nearestSection<T extends { x: number }>(
  items: T[],
  x: number,
  maxDist = 45,
): T | null {
  let best: T | null = null
  let bestScore = Infinity
  for (const it of items) {
    const d = Math.abs(it.x - x)
    if (d > maxDist) continue
    // 节次在课名左侧时加一点代价，避免跨日抢邻列
    const score = d + (it.x < x - 0.5 ? 2.5 : 0)
    if (
      score < bestScore - 0.05 ||
      (Math.abs(score - bestScore) <= 0.05 && best && it.x >= x && best.x < x)
    ) {
      bestScore = score
      best = it
    }
  }
  return best
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
type ListParsed = {
  name: string
  startSection: number
  endSection: number
  weekParts: { weeks: string; parity: WeekParity }[]
  room: string
  teacher: string
}

function listParsedFromParts(
  nameRaw: string,
  startSection: number,
  endSection: number,
  rest: string,
): ListParsed | null {
  const marked = [
    ...nameRaw.matchAll(/([\u4e00-\u9fffA-Za-z0-9（）()\-·]{1,30}[★☆■])/g),
  ].map((x) => x[1])
  let name = cleanCourseName(marked.at(-1) || nameRaw)
  // 去掉详情残留前缀
  name = name.replace(/^(理论学|实践学|学时|组成|备注|方式|学分)+/g, '')
  // 若混入上一段尾巴，保留最后一个像课名的片段（以常见课程字开头或整段）
  const tail = name.match(
    /[\u4e00-\u9fffA-Za-z0-9（）()]{2,}(?:\([^)]*\))?$/,
  )
  if (tail && tail[0].length >= 2 && tail[0].length < name.length) {
    // 仅当前面明显是垃圾时截断
    if (/理论|实践|学时|组成|备注|方式|学分|思政\d/.test(name.slice(0, -tail[0].length))) {
      name = tail[0]
    }
  }
  if (!name || name.length < 2) return null
  if (/学分|教学班|考核方式|选课备注|课程学时/.test(name)) return null

  const weeksRaw = (rest.split('/')[0] || '1-16').replace(/周/g, '')
  const weekParts = weeksRaw
    .split(/[,，]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => parseWeeksField(p))
  if (!weekParts.length) weekParts.push(parseWeeksField('1-16'))

  const room = (
    rest.match(/场地[:：]?([^/]+)/)?.[1] ||
    rest.match(/地点[:：]?([^/]+)/)?.[1] ||
    '未知教室'
  )
    .trim()
    .replace(/教师.*/, '')
  const teacher = (rest.match(/教师[:：]?([^/]+)/)?.[1] || '未知教师')
    .trim()
    .replace(/教学班.*/, '')
    .replace(/组班.*/, '')

  return { name, startSection, endSection, weekParts, room, teacher }
}

/** 一段文字里可能有多门课（次页续写挤在一起时） */
function parseListCells(text: string): ListParsed[] {
  const compact = text.replace(/\s+/g, '')
  if (!compact) return []

  const secRe = /\((\d{1,2})[-~～](\d{1,2})节\)/g
  const hits = [...compact.matchAll(secRe)]
  if (!hits.length) return []

  const out: ListParsed[] = []
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]
    const secIdx = hit.index ?? 0
    const prevSecEnd =
      i === 0 ? 0 : (hits[i - 1].index ?? 0) + hits[i - 1][0].length
    const nameChunk = compact.slice(prevSecEnd, secIdx)
    // 课名取「最后一个 ★ 段」，避免吃到上一段「理论学时」等尾巴
    const starredAll = [
      ...nameChunk.matchAll(/([\u4e00-\u9fffA-Za-z0-9（）()\-·]{1,30}[★☆■])/g),
    ]
    const starred = starredAll.at(-1)?.[1]
    const plain = nameChunk.match(
      /([\u4e00-\u9fffA-Za-z0-9（）()\-·]{2,40})$/,
    )?.[1]
    const nameRaw = starred || plain || ''
    if (!nameRaw) continue

    const restStart = secIdx + hit[0].length
    const restLimit =
      i + 1 < hits.length ? (hits[i + 1].index ?? compact.length) : compact.length
    let rest = compact.slice(restStart, restLimit)
    // 去掉下一段课名
    rest = rest.replace(/[\u4e00-\u9fffA-Za-z0-9（）()\-·]+[★☆■]?$/, '')

    const parsed = listParsedFromParts(
      nameRaw,
      Number(hit[1]),
      Number(hit[2]),
      rest,
    )
    if (parsed) out.push(parsed)
  }
  return out
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
  if (/^学号\s*[：:]/.test(s) || /^打印时间/.test(s)) return true
  if (/课表$/.test(s) && !NAME_MARK_RE.test(s) && s.length < 24) return true
  if (/\d{4}-\d{4}学年/.test(s)) return true
  // 底部节次序号 1..11
  if (/^\d{1,2}$/.test(s) && it.y < 100) return true
  // 图例行
  if (/^:\s*课程设计/.test(s)) return true
  if (s.includes('课程设计') && s.includes('理论学时') && s.includes('实验学时')) return true
  return false
}

type SecMarker = {
  item: PdfTextItem
  start: number
  end: number
  weekday: number
  /** (N-M节) 在字符串中的位置之后的详情前缀（同一 text item 内） */
  inlineRest: string
}

/**
 * 列表式课表（严谨版）：
 * 每个「(N-M节)」是一门课的唯一锚点；按星期行 + 列位置取课名与详情，再解析周次/教室/教师。
 */
function parseListStyleCourses(items: PdfTextItem[]): Course[] {
  const labels = items
    .map((it) => {
      const m = it.str.match(WEEKDAY_RE)
      if (!m) return null
      return { y: it.y, weekday: WEEKDAY_MAP[m[1]], page: it.page }
    })
    .filter((x): x is { y: number; weekday: number; page: number } => !!x)

  const firstPage = labels.length ? Math.min(...labels.map((x) => x.page)) : 1
  const bandLabels = labels
    .filter((l) => l.page === firstPage)
    .sort((a, b) => b.y - a.y)
  if (!bandLabels.length) return []

  /** 课程 y 落在哪个星期行：取「仍在课程上方的、最低的那个星期标签」 */
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

  const usable = items.filter((it) => !isNoiseItem(it))

  const markers: SecMarker[] = []
  for (const it of usable) {
    const m = it.str.match(/\((\d{1,2})\s*[-~～]\s*(\d{1,2})\s*节\)/)
    if (!m || m.index == null) continue
    const wd = weekdayForY(it.y)
    if (wd == null) continue
    markers.push({
      item: it,
      start: Number(m[1]),
      end: Number(m[2]),
      weekday: wd,
      inlineRest: it.str.slice(m.index + m[0].length),
    })
  }
  markers.sort(
    (a, b) =>
      a.weekday - b.weekday ||
      a.item.page - b.item.page ||
      a.item.x - b.item.x ||
      b.item.y - a.item.y,
  )

  const courses: Course[] = []
  const usedNameKeys = new Set<string>()

  for (let i = 0; i < markers.length; i++) {
    const mk = markers[i]
    const sameDay = markers.filter((m) => m.weekday === mk.weekday)
    const idxInDay = sameDay.indexOf(mk)
    const prev = idxInDay > 0 ? sameDay[idxInDay - 1] : null
    const next = idxInDay < sameDay.length - 1 ? sameDay[idxInDay + 1] : null

    // 列边界：同一天相邻锚点中点；跨页续写锚点 x 很小，用「右侧剩余列」逻辑
    const xLeft =
      prev && prev.item.page === mk.item.page
        ? (prev.item.x + mk.item.x) / 2
        : mk.item.x - 35
    const xRight =
      next && next.item.page === mk.item.page
        ? (mk.item.x + next.item.x) / 2
        : mk.item.x + 110

    // 1) 课名：优先同页、锚点上方（y 更大）、落在本列的 ★/课名块
    const nameParts = usable
      .filter((it) => {
        if (weekdayForY(it.y) !== mk.weekday) return false
        if (/\(\d{1,2}\s*[-~～]\s*\d{1,2}\s*节\)/.test(it.str)) return false
        if (/校区|场地|地点|教师|教学班|学分|考核|选课备注|学时组成/.test(it.str))
          return false
        // 同页：在锚点之上或同行偏左上
        if (it.page === mk.item.page) {
          if (it.y < mk.item.y - 1) return false
          if (it.x < xLeft - 5 || it.x >= xRight) return false
          return (
            NAME_MARK_RE.test(it.str) ||
            /^[\u4e00-\u9fffA-Za-z0-9（）()\-·]{2,24}$/.test(it.str.trim())
          )
        }
        return false
      })
      .sort((a, b) => b.y - a.y || a.x - b.x)

    let nameText = nameParts.map((p) => p.str).join('')

    const needsPage1Prefix = (text: string) => {
      const bare = cleanCourseName(text)
      return !bare || bare.length <= 4 || /^(概论|导论|原理|上|下)$/.test(bare)
    }

    // 跨页锚点 / 短课名：到首页同一星期行、尚未被占用的课名列补全
    if (needsPage1Prefix(nameText) || mk.item.page > firstPage) {
      const page1Names = usable
        .filter((it) => {
          if (it.page !== firstPage) return false
          if (weekdayForY(it.y) !== mk.weekday) return false
          if (it.x < 80) return false
          if (/\(\d{1,2}\s*[-~～]\s*\d{1,2}\s*节\)/.test(it.str)) return false
          if (/校区|场地|地点|教师|教学班|学分|考核|选课|学时组成/.test(it.str))
            return false
          return (
            NAME_MARK_RE.test(it.str) ||
            /^[\u4e00-\u9fffA-Za-z0-9（）()\-·]{2,24}$/.test(it.str.trim())
          )
        })
        .sort((a, b) => b.x - a.x || b.y - a.y)

      const clusters: PdfTextItem[][] = []
      for (const it of page1Names) {
        const last = clusters[clusters.length - 1]
        if (last && Math.abs(last[0].x - it.x) < 45) last.push(it)
        else clusters.push([it])
      }
      for (const cl of clusters) {
        const key = `${mk.weekday}-${Math.round(cl[0].x)}`
        if (usedNameKeys.has(key)) continue
        const hasLocalMarker = markers.some(
          (m) =>
            m.weekday === mk.weekday &&
            m.item.page === firstPage &&
            Math.abs(m.item.x - cl[0].x) < 50,
        )
        if (hasLocalMarker) continue
        if (mk.item.page > firstPage || needsPage1Prefix(nameText)) {
          const prefix = cl
            .slice()
            .sort((a, b) => b.y - a.y || a.x - b.x)
            .map((x) => x.str)
            .join('')
          // 避免重复拼接
          if (!nameText.includes(cleanCourseName(prefix).slice(0, 4))) {
            nameText = prefix + nameText
          } else if (needsPage1Prefix(nameText)) {
            nameText = prefix + nameText
          }
          usedNameKeys.add(key)
          break
        }
      }
    } else if (nameParts[0]) {
      usedNameKeys.add(`${mk.weekday}-${Math.round(nameParts[0].x)}`)
    }

    // 2) 详情：锚点自身 inlineRest + 同列下方/右侧碎片 + 同星期跨页续写
    const detailParts: PdfTextItem[] = []
    for (const it of usable) {
      if (weekdayForY(it.y) !== mk.weekday) continue
      if (it === mk.item) continue
      if (NAME_MARK_RE.test(it.str) && !/校区|场地|教师/.test(it.str)) {
        // 课名留给 nameText；但跨页「概论★」若紧贴本锚点可并入 name
        if (
          it.page === mk.item.page &&
          it.y >= mk.item.y &&
          it.x >= xLeft &&
          it.x < xRight
        ) {
          continue
        }
      }
      if (/\(\d{1,2}\s*[-~～]\s*\d{1,2}\s*节\)/.test(it.str) && it !== mk.item) {
        // 其他锚点
        continue
      }

      if (it.page === mk.item.page) {
        if (it.x < xLeft || it.x >= xRight) continue
        if (it.y > mk.item.y + 2) continue // 只要锚点下方/同行
        detailParts.push(it)
        continue
      }

      // 跨页续写：下一页左侧碎片，归「本页最右锚点」或「本页按 x 所属锚点」
      if (it.page > mk.item.page) {
        // 只收左侧续写（右栏内容翻页后从左边开始）
        if (it.x > 240 && it.page === mk.item.page + 1) continue

        const pageMarkers = sameDay
          .filter((m) => m.item.page === it.page)
          .sort((a, b) => a.item.x - b.item.x)

        if (pageMarkers.length) {
          // 落在某个本页锚点左侧之前 → 上一页最右锚点的尾巴
          let owner: (typeof mk) | null = null
          for (const pm of pageMarkers) {
            if (pm.item.x <= it.x + 8) owner = pm
          }
          if (owner) {
            if (owner !== mk) continue
          } else {
            const prevMarkers = sameDay
              .filter((m) => m.item.page === it.page - 1)
              .sort((a, b) => a.item.x - b.item.x)
            const rightmost = prevMarkers.at(-1)
            if (rightmost !== mk) continue
          }
        } else {
          // 续页没有任何新锚点：全部左侧碎片归上一页该日最右锚点
          const prevMarkers = sameDay
            .filter((m) => m.item.page === it.page - 1)
            .sort((a, b) => a.item.x - b.item.x)
          const rightmost = prevMarkers.at(-1)
          if (rightmost !== mk) continue
        }
        detailParts.push(it)
      }
    }

    detailParts.sort(
      (a, b) => a.page - b.page || b.y - a.y || a.x - b.x,
    )

    // 跨页课名碎片（如「概论★」）若出现在详情里，拼回课名
    const orphanName = detailParts.filter(
      (d) =>
        NAME_MARK_RE.test(d.str) &&
        !/校区|场地|教师|教学班/.test(d.str) &&
        d.str.length <= 20,
    )
    if (orphanName.length && !NAME_MARK_RE.test(nameText)) {
      nameText += orphanName.map((o) => o.str).join('')
    }

    const detailText =
      mk.inlineRest +
      detailParts
        .filter((d) => !orphanName.includes(d) || NAME_MARK_RE.test(nameText))
        .filter((d) => !(NAME_MARK_RE.test(d.str) && d.str.length <= 12 && nameText.includes(d.str.replace(/[★☆]/g, ''))))
        .map((d) => d.str)
        .join('')

    const full = `${nameText}(${mk.start}-${mk.end}节)${detailText}`
    const parsedList = parseListCells(full)

    // 若整段解析失败，至少用锚点上的节次 + 详情字段
    const fallback = listParsedFromParts(
      nameText || '未知课程',
      mk.start,
      mk.end,
      detailText,
    )
    const list = parsedList.length
      ? parsedList
      : fallback
        ? [fallback]
        : []

    for (const parsed of list) {
      // 以锚点节次为准，避免误读
      const startSection = mk.start
      const endSection = mk.end
      for (const wp of parsed.weekParts) {
        courses.push({
          id: uid(),
          name: parsed.name,
          teacher: parsed.teacher,
          room: parsed.room,
          weekday: mk.weekday,
          startSection,
          endSection,
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

/**
 * 表格式课表：
 * - 课名与「周数:」详情数量一致，按 x 排序一一对应
 * - 节次更少（同格多周次共用一个节次标签），按最近邻匹配且允许复用
 * - 星期以节次列 x 为准（课名落在两日交界时更准）
 * - 跨页合并星期表头（周日常在第 2 页）
 */
function parseGridStyleCourses(items: PdfTextItem[]): Course[] {
  const courses: Course[] = []
  const pages = [...new Set(items.map((it) => it.page))].sort((a, b) => a - b)

  const headerMap = new Map<number, number>()
  for (const it of items) {
    const m = it.str.match(WEEKDAY_RE)
    if (!m) continue
    const wd = WEEKDAY_MAP[m[1]]
    if (!headerMap.has(wd)) headerMap.set(wd, it.x)
  }
  const headerRef = [...headerMap.entries()]
    .map(([weekday, x]) => ({ weekday, x }))
    .sort((a, b) => a.x - b.x)

  for (const page of pages) {
    const pageItems = items.filter((it) => it.page === page)

    const names = pageItems
      .filter((it) => NAME_MARK_RE.test(it.str) && !it.str.includes('理论学时'))
      .filter((it) => !it.str.includes('课程设计') && it.str.length < 40)
      .map((it) => ({ x: it.x, y: it.y, str: it.str }))
      .sort((a, b) => a.x - b.x)

    const sections = pageItems
      .map((it) => {
        const m = it.str.trim().match(SECTION_RE)
        if (!m) return null
        return { x: it.x, start: Number(m[1]), end: Number(m[2]) }
      })
      .filter((x): x is { x: number; start: number; end: number } => !!x)
      .sort((a, b) => a.x - b.x)

    const details = mergeDetailBlocks(pageItems).sort((a, b) => a.x - b.x)

    type Pair = {
      name: (typeof names)[0]
      detail: (typeof details)[0] | null
    }
    const pairs: Pair[] = []

    if (names.length && names.length === details.length) {
      for (let i = 0; i < names.length; i++) {
        pairs.push({ name: names[i], detail: details[i] })
      }
    } else {
      const usedDet = new Set<number>()
      for (const nameItem of names) {
        let detIdx = -1
        let detDist = Infinity
        for (let i = 0; i < details.length; i++) {
          if (usedDet.has(i)) continue
          const d = Math.abs(details[i].x - nameItem.x)
          if (d < detDist) {
            detDist = d
            detIdx = i
          }
        }
        if (detIdx >= 0 && detDist <= 60) usedDet.add(detIdx)
        pairs.push({
          name: nameItem,
          detail: detIdx >= 0 && detDist <= 60 ? details[detIdx] : null,
        })
      }
    }

    for (const { name: nameItem, detail } of pairs) {
      // 同格多门课共用节次标签，禁止 used 互斥
      const sec =
        nearestSection(sections, nameItem.x, 45) ||
        (detail ? nearestSection(sections, detail.x, 45) : null)
      if (!sec) continue

      const weekday =
        weekdayForX(sec.x, headerRef) ?? weekdayForX(nameItem.x, headerRef)
      if (weekday == null) continue

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
        weekday,
        startSection: sec.start,
        endSection: sec.end,
        weeks: parsed.weeks,
        weekParity: parsed.parity,
        source: 'import',
      })
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

  // 拷贝一份，避免部分手机上底层转移 ArrayBuffer 后二次尝试失败
  const bytes = new Uint8Array(data.byteLength)
  bytes.set(new Uint8Array(data))

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
      // 小文件整包加载，减少手机流式/worker 兼容问题
      disableStream: true,
      disableAutoFetch: true,
      useWorkerFetch: false,
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
    // 手机优先：本地 CMap + 主线程（不依赖 worker 跨域/缓存）
    { cMapUrl: localCmap, standardFontDataUrl: localFonts, worker: false },
    { cMapUrl: localCmap, standardFontDataUrl: localFonts, worker: true },
    { cMapUrl: cdnCmap, standardFontDataUrl: cdnFonts, worker: false },
    { cMapUrl: cdnCmap, standardFontDataUrl: cdnFonts, worker: true },
  ]

  let lastError: unknown = null
  for (const attempt of attempts) {
    try {
      const items = await tryLoad(attempt)
      if (items.length > 0) return items
      lastError = new Error('PDF 未提取到文字')
    } catch (e) {
      lastError = e
    }
  }

  if (lastError) {
    const msg =
      lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(
      /toHex|getOrInsertComputed|withResolvers|worker|fetch|network|Failed to fetch/i.test(
        msg,
      )
        ? '当前浏览器解析 PDF 不稳定。请用手机自带浏览器（Safari/Chrome）打开本站再试，不要用微信内打开。'
        : `PDF 解析失败：${msg}`,
    )
  }
  throw new Error(
    'PDF 里没有可读文字。请确认是教务「导出/打印」的课表 PDF（不是截图或扫描件）。',
  )
}

export async function parseZfPdfFile(file: File): Promise<TimetablePayload> {
  const buf = await readBlobBuffer(file)
  return parseZfPdfBuffer(buf)
}

export async function parseZfPdfBuffer(
  buf: ArrayBuffer,
): Promise<TimetablePayload> {
  const items = await extractPdfTextItems(buf)
  return parseZfPdfItems(items)
}
