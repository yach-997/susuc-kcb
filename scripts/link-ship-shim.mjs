/**
 * npm ci 后把 node_modules/.bin/ship 指向本地 shim，
 * 避免 ship-real 的 bin 覆盖导致 CI 仍走 registry CLI。
 */
import { writeFileSync, chmodSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const shim = resolve(root, 'vendor/ship-cli-shim/bin/ship.js')
const binDir = join(root, 'node_modules', '.bin')

const unix = `#!/usr/bin/env sh
exec node "${shim.replace(/\\/g, '/')}" "$@"
`
const win = `@ECHO off\r\nnode "${shim.replace(/\\/g, '/')}" %*\r\n`
const ps1 = `#!/usr/bin/env pwsh
node "${shim.replace(/\\/g, '/')}" @args
`

writeFileSync(join(binDir, 'ship'), unix)
writeFileSync(join(binDir, 'ship.cmd'), win)
writeFileSync(join(binDir, 'ship.ps1'), ps1)

try {
  chmodSync(join(binDir, 'ship'), 0o755)
} catch {
  /* windows */
}

console.log('linked ship CLI shim -> vendor/ship-cli-shim/bin/ship.js')
