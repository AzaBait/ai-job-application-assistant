import { spawn } from 'node:child_process'

const PORT = 3999
const base = `http://localhost:${PORT}`

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const server = spawn('node', ['--env-file-if-exists=.env', 'server/src/index.ts'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
})

try {
  const deadline = Date.now() + 10_000
  let up = false
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`)
      if (res.ok) {
        up = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  assert(up, `server did not start on :${PORT}`)

  const health = await (await fetch(`${base}/api/health`)).json()
  assert(
    JSON.stringify(health) === '{"ok":true,"data":{"status":"up"}}',
    `unexpected /api/health body: ${JSON.stringify(health)}`,
  )

  const html = await (await fetch(base)).text()
  assert(html.includes('Мы не добавляем факты'), 'trust-line missing from /')

  console.log('smoke test passed')
} finally {
  server.kill()
}
