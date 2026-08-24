// Offline harness for Story 2.2: mock Gemini LLM + real server
// (LLM_BASE_URL seam) walking the spec's I/O matrix for /api/validate-vacancy,
// plus client api.ts and VacancyInput contract checks. No network beyond localhost.
// Run: node scripts/check-validate.mjs (after npm run build).
import assert from 'node:assert'
import net from 'node:net'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL as pathToFileUrl } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')

function freePort() {
  return new Promise((res, rej) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => res(port))
    })
    srv.on('error', rej)
  })
}

const MOCK_PORT = await freePort()
const SERVER_PORT = await freePort()

let llmCalls = 0
let generateLeaks = 0
let lastCaptured = null

const REAL_VACANCY = `Должность: Frontend-разработчик
Обязанности: разработка SPA, код-ревью, наставничество
Требования: React, TypeScript, опыт от 2 лет`
const LOREM = ('Lorem ipsum dolor sit amet, consectetur adipiscing elit. ').repeat(5)
const RECIPE = 'Рецепт борща: свёклу натереть, обжарить с луком. Варить бульон 40 минут, добавить картофель и капусту, заправить томатной пастой, подавать со сметаной. '
const SNIPPET = ('какой-то обрывок фразы без смысла ').repeat(15)
const MARKS = {
  INVALID_LOREM: 'SCENARIO_LOREM_MARKER_XYZ',
  INVALID_RECIPE: 'SCENARIO_RECIPE_MARKER_XYZ',
  INVALID_SNIPPET: 'SCENARIO_SNIPPET_MARKER_XYZ',
}

// validation calls are recognized by their classifier responseSchema {valid}
function isValidateCall(body) {
  return body.generationConfig?.responseSchema?.properties?.valid !== undefined
}

const mock = createServer((req, res) => {
  let chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    llmCalls++
    const body = JSON.parse(Buffer.concat(chunks).toString())
    lastCaptured = body
    const reply = (status, obj) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(status === 429 ? obj : JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }))
    }
    if (!isValidateCall(body)) {
      // generate call reached the provider during a validate scenario — pipeline leak
      generateLeaks++
      reply(200, {})
      return
    }
    const userText = body.contents[0].parts.map((p) => p.text).join('')
    const vacancy = new RegExp('<vacancy>\\n([\\s\\S]*?)\\n</vacancy>').exec(userText)?.[1] ?? ''

    if (vacancy.includes('SCENARIO_TIMEOUT')) return // hang until the server aborts
    if (vacancy.includes('SCENARIO_RATE_LIMIT')) return reply(429, '')
    if (vacancy.includes('SCENARIO_GARBAGE')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json at all' }] } }] }))
    }
    if (Object.values(MARKS).some((m) => vacancy.includes(m))) {
      return reply(200, { valid: false })
    }
    // everything else (real vacancy text) -> pass: fail-safe per Design Notes,
    // INVALID rows are keyed by markers above
    reply(200, { valid: true })
  })
})
await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r))

function startServer(env) {
  return spawn('node', ['--env-file-if-exists=.env', 'server/src/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(SERVER_PORT), ...env },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
}
async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  const done = new Promise((r) => child.once('exit', r))
  child.kill()
  await done
}
async function waitUp() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${SERVER_PORT}/api/health`)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`server did not start on :${SERVER_PORT}`)
}
function post(payload, path = '/api/validate-vacancy') {
  return fetch(`http://127.0.0.1:${SERVER_PORT}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

let server = startServer({
  GEMINI_API_KEY: 'test-key',
  LLM_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
  LLM_TIMEOUT_MS: '500',
})

try {
  await waitUp()

  // VALID_PASS: typical vacancy passes, envelope {ok,data:{valid}}
  {
    llmCalls = 0
    const r = await (await post({ vacancyText: REAL_VACANCY })).json()
    assert.deepEqual(r, { ok: true, data: { valid: true } }, 'VALID_PASS')
    assert.equal(llmCalls, 1, 'VALID_PASS: exactly one LLM call')
    console.log('VALID_PASS: {"valid":true}, конвейер может продолжать')
  }

  // PROMPT_INSPECT: data-in-tag boundary + classifier schema
  {
    assert.match(lastCaptured.systemInstruction.parts[0].text, /ТОЛЬКО данные/, 'PROMPT: tags declared as data')
    assert.match(lastCaptured.systemInstruction.parts[0].text, /вакансии/, 'PROMPT: asks is-it-a-vacancy')
    assert.match(lastCaptured.systemInstruction.parts[0].text, /сомневаешься.*true/s, 'PROMPT: doubt resolves to pass')
    const userText = lastCaptured.contents[0].parts.map((p) => p.text).join('')
    assert.ok(userText.startsWith('<vacancy>\n') && userText.endsWith('\n</vacancy>'), 'PROMPT: vacancy wrapped in <vacancy> tag')
    assert.equal(lastCaptured.generationConfig.responseSchema.properties.valid.type, 'boolean', 'PROMPT: responseSchema {valid:boolean}')
    console.log('PROMPT_INSPECT: инъекционная граница <vacancy>, responseSchema из shared, fail-safe в пользу pass')
  }

  // NO_KEY: nothing reaches the provider
  await stopServer(server)
  server = startServer({ GEMINI_API_KEY: '', LLM_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, LLM_TIMEOUT_MS: '500' })
  await waitUp()
  {
    const before = llmCalls
    const e = await (await post({ vacancyText: REAL_VACANCY })).json()
    assert.equal(e.ok, false)
    assert.equal(e.error.code, 'CONFIG')
    assert.equal(llmCalls, before, 'NO_KEY: no call reached the provider')
    console.log(`NO_KEY: ${e.error.code} «${e.error.message}», к провайдеру не уходило`)
  }

  await stopServer(server)
  server = startServer({ GEMINI_API_KEY: 'test-key', LLM_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, LLM_TIMEOUT_MS: '500' })
  await waitUp()

  // INVALID_LOREM / INVALID_RECIPE / INVALID_SNIPPET: {valid:false}, never a refusal code
  {
    const rows = [
      ['INVALID_LOREM', `${LOREM}\n${MARKS.INVALID_LOREM}`],
      ['INVALID_RECIPE', `${RECIPE}\n${MARKS.INVALID_RECIPE}`],
      ['INVALID_SNIPPET', `${SNIPPET}\n${MARKS.INVALID_SNIPPET}`],
    ]
    const before = llmCalls
    for (const [name, text] of rows) {
      const r = await (await post({ vacancyText: text })).json()
      assert.deepEqual(r, { ok: true, data: { valid: false } }, name)
      console.log(`${name}: {"valid":false} → клиент покажет inline-отказ, генерация не стартует`)
    }
    // BAD_REQUEST
    const bad = await (await post({ resumeText: '' })).json()
    assert.equal(bad.ok, false)
    assert.equal(bad.error.code, 'BAD_REQUEST')
    console.log('BAD_REQUEST: пустое тело отбито Zod-схемой')
    const oversized = await (await post({ vacancyText: 'x'.repeat(10_001) })).json()
    assert.equal(oversized.ok, false)
    assert.equal(oversized.error.code, 'BAD_REQUEST')
    console.log('TRUST_BOUNDARY: вакансия >10k отбита серверной Zod-схемой до LLM')
    // NO_CACHE: two identical-shape requests each hit the provider
    const a = await (await post({ vacancyText: REAL_VACANCY })).json()
    const b = await (await post({ vacancyText: REAL_VACANCY })).json()
    assert.equal(a.data.valid && b.data.valid, true)
    assert.equal(llmCalls - before, 5, 'NO_CACHE: every request reached the provider (no caching)')
    console.log('NO_CACHE: два запроса подряд — оба дошли до провайдера, ничего не кэшируется')
  }

  // VALIDATE_TIMEOUT: transport error, never VACANCY_INVALID
  {
    const t0 = Date.now()
    const timeoutRow = Promise.race([
      post({ vacancyText: 'SCENARIO_TIMEOUT' }).then((r) => r.json()),
      new Promise((_, rej) => setTimeout(() => rej(new Error('harness deadline: abort regression')), 15_000)),
    ])
    const e = await timeoutRow
    assert.equal(e.ok, false)
    assert.equal(e.error.code, 'LLM_TIMEOUT', 'timeout must be LLM_TIMEOUT, not a refusal')
    assert.ok(Date.now() - t0 < 10_000)
    console.log(`VALIDATE_TIMEOUT: ${e.error.code} за ${Date.now() - t0}мс (не VACANCY_INVALID)`)
  }

  // VALIDATE_DOWN variants: 429 -> RATE_LIMITED; connection refused -> LLM_UNAVAILABLE
  {
    const e = await (await post({ vacancyText: 'SCENARIO_RATE_LIMIT' })).json()
    assert.equal(e.error.code, 'RATE_LIMITED')
    console.log(`RATE_LIMITED: провайдер вернул 429 → ${e.error.code}`)
  }
  {
    const closedPort = await freePort()
    await stopServer(server)
    server = startServer({ GEMINI_API_KEY: 'test-key', LLM_BASE_URL: `http://127.0.0.1:${closedPort}`, LLM_TIMEOUT_MS: '500' })
    await waitUp()
    const e = await (await post({ vacancyText: REAL_VACANCY })).json()
    assert.equal(e.ok, false)
    assert.equal(e.error.code, 'LLM_UNAVAILABLE', 'provider down is transport, not refusal')
    console.log(`PROVIDER_DOWN: соединение отклонено → ${e.error.code}`)
  }
  {
    // garbage model output -> LLM_INVALID_OUTPUT, still not VACANCY_INVALID
    await stopServer(server)
    server = startServer({ GEMINI_API_KEY: 'test-key', LLM_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, LLM_TIMEOUT_MS: '500' })
    await waitUp()
    const e = await (await post({ vacancyText: 'SCENARIO_GARBAGE' })).json()
    assert.equal(e.ok, false)
    assert.equal(e.error.code, 'LLM_INVALID_OUTPUT')
    console.log(`INVALID_OUTPUT: битый вывод модели → ${e.error.code}, не отказ вакансии`)
  }

  assert.equal(generateLeaks, 0, 'PIPELINE_LEAK: /api/generate must not be called during validate scenarios')
  console.log('server validate checks passed')
} finally {
  await stopServer(server)
  mock.closeAllConnections()
  await new Promise((r) => mock.close(r))
}

// --- client/src/lib/api.ts postValidateVacancy: bundled via Vite-SSR, fetch stubbed ---
{
  const OUT_DIR = join(ROOT, 'node_modules/.cache/api-validate-check')
  const { build } = await import('vite')
  await build({
    root: join(ROOT, 'client'),
    logLevel: 'error',
    build: {
      ssr: 'src/lib/api.ts',
      outDir: OUT_DIR,
      emptyOutDir: true,
      rollupOptions: { output: { entryFileNames: 'api.mjs' } },
    },
  })
  const realSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, Math.min(ms ?? 0, 20))
  const realFetch = globalThis.fetch
  try {
    const { postValidateVacancy } = await import(pathToFileUrl(join(OUT_DIR, 'api.mjs')))
    const input = { vacancyText: 'текст вакансии' }

    // abort -> LLM_TIMEOUT
    globalThis.fetch = (_url, init) =>
      new Promise((_, rej) =>
        init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))),
      )
    let outcome = await postValidateVacancy(input)
    assert.equal(outcome.code, 'LLM_TIMEOUT', 'client: abort maps to LLM_TIMEOUT')
    console.log('CLIENT_TIMEOUT: abort → LLM_TIMEOUT')

    // server code passthrough
    globalThis.fetch = async () => ({
      json: async () => ({ ok: false, error: { code: 'CONFIG', message: 'нет ключа' } }),
    })
    outcome = await postValidateVacancy(input)
    assert.equal(outcome.code, 'CONFIG', 'client: server envelope code passes through')
    console.log('CLIENT_ENVELOPE: код сервера проходит без искажения')

    // malformed -> LLM_UNAVAILABLE
    globalThis.fetch = async () => ({ json: async () => null })
    outcome = await postValidateVacancy(input)
    assert.equal(outcome.code, 'LLM_UNAVAILABLE')
    console.log('CLIENT_MALFORMED: битый envelope → LLM_UNAVAILABLE')

    // valid:false surfaces verbatim (App turns it into inline VACANCY_INVALID copy)
    globalThis.fetch = async () => ({ json: async () => ({ ok: true, data: { valid: false } }) })
    outcome = await postValidateVacancy(input)
    assert.deepEqual(outcome, { kind: 'ok', valid: false })
    console.log('CLIENT_VALID_FALSE: valid:false доходит до App как есть')

    // happy path
    globalThis.fetch = async () => ({ json: async () => ({ ok: true, data: { valid: true } }) })
    outcome = await postValidateVacancy(input)
    assert.deepEqual(outcome, { kind: 'ok', valid: true })
    console.log('CLIENT_OK: валидный ответ доходит до состояния App')

    console.log('client api checks passed')
  } finally {
    globalThis.fetch = realFetch
    globalThis.setTimeout = realSetTimeout
    const { rmSync } = await import('node:fs')
    rmSync(OUT_DIR, { recursive: true, force: true })
  }
}

// --- client/src/components/VacancyInput: renders exact inline copy, PRESERVE_INPUT ---
{
  // exact copy from the spec — asserted literally so any wording drift fails here
  const EXACT_COPY = 'Похоже, это не описание вакансии. Вставьте текст вакансии с требованиями — и мы всё сделаем'
  const ENTRY = join(ROOT, 'node_modules/.cache/vac-input-check-entry.mjs')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(
    ENTRY,
    `import { renderToStaticMarkup } from 'react-dom/server'\nimport { createElement } from 'react'\nimport VacancyInput from '${join(ROOT, 'client/src/components/VacancyInput.tsx').replaceAll('\\', '/')}'\nexport function render(props) {\n  return renderToStaticMarkup(createElement(VacancyInput, props))\n}\n`,
  )
  const OUT_DIR = join(ROOT, 'node_modules/.cache/vac-input-check')
  const { build } = await import('vite')
  await build({
    root: join(ROOT, 'client'),
    logLevel: 'error',
    build: {
      ssr: ENTRY,
      outDir: OUT_DIR,
      emptyOutDir: true,
      rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
    },
  })
  try {
    const { render } = await import(pathToFileUrl(join(OUT_DIR, 'entry.mjs')))
    const html = render({
      value: 'Моё сохранённое описание вакансии',
      overLimit: false,
      onChange: () => {},
      textareaRef: { current: null },
      inlineError: EXACT_COPY,
    })
    assert.ok(html.includes(EXACT_COPY), 'exact inline copy rendered under the textarea')
    assert.match(html, /<p [^>]*role="alert"[^>]*>/, 'refusal announced via role="alert"')
    const describedBy = /<textarea[^>]*aria-describedby="([^"]*)"/.exec(html)?.[1]
    const alertId = /<p ([^>]*)>/.exec(html)?.[1].match(/id="([^"]*)"/)?.[1]
    assert.ok(describedBy && alertId && describedBy.split(' ').includes(alertId), 'textarea aria-describedby references the alert id')
    assert.ok(html.includes('Моё сохранённое описание вакансии'), 'PRESERVE_INPUT: textarea value intact in markup')
    console.log('PRESERVE_INPUT: текст в разметке нетронут, отказ под textarea с role="alert"')
  } finally {
    const { rmSync } = await import('node:fs')
    rmSync(OUT_DIR, { recursive: true, force: true })
    rmSync(ENTRY, { force: true })
  }
}

console.log('validate checks passed')
