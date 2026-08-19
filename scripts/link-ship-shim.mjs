/**
 * npm ci 后把 node_modules/.bin/ship 指向本地 shim（Node 包装，兼容 Linux CI）。
 */
import { writeFileSync, chmodSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const shim = join(root, 'vendor/ship-cli-shim/bin/ship.js')
const binDir = join(root, 'node_modules', '.bin')
const relShim = join('..', '..', 'vendor', 'ship-cli-shim', 'bin', 'ship.js').replace(/\\/g, '/')

const wrapper = `#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const { join } = require('node:path')
const shim = join(__dirname, '${relShim}')
const r = spawnSync(process.execPath, [shim, ...process.argv.slice(2)], { stdio: 'inherit' })
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

console.log('linked ship CLI shim -> vendor/ship-cli-shim/bin/ship.js')
