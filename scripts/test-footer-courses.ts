/**
 * 页脚实践/其他课程解析单测（不依赖 PDF 引擎）
 */
import { parseZfPdfItems, type PdfTextItem } from '../src/lib/parsePdf'

function item(str: string, x = 10, y = 20, page = 1): PdfTextItem {
  return { str, x, y, page }
}

// 最小可过主解析的列表式骨架 + 页脚
const items: PdfTextItem[] = [
  item('陈春升课表', 40, 800),
  item('2024-2025学年第1学期', 40, 780),
  item('星期一', 20, 700),
  item('高等数学★', 80, 650),
  item('(1-2节)1-16周/校区:宜宾/场地:A101/教师:张三', 80, 630),
  item('星期二', 20, 500),
  item(
    '实践课程：IT项目实习黄洪(共2周)/18-19周;',
    40,
    30,
    3,
  ),
  item(
    '其他课程：[重修]大学物理B2★彭映铨(共8周)/1-8周/无/组班上课：第6-13周 星期三 第7-10节；LA4-206；请第四周前联系',
    40,
    28,
    3,
  ),
]

const payload = parseZfPdfItems(items)
const names = payload.courses.map((c) => c.name)
console.log('courses', payload.courses.length)
for (const c of payload.courses) {
  console.log(
    `- ${c.name} | 周${c.weekday} ${c.startSection}-${c.endSection} | ${c.weeks} | ${c.room} | ${c.teacher}`,
  )
}
const okPractice = names.some((n) => n.includes('IT项目实习'))
const okOther = names.some((n) => n.includes('大学物理B2'))
const practice = payload.courses.find((c) => c.name.includes('IT项目实习'))
const other = payload.courses.find((c) => c.name.includes('大学物理B2'))
if (!okPractice || !okOther) {
  console.error('FAIL', { okPractice, okOther })
  process.exit(1)
}
if (
  !practice ||
  practice.schedule !== 'unscheduled' ||
  practice.weekday !== 0 ||
  practice.startSection !== 0 ||
  practice.spanWeeks !== 2
) {
  console.error('FAIL practice must be unscheduled with no fake slot', practice)
  process.exit(1)
}
if (
  !other ||
  other.schedule !== 'timed' ||
  other.weekday !== 3 ||
  other.startSection !== 7 ||
  other.endSection !== 10 ||
  other.spanWeeks !== 8
) {
  console.error('FAIL other must keep real 组班时间', other)
  process.exit(1)
}
console.log('PASS footer practice unscheduled + other timed')

const fanItems: PdfTextItem[] = [
  item('范林娜课表', 40, 800),
  item('2026-2027学年第1学期', 40, 780),
  item('星期一', 20, 700),
  item('高等数学★', 80, 650),
  item('(1-2节)1-16周/校区:宜宾/场地:A101/教师:张三', 80, 630),
  item('星期二', 20, 500),
  item('实践课程：工程训练(金工)D■张建平(共1周)/15周;', 40, 30, 3),
  item('其他课程：认知实习■张程然(共1周)/19周/无;', 40, 28, 3),
]
const fan = parseZfPdfItems(fanItems)
const jin = fan.courses.find((c) => c.name.includes('工程训练'))
const renzhi = fan.courses.find((c) => c.name.includes('认知实习'))
if (
  !jin ||
  jin.teacher !== '张建平' ||
  /D张$/.test(jin.name) ||
  jin.spanWeeks !== 1
) {
  console.error('FAIL 金工 teacher/name split', jin)
  process.exit(1)
}
if (
  !renzhi ||
  renzhi.teacher !== '张程然' ||
  renzhi.schedule !== 'unscheduled' ||
  renzhi.spanWeeks !== 1
) {
  console.error('FAIL 认知实习', renzhi)
  process.exit(1)
}
console.log('PASS fan linna footer name/teacher split')
