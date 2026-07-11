/**
 * 生成 PWA PNG 图标（薄荷绿课表卡片风格）
 * 运行: node scripts/generate-icons.mjs
 *
 * 若已有手工精修的 PNG，可直接覆盖 public/pwa-*.png；
 * 本脚本作为可复现的备用生成器。
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

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}

function inRoundRect(nx, ny, x0, y0, x1, y1, r) {
  if (nx < x0 || nx > x1 || ny < y0 || ny > y1) return false
  const lx = nx - x0
  const rx = x1 - nx
  const ty = ny - y0
  const by = y1 - ny
  if (lx >= r && rx >= r) return true
  if (ty >= r && by >= r) return true
  const cx = lx < r ? r - lx : rx < r ? r - rx : 0
  const cy = ty < r ? r - ty : by < r ? r - by : 0
  return cx * cx + cy * cy <= r * r
}

function paintIcon(size) {
  const rows = []
  for (let y = 0; y < size; y++) {
    const line = Buffer.alloc(1 + size * 3)
    line[0] = 0
    const ny = (y + 0.5) / size
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size
      // background gradient
      let pr = lerp(0x12, 0x0a, ny)
      let pg = lerp(0x85, 0x56, ny)
      let pb = lerp(0x6d, 0x46, ny)

      // outer rounded square is the canvas itself for PNG; soft highlight
      if ((nx - 0.35) ** 2 / 0.12 + (ny - 0.18) ** 2 / 0.05 < 1) {
        pr = lerp(pr, 255, 0.1)
        pg = lerp(pg, 255, 0.1)
        pb = lerp(pb, 255, 0.1)
      }

      // card
      if (inRoundRect(nx, ny, 0.22, 0.21, 0.78, 0.8, 0.08)) {
        pr = lerp(255, 0xee, (nx + ny) / 2)
        pg = lerp(255, 0xf7, (nx + ny) / 2)
        pb = lerp(255, 0xf3, (nx + ny) / 2)
      }
      // header
      if (inRoundRect(nx, ny, 0.22, 0.21, 0.78, 0.335, 0.08) || (nx > 0.22 && nx < 0.78 && ny > 0.27 && ny < 0.335)) {
        pr = 0x0a
        pg = 0x56
        pb = 0x46
      }
      // blocks
      const blocks = [
        [0.28, 0.4, 0.47, 0.54, [0xd7, 0xef, 0xe6]],
        [0.53, 0.4, 0.72, 0.54, [0x9f, 0xd4, 0xc2]],
        [0.28, 0.58, 0.47, 0.72, [0x5e, 0xac, 0x95]],
        [0.53, 0.58, 0.72, 0.72, [0x0d, 0x6e, 0x5a]],
      ]
      for (const [x0, y0, x1, y1, col] of blocks) {
        if (inRoundRect(nx, ny, x0, y0, x1, y1, 0.035)) {
          pr = col[0]
          pg = col[1]
          pb = col[2]
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
  const idat = deflateSync(Buffer.concat(rows), { level: 9 })
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [180, 192, 512]) {
  const name =
    size === 180 ? 'apple-touch-icon.png' : size === 192 ? 'pwa-192.png' : 'pwa-512.png'
  writeFileSync(join(publicDir, name), paintIcon(size))
  console.log('wrote', name)
}
