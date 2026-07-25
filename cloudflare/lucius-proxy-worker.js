/**
 * Cloudflare Worker：把 Lucius 国外接口反代到 *.workers.dev
 * 国内访问 Worker 往往比直连 Railway 更稳（仍非 100%）。
 *
 * 用法：Cloudflare 控制台 → Workers → 创建 → 粘贴本文件 → 部署
 * 记下地址，例如：https://lucius-cn.你的名.workers.dev
 */

const API_ORIGIN = 'https://lucius-api-server-prod-prod.up.railway.app'
const BOT_ORIGIN = 'https://lucius-bot-prod.up.railway.app'

function corsHeaders(req) {
  const origin = req.headers.get('Origin') || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      req.headers.get('Access-Control-Request-Headers') ||
      'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  }
}

async function proxy(req, targetOrigin) {
  const url = new URL(req.url)
  const target = new URL(url.pathname + url.search, targetOrigin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  const headers = new Headers(req.headers)
  headers.delete('host')
  headers.set('host', new URL(targetOrigin).host)

  const init = {
    method: req.method,
    headers,
    redirect: 'follow',
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer()
  }

  const upstream = await fetch(target.toString(), init)
  const outHeaders = new Headers(upstream.headers)
  const cors = corsHeaders(req)
  Object.entries(cors).forEach(([k, v]) => outHeaders.set(k, v))

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  })
}

export default {
  async fetch(req) {
    const path = new URL(req.url).pathname

    // /bot/*  → lucius-bot-prod .../web/*
    // /api/*  → lucius-api-server .../api/*
    if (path.startsWith('/bot/')) {
      const u = new URL(req.url)
      u.pathname = path.replace(/^\/bot/, '/web')
      return proxy(new Request(u.toString(), req), BOT_ORIGIN)
    }
    if (path.startsWith('/api/')) {
      return proxy(req, API_ORIGIN)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        usage: {
          apiBaseUrl: 'https://<worker>/api/v2',
          sendUrl: 'https://<worker>/bot/message',
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json', ...corsHeaders(req) },
      },
    )
  },
}
