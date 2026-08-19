#!/usr/bin/env node
/**
 * CI 兼容层：旧 workflow 仍传 --api-key，转发给新版 ship CLI 的 --token。
 * 上传目录前自动清理旧部署，避免免费版部署数上限卡住。
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const realBin = require.resolve('ship-real/cli')

function mapArgs(argv) {
  const mapped = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--api-key') {
      mapped.push('--token', argv[++i] ?? '')
      continue
    }
    mapped.push(a)
  }
  return mapped
}

function tokenFromArgs(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token' && args[i + 1]) return args[i + 1]
    if (args[i] === '--api-key' && args[i + 1]) return args[i + 1]
  }
  return process.env.SHIP_API_KEY || process.env.SHIP_TOKEN || ''
}

function run(args) {
  return spawnSync(process.execPath, [realBin, ...args], {
    stdio: 'inherit',
    env: process.env,
  })
}

function runQuiet(args) {
  return spawnSync(process.execPath, [realBin, ...args], {
    encoding: 'utf8',
    env: process.env,
  })
}

function isUploadInvocation(args) {
  if (args.length === 0) return false
  const subcommands = new Set([
    'whoami',
    'deployments',
    'domains',
    'tokens',
    'config',
    'help',
    '--help',
    '-h',
    '--version',
    '-V',
  ])
  const first = args[0]
  if (subcommands.has(first) || first.startsWith('-')) return false
  return true
}

function pruneOldDeployments(token) {
  if (!token) return
  const list = runQuiet(['deployments', 'list', '--token', token, '-q'])
  if (list.status !== 0 || !list.stdout) return
  for (const id of list.stdout.split(/\r?\n/)) {
    const trimmed = id.trim()
    if (!trimmed) continue
    console.log(`prune old deployment: ${trimmed}`)
    runQuiet(['deployments', 'delete', trimmed, '--token', token, '-q'])
  }
}

const raw = process.argv.slice(2)
const mapped = mapArgs(raw)

if (isUploadInvocation(mapped)) {
  pruneOldDeployments(tokenFromArgs([...raw, ...mapped]))
}

const r = run(mapped)
process.exit(r.status ?? 1)
