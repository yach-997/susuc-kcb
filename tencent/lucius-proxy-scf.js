/**
 * 腾讯云 SCF · Web 函数（Node.js 18/20）
 * 粘贴为 index.js，监听端口 9000。proxyVersion=1
 */

const http = require('http')
const https = require('https')
const dns = require('dns')
const { URL } = require('url')

const BOT_ORIGIN = 'https://lucius-bot-prod.up.railway.app'
const API_HOST = 'lucius-api-server-prod-prod.up.railway.app'
const API_IPS = ['69.46.46.108']
const CF_HOST = 'lucius-cn.314766236.workers.dev'
const CF_IPS = ['104.21.26.15', '172.67.135.35']
const ALLOWED_ORIGIN = 'https://susuc-kcb.shipstatic.com'
const PORT = Number(process.env.PORT || 9000)
const PROXY_VERSION = 1

function cors(req) {
  const origin = req.headers.origin || ALLOWED_ORIGIN
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      req.headers['access-control-request-headers'] ||
      'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function send(res, status, headers, body) {
  res.writeHead(status, headers)
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function lookup4(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  dns.lookup(hostname, { family: 4 }, (err, address, family) => {
    if (err) dns.lookup(hostname, callback)
    else callback(null, address, family)
  })
}

function httpsRequest(opts) {
  const connectHost = opts.connectHost || opts.hostname
  const headers = Object.assign(
    {
      Host: opts.hostname,
      accept: 'application/json',
      origin: ALLOWED_ORIGIN,
      referer: ALLOWED_ORIGIN + '/',
      'user-agent': 'susuc-kcb-tencent-proxy/1',
    },
    opts.headers || {},
  )
  if (opts.body && !headers['content-type']) {
    headers['content-type'] = 'application/json'
  }

  const reqOpts = {
    protocol: 'https:',
    hostname: connectHost,
    servername: opts.hostname,
    port: 443,
    path: opts.path,
    method: opts.method || 'GET',
    headers,
    timeout: opts.timeout || 12000,
    rejectUnauthorized: true,
    family: 4,
    lookup: lookup4,
  }

  return new Promise((resolve, reject) => {
    const req = https.request(reqOpts, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        resolve({
          status: res.statusCode || 502,
          headers: res.headers,
          body: Buffer.concat(chunks),
        })
      })
    })
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout:' + opts.hostname + '@' + connectHost))
    })
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

async function fetchApi(pathAndQuery, method, body, contentType) {
  const errors = []
  const headers = {}
  if (contentType) headers['content-type'] = contentType

  // 优先域名直连（腾讯云出口往往比阿里云干净）
  try {
    return await httpsRequest({
      hostname: API_HOST,
      path: pathAndQuery,
      method,
      body,
      headers,
      timeout: 15000,
    })
  } catch (e) {
    errors.push('direct:' + (e.message || e))
  }

  for (const ip of API_IPS) {
    try {
      return await httpsRequest({
        hostname: API_HOST,
        connectHost: ip,
        path: pathAndQuery,
        method,
        body,
        headers,
        timeout: 12000,
      })
    } catch (e) {
      errors.push('api-ip:' + ip + ':' + (e.message || e))
    }
  }

  for (const ip of CF_IPS) {
    try {
      return await httpsRequest({
        hostname: CF_HOST,
        connectHost: ip,
        path: pathAndQuery,
        method,
        body,
        headers,
        timeout: 10000,
      })
    } catch (e) {
      errors.push('cf:' + ip + ':' + (e.message || e))
    }
  }

  throw new Error(errors.join(' | '))
}

async function fetchBot(pathAndQuery, method, body, contentType) {
  const u = new URL(pathAndQuery, BOT_ORIGIN)
  const headers = {}
  if (contentType) headers['content-type'] = contentType
  return httpsRequest({
    hostname: u.hostname,
    path: u.pathname + u.search,
    method,
    body,
    headers,
    timeout: 20000,
  })
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || '/', 'http://127.0.0.1')
    let path = u.pathname || '/'

    const apiIdx = path.indexOf('/api/')
    const botIdx = path.indexOf('/bot/')
    if (apiIdx > 0) path = path.slice(apiIdx)
    else if (botIdx > 0) path = path.slice(botIdx)

    if (path === '/_debug' || path === '/_debug/') {
      const probes = []
      for (const label of [
        { via: 'api-direct', fn: () =>
          httpsRequest({
            hostname: API_HOST,
            path: '/api/v2/widget/wgt_56dtde6o/config',
            method: 'GET',
            timeout: 10000,
          }),
        },
        { via: 'api-ip', fn: () =>
          httpsRequest({
            hostname: API_HOST,
            connectHost: API_IPS[0],
            path: '/api/v2/widget/wgt_56dtde6o/config',
            method: 'GET',
            timeout: 10000,
          }),
        },
        { via: 'bot', fn: () => fetchBot('/', 'GET') },
      ]) {
        const started = Date.now()
        try {
          const r = await label.fn()
          probes.push({
            via: label.via,
            ok: true,
            status: r.status,
            ms: Date.now() - started,
            bytes: r.body.length,
          })
        } catch (e) {
          probes.push({
            via: label.via,
            ok: false,
            ms: Date.now() - started,
            error: String(e.message || e),
          })
        }
      }
      send(
        res,
        200,
        { 'content-type': 'application/json; charset=utf-8', ...cors(req) },
        JSON.stringify({
          ok: true,
          service: 'lucius-tencent-scf-proxy',
          proxyVersion: PROXY_VERSION,
          probes,
        }),
      )
      return
    }

    if (
      req.method === 'OPTIONS' &&
      (path.startsWith('/bot/') || path.startsWith('/api/'))
    ) {
      send(res, 204, cors(req), '')
      return
    }

    if (path.startsWith('/bot/')) {
      const botPath = path.replace(/^\/bot/, '/web') + u.search
      const body =
        req.method !== 'GET' && req.method !== 'HEAD'
          ? await readBody(req)
          : undefined
      let upstream
      try {
        upstream = await fetchBot(
          botPath,
          req.method,
          body,
          req.headers['content-type'] || 'application/json',
        )
      } catch (e) {
        send(
          res,
          502,
          { 'content-type': 'application/json; charset=utf-8', ...cors(req) },
          JSON.stringify({
            ok: false,
            error: 'upstream_unreachable',
            detail: String(e.message || e),
            proxyVersion: PROXY_VERSION,
          }),
        )
        return
      }
      const outHeaders = { ...cors(req) }
      if (upstream.headers['content-type']) {
        outHeaders['content-type'] = upstream.headers['content-type']
      }
      send(res, upstream.status, outHeaders, upstream.body)
      return
    }

    if (path.startsWith('/api/')) {
      const body =
        req.method !== 'GET' && req.method !== 'HEAD'
          ? await readBody(req)
          : undefined
      let upstream
      try {
        upstream = await fetchApi(
          path + u.search,
          req.method,
          body,
          req.headers['content-type'] || 'application/json',
        )
      } catch (e) {
        send(
          res,
          502,
          { 'content-type': 'application/json; charset=utf-8', ...cors(req) },
          JSON.stringify({
            ok: false,
            error: 'upstream_unreachable',
            detail: String(e.message || e),
            proxyVersion: PROXY_VERSION,
          }),
        )
        return
      }
      const outHeaders = { ...cors(req) }
      if (upstream.headers['content-type']) {
        outHeaders['content-type'] = upstream.headers['content-type']
      }
      send(res, upstream.status, outHeaders, upstream.body)
      return
    }

    send(
      res,
      200,
      { 'content-type': 'application/json; charset=utf-8', ...cors(req) },
      JSON.stringify({
        ok: true,
        service: 'lucius-tencent-scf-proxy',
        proxyVersion: PROXY_VERSION,
        usage: {
          apiBaseUrl: '(你的函数公网地址)/api/v2',
          sendUrl: '(你的函数公网地址)/bot/message',
        },
      }),
    )
  } catch (e) {
    send(
      res,
      500,
      { 'content-type': 'application/json; charset=utf-8', ...cors(req) },
      JSON.stringify({ ok: false, error: String(e.message || e) }),
    )
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('lucius-tencent-scf-proxy v' + PROXY_VERSION + ' on ' + PORT)
})
