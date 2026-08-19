async function check(site) {
  const html = await (await fetch(site + '/')).text()
  const m = html.match(/assets\/(index-[^"]+\.js)/)
  if (!m) {
    console.log(site, 'no js')
    return
  }
  const js = await (await fetch(`${site}/assets/${m[1]}`)).text()
  const url = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/i)?.[0]
  const key =
    js.match(/sb_publishable_[a-zA-Z0-9_]+/)?.[0] ??
    js.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/)?.[0]
  console.log(site, { js: m[1], url: url ?? null, hasKey: Boolean(key) })
}

await check('https://susuc-kcb.shipstatic.com')
await check('https://yach-997.github.io/susuc-kcb')
