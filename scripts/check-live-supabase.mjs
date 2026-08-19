const SITE = 'https://susuc-kcb.shipstatic.com'

const html = await (await fetch(SITE + '/')).text()
const m = html.match(/assets\/(index-[^"]+\.js)/)
if (!m) throw new Error('no js bundle')
const res = await fetch(`${SITE}/assets/${m[1]}`)
const code = await res.text()
const url = code.match(/https:\/\/[a-z0-9]+\.supabase\.co/i)?.[0] ?? null
const key =
  code.match(/sb_publishable_[a-zA-Z0-9_]+/)?.[0] ??
  code.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/)?.[0] ??
  null
const around = url ? code.slice(Math.max(0, code.indexOf(url) - 40), code.indexOf(url) + 120) : ''
console.log(JSON.stringify({ js: m[1], url, hasKey: Boolean(key), keyLen: key?.length ?? 0, around }, null, 2))
