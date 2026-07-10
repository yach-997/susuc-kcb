/**
 * 本地测试两种正方课表 PDF（Node + cMap）。
 * 用法: npx tsx scripts/test-pdf-parse.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseZfPdfItems, type PdfTextItem } from '../src/lib/parsePdf'

class NodeCMapReaderFactory {
  baseUrl: string
  isCompressed: boolean
  constructor({
    baseUrl,
    isCompressed = true,
  }: {
    baseUrl: string
    isCompressed?: boolean
  }) {
    this.baseUrl = baseUrl
    this.isCompressed = isCompressed
  }
  async fetch({ name }: { name: string }) {
    const file = join(
      this.baseUrl,
      name + (this.isCompressed ? '.bcmap' : ''),
    )
    return {
      cMapData: new Uint8Array(readFileSync(file)),
      compressionType: this.isCompressed ? 1 : 0,
    }
  }
}

async function loadItems(pdfPath: string): Promise<PdfTextItem[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(readFileSync(pdfPath))
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    cMapUrl: 'public/pdfjs/cmaps/',
    cMapPacked: true,
    CMapReaderFactory: NodeCMapReaderFactory,
    standardFontDataUrl: 'public/pdfjs/standard_fonts/',
  }).promise

  const items: PdfTextItem[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    for (const raw of content.items) {
      if (!('str' in raw) || !raw.str?.trim()) continue
      const t = raw as { str: string; transform: number[] }
      items.push({
        str: t.str,
        x: +t.transform[4].toFixed(1),
        y: +t.transform[5].toFixed(1),
        page: p,
      })
    }
  }
  return items
}

async function testOne(label: string, path: string) {
  const items = await loadItems(path)
  const payload = parseZfPdfItems(items)
  console.log(`\n=== ${label} ===`)
  console.log('school:', payload.school)
  console.log('term:', payload.termLabel)
  console.log('courses:', payload.courses.length)
  const sample = payload.courses.slice(0, 8).map(
    (c) =>
      `周${c.weekday} 第${c.startSection}-${c.endSection}节 ${c.weeks} | ${c.name} @ ${c.room} / ${c.teacher}`,
  )
  console.log(sample.join('\n'))
  return payload.courses.length
}

const chen = await testOne('表格式·陈春升', 'tmp-chen.pdf')
const maoPayload = await (async () => {
  const items = await loadItems('tmp-mao.pdf')
  const payload = parseZfPdfItems(items)
  console.log('\n=== 列表式·毛茂婷 全部 ===')
  for (const c of payload.courses) {
    console.log(
      `周${c.weekday} 第${c.startSection}-${c.endSection}节 ${c.weeks} | ${c.name} @ ${c.room} / ${c.teacher}`,
    )
  }
  console.log('courses:', payload.courses.length)
  return payload
})()
const mao = maoPayload.courses.length

if (chen < 10) {
  console.error('FAIL: 陈春升识别过少', chen)
  process.exit(1)
}
if (mao < 15) {
  console.error('FAIL: 毛茂婷识别过少', mao)
  process.exit(1)
}
console.log('\nOK both formats parsed.')

