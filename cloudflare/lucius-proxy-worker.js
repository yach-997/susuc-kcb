/**
 * Cloudflare Worker：Lucius 反代（国内）
 * 粘贴到 lucius-cn Worker → Save and Deploy
 */

const API_ORIGIN = 'https://lucius-api-server-prod-prod.up.railway.app'
const BOT_ORIGIN = 'https://lucius-bot-prod.up.railway.app'
const ALLOWED_ORIGIN = 'https://susuc-kcb.shipstatic.com'

function corsHeaders(req) {
  const origin = req.headers.get('Origin') || ALLOWED_ORIGIN
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      req.headers.get('Access-Control-Request-Headers') ||
      'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

async function proxy(req, targetOrigin) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  const url = new URL(req.url)
  const target = new URL(url.pathname + url.search, targetOrigin)

  const headers = new Headers()
  // 只转发必要头，并强制 Origin，避免 Lucius 报 Origin not allowed
  headers.set('content-type', req.headers.get('content-type') || 'application/json')
  headers.set('accept', req.headers.get('accept') || 'application/json')
  headers.set('origin', ALLOWED_ORIGIN)
  headers.set('referer', `${ALLOWED_ORIGIN}/`)
  headers.set('user-agent', req.headers.get('user-agent') || 'susuc-kcb-proxy')

  const init = {
    method: req.method,
    headers,
    redirect: 'follow',
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer()
  }

  let upstream
  try {
    upstream = await fetch(target.toString(), init)
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'upstream_unreachable',
        detail: String(e && e.message ? e.message : e),
      }),
      {
        status: 502,
        headers: { 'content-type': 'application/json', ...corsHeaders(req) },
      },
    )
  }

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
        service: 'lucius-cn-proxy',
        usage: {
          apiBaseUrl: 'https://lucius-cn.314766236.workers.dev/api/v2',
          sendUrl: 'https://lucius-cn.314766236.workers.dev/bot/message',
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json', ...corsHeaders(req) },
      },
    )
  },
}
