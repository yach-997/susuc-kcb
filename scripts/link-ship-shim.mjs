/**
 * npm ci 后覆盖 node_modules/.bin/ship，指向本地 shim。
 * 使用 postinstall 时的绝对路径，避免 Linux CI 上 __dirname 解析错误。
 */
import { writeFileSync, chmodSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const shim = resolve(root, 'vendor/ship-cli-shim/bin/ship.js')
const binDir = join(root, 'node_modules', '.bin')

const wrapper = `#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const r = spawnSync(process.execPath, [${JSON.stringify(shim)}, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(r.status ?? 1)
`

writeFileSync(join(binDir, 'ship'), wrapper)
writeFileSync(
  join(binDir, 'ship.cmd'),
  `@ECHO off\r\nnode "${shim.replace(/\\/g, '/')}" %*\r\n`,
)
writeFileSync(
  join(binDir, 'ship.ps1'),
  `#!/usr/bin/env pwsh\nnode "${shim.replace(/\\/g, '/')}" @args\n`,
)

try {
  chmodSync(join(binDir, 'ship'), 0o755)
} catch {
  /* windows */
}

console.log('linked ship CLI shim ->', shim)
