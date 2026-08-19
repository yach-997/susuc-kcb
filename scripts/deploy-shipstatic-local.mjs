/**
 * 本地部署到国内固定域名（CI 国外节点上传会超时，需在本机执行）
 *
 * 用法：
 *   1. 复制 .env.example 为 .env，填入 VITE_SUPABASE_* 和 SHIP_API_KEY
 *   2. npm run deploy:cn
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadDotEnv() {
  const path = resolve('.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i <= 0) continue
    const key = trimmed.slice(0, i).trim()
    const val = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
    ...opts,
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function runCapture(cmd, args) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: process.env,
  })
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || 'command failed')
    process.exit(r.status ?? 1)
  }
  return (r.stdout || '').trim()
}

loadDotEnv()

const token = process.env.SHIP_API_KEY?.trim()
const domain = process.env.SHIP_DOMAIN?.trim() || 'susuc-kcb.shipstatic.com'

if (!token) {
  console.error('缺少 SHIP_API_KEY。请复制 .env.example 为 .env 并填入密钥。')
  process.exit(1)
}
if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
  console.error('缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，构建产物将无法连接云端。')
  process.exit(1)
}

const ship = resolve('node_modules/.bin/ship')
const shipCmd = process.platform === 'win32' ? `"${ship}"` : ship

console.log('>>> npm run build')
run('npm', ['run', 'build'])

console.log('>>> ship ping')
run(shipCmd, ['ping', '--token', token])

console.log('>>> upload dist')
const deployId = runCapture(shipCmd, [
  'deployments',
  'upload',
  './dist',
  '--token',
  token,
  '-q',
])
if (!deployId) {
  console.error('上传成功但未返回 deployment id')
  process.exit(1)
}

console.log('deployment=', deployId)
console.log('>>> bind domain', domain)
run(shipCmd, ['domains', 'set', domain, deployId, '--token', token, '--json'])

console.log('\n完成：https://' + domain.replace(/\/$/, '') + '/')
