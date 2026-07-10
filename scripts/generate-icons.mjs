/**
 * 生成简易 PWA PNG 图标（纯 Node，无额外依赖）
 * 运行: node scripts/generate-icons.mjs
 */
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

function crcTable() {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
}
const CRC = crcTable()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function solidPng(size, rgb) {
  const [r, g, b] = rgb
  const row = Buffer.alloc(1 + size * 3)
  const rows = []
  for (let y = 0; y < size; y++) {
    const line = Buffer.alloc(1 + size * 3)
    line[0] = 0
    for (let x = 0; x < size; x++) {
      // 圆角遮罩近似 + 日历块
      const nx = (x + 0.5) / size
      const ny = (y + 0.5) / size
      const edge = 0.12
      const inRound =
        nx > edge &&
        nx < 1 - edge &&
        ny > edge &&
        ny < 1 - edge
      const cx = Math.min(nx, 1 - nx, ny, 1 - ny)
      const rounded = cx >= edge * 0.35 || inRound

      let pr = 0xf3,
        pg = 0xf7,
        pb = 0xf5
      if (rounded) {
        pr = r
        pg = g
        pb = b
        // 浅色日历区
        if (nx > 0.18 && nx < 0.82 && ny > 0.22 && ny < 0.78) {
          pr = 0xe6
          pg = 0xf4
          pb = 0xef
        }
        // 顶栏
        if (nx > 0.18 && nx < 0.82 && ny > 0.22 && ny < 0.36) {
          pr = 0x0a
          pg = 0x56
          pb = 0x46
        }
        // 色块
        const blocks = [
          [0.28, 0.45, 0.42, 0.55, [0x0d, 0x6e, 0x5a]],
          [0.46, 0.45, 0.6, 0.55, [0x25, 0x63, 0xeb]],
          [0.64, 0.45, 0.78, 0.55, [0xdb, 0x27, 0x77]],
          [0.28, 0.58, 0.42, 0.68, [0xc2, 0x41, 0x0c]],
          [0.46, 0.58, 0.6, 0.68, [0x7c, 0x3a, 0xed]],
        ]
        for (const [x0, y0, x1, y1, col] of blocks) {
          if (nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1) {
            pr = col[0]
            pg = col[1]
            pb = col[2]
          }
        }
      }
      const i = 1 + x * 3
      line[i] = pr
      line[i + 1] = pg
      line[i + 2] = pb
    }
    rows.push(line)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = deflateSync(Buffer.concat(rows), { level: 9 })
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const brand = [0x0d, 0x6e, 0x5a]
for (const size of [180, 192, 512]) {
  const name =
    size === 180 ? 'apple-touch-icon.png' : size === 192 ? 'pwa-192.png' : 'pwa-512.png'
  writeFileSync(join(publicDir, name), solidPng(size, brand))
  console.log('wrote', name)
}
