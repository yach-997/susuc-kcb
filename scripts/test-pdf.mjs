import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseZfPdfItems } from '../src/lib/parsePdf.ts'

const require = createRequire(import.meta.url)
const pdfjsPath = path.dirname(require.resolve('pdfjs-dist/package.json'))
const cMapUrl = (path.join(pdfjsPath, 'cmaps') + '/').replace(/\\/g, '/')
const fontUrl = (path.join(pdfjsPath, 'standard_fonts') + '/').replace(/\\/g, '/')
const pdfPath = 'c:/Users/Administrator/Desktop/资料/陈春升(2024-2025-1)课表.pdf'
const data = new Uint8Array(fs.readFileSync(pdfPath))
const doc = await getDocument({
  data,
  useSystemFonts: true,
  cMapUrl,
  cMapPacked: true,
  standardFontDataUrl: fontUrl,
}).promise

const items = []
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  const content = await page.getTextContent()
  for (const it of content.items) {
    if (!it.str?.trim()) continue
    items.push({
      str: String(it.str),
      x: +it.transform[4].toFixed(1),
      y: +it.transform[5].toFixed(1),
      page: i,
    })
  }
}

const payload = parseZfPdfItems(items)
console.log('courses', payload.courses.length)
console.log('school', payload.school)
for (const c of payload.courses) {
  const parity = c.weekParity !== 'all' ? `(${c.weekParity})` : ''
  console.log(
    `周${c.weekday} ${c.startSection}-${c.endSection}节 ${c.name} | ${c.teacher} | ${c.room} | ${c.weeks}${parity}`,
  )
}
