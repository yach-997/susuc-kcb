/**
 * 测云端：账号 + 123456 找回是否通
 * 用法：node scripts/test-cloud-restore.mjs
 */
const SITE = 'https://susuc-kcb.shipstatic.com'

async function main() {
  const ver = await (await fetch(`${SITE}/version.json`)).json()
  const html = await (await fetch(SITE + '/')).text()
  const m = html.match(/assets\/(index-[^"]+\.js)/)
  if (!m) throw new Error('no js')
  const js = await (await fetch(`${SITE}/assets/${m[1]}`)).text()
  const key = js.match(/sb_publishable_[a-zA-Z0-9_]+/)?.[0]
  const url = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0]
  if (!key || !url) throw new Error('no supabase key/url')

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }

  async function rpc(name, body) {
    const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* ignore */
    }
    return { status: res.status, json, text: text.slice(0, 300) }
  }

  const id = '25391020123'
  const r1 = await rpc('restore_student_timetable', {
    p_student_id: id,
    p_password: '123456',
  })
  const r2 = await rpc('restore_student_timetable', {
    p_student_id: id,
    p_password: '000000',
  })

  const ok =
    r1.status === 200 &&
    r1.json?.ok === true &&
    Array.isArray(r1.json?.payload?.courses) &&
    r1.json.payload.courses.length > 0
  const badPwd =
    r2.status === 200 &&
    r2.json?.ok === false &&
    r2.json?.error === 'mismatch'

  console.log(
    JSON.stringify(
      {
        version: ver.version,
        passwordRestore: {
          status: r1.status,
          ok: r1.json?.ok,
          courses: r1.json?.payload?.courses?.length,
          error: r1.json?.error || r1.text,
        },
        wrongPassword: {
          status: r2.status,
          ok: r2.json?.ok,
          error: r2.json?.error || r2.text,
        },
        pass: ok && badPwd,
      },
      null,
      2,
    ),
  )
  process.exit(ok && badPwd ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
