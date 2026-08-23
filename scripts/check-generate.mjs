// Offline harness for Story 1.4: spawns a mock Gemini LLM + the real server
// (LLM_BASE_URL pointed at the mock) and walks all rows of the spec's I/O
// matrix plus review findings, without touching the network beyond localhost.
// Run: node scripts/check-generate.mjs
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
let scenarioInvalidCalls = 0 // reset per scenario: no cross-scenario parity coupling
let lastCaptured = null // every outgoing Gemini request body lands here

function partsText(body) {
  return body.contents[0].parts.map((p) => p.text).join('\n')
}
function field(userText, tag) {
  return new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(userText)?.[1] ?? ''
}

const mock = createServer((req, res) => {
  let chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    llmCalls++
    lastCaptured = null
    const body = JSON.parse(Buffer.concat(chunks).toString())
    lastCaptured = body
    const userText = partsText(body)
    const vacancy = field(userText, 'vacancy')
    const reply = (status, text) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(
        status === 429 ? text : JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
      )
    }

    if (vacancy.includes('SCENARIO_TIMEOUT')) return // hang until the server aborts
    if (vacancy.includes('SCENARIO_RATE_LIMIT')) return reply(429, '{"error":{"message":"quota"}}')

    if (vacancy.includes('SCENARIO_SCHEMA_REJECTED')) {
      res.writeHead(400, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: { message: 'Unsupported field in responseSchema: minLength' } }))
    }

    if (vacancy.includes('SCENARIO_INVALID')) {
      scenarioInvalidCalls++
      if (scenarioInvalidCalls === 2) {
        // repair-retry succeeds => proves exactly one retry ran and its output is accepted
        return reply(
          200,
          JSON.stringify({
            adaptedResume: `РЕМОНТ УСПЕШЕН: ${field(userText, 'resume')}`,
            coverLetter: 'ПИСЬМО',
          }),
        )
      }
      return reply(200, 'not json at all')
    }

    // GENERATE_OK: echo the resume so we can prove no cross-request caching
    reply(
      200,
      JSON.stringify({
        adaptedResume: `АДАПТИРОВАННОЕ РЕЗЮМЕ по факту: ${field(userText, 'resume')}`,
        coverLetter: `СОПРОВОДИТЕЛЬНОЕ ПИСЬМО (${userText.split('\n')[0]})`,
      }),
    )
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
function post(payload) {
  return fetch(`http://127.0.0.1:${SERVER_PORT}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
const form = (vacancyText, resumeText = '5 лет React') => ({ resumeText, vacancyText, tone: 'professional' })

let server = startServer({
  GEMINI_API_KEY: 'test-key',
  LLM_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
  LLM_TIMEOUT_MS: '500',
})

try {
  await waitUp()

  // GENERATE_OK + no-caching: two requests with different data answer per their own request
  {
    const a = await (await post(form('Вакансия A', 'резюме ААА'))).json()
    assert.equal(a.ok, true)
    assert.ok(a.data.adaptedResume.includes('резюме ААА'), 'GENERATE_OK: first response matches first request')
    assert.ok(a.data.coverLetter.length > 0 && a.data.adaptedResume.length > 0)
    const b = await (await post(form('Вакансия B', 'резюме БББ'))).json()
    assert.equal(b.ok, true)
    assert.ok(b.data.adaptedResume.includes('резюме БББ'), 'GENERATE_OK: second response matches second request')
    assert.ok(!b.data.adaptedResume.includes('ААА'), 'no-caching: no leakage from first request')
    console.log('GENERATE_OK: ok:true, оба документа непустые, без кэша между запросами')
  }

  // prompt inspection via the last captured outgoing LLM request
  {
    assert.match(lastCaptured.systemInstruction.parts[0].text, /Запрещено выдумывать/, 'PROMPT: system prompt bans fabrication')
    assert.match(lastCaptured.systemInstruction.parts[0].text, /ТОЛЬКО данные/, 'PROMPT: tags declared as data, never instructions')
    const userText = partsText(lastCaptured)
    assert.match(userText, /<resume>\nрезюме БББ\n<\/resume>/, 'PROMPT: resume in user content')
    assert.match(userText, /<vacancy>\nВакансия B\n<\/vacancy>/, 'PROMPT: vacancy in user content')
    assert.match(userText, /^Тональность:/, 'PROMPT: tone in user content')
    const schema = lastCaptured.generationConfig.responseSchema
    assert.equal(schema.properties.adaptedResume.type, 'string', 'PROMPT: responseSchema present')
    assert.ok(!JSON.stringify(schema).includes('minLength'), 'PROMPT: schema pruned to Gemini subset')
    console.log('PROMPT_INSPECT: промпт запрещает фабрикацию+инъекции; контент = тон+резюме+вакансия; responseSchema из shared')
  }

  // NO_KEY: fresh server without GEMINI_API_KEY — nothing reaches the provider
  await stopServer(server)
  server = startServer({ GEMINI_API_KEY: '', LLM_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, LLM_TIMEOUT_MS: '500' })
  await waitUp()
  {
    const callsBefore = llmCalls
    const e = await (await post(form('Вакансия A'))).json()
    assert.equal(e.ok, false)
    assert.equal(e.error.code, 'CONFIG')
    assert.equal(llmCalls, callsBefore, 'NO_KEY: no call reached the provider')
    console.log(`NO_KEY: ${e.error.code} «${e.error.message}», к провайдеру не уходило`)
  }

  // TIMEOUT: mock hangs, server-side abort fires within the shared deadline
  await stopServer(server)
  server = startServer({ GEMINI_API_KEY: 'test-key', LLM_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, LLM_TIMEOUT_MS: '500' })
  await waitUp()
  {
    const t0 = Date.now()
    const e = await (await post(form('SCENARIO_TIMEOUT'))).json()
    assert.equal(e.ok, false)
    assert.equal(e.error.code, 'LLM_TIMEOUT')
    const took = Date.now() - t0
    assert.ok(took < 10_000, `TIMEOUT: aborted promptly, took ${took}ms`)
    console.log(`TIMEOUT: ${e.error.code} за ${took}мс`)
  }

  // RATE_LIMITED: provider answers 429
  {
    const e = await (await post(form('SCENARIO_RATE_LIMIT'))).json()
    assert.equal(e.ok, false)
    assert.equal(e.error.code, 'RATE_LIMITED')
    console.log(`RATE_LIMITED: провайдер вернул 429, получен ${e.error.code}`)
  }

  // INVALID_OUTPUT: bad output -> exactly one repair-retry -> repaired output accepted
  {
    scenarioInvalidCalls = 0
    const before = llmCalls
    const e = await (await post(form('SCENARIO_INVALID'))).json()
    assert.equal(e.ok, true, 'INVALID_OUTPUT: first attempt bad, repair succeeds')
    assert.match(e.data.adaptedResume, /резюме БББ|5 лет React/)
    assert.equal(llmCalls - before, 2, 'INVALID_OUTPUT: exactly one retry (2 LLM calls total)')
    console.log('INVALID_OUTPUT: ровно один repair-retry, отремонтированный вывод принят')
  }

  // SCHEMA_REJECTED: provider refuses responseSchema -> same single retry -> LLM_INVALID_OUTPUT
  {
    const before = llmCalls
    const e = await (await post(form('SCENARIO_SCHEMA_REJECTED'))).json()
    assert.equal(e.ok, false)
    assert.equal(e.error.code, 'LLM_INVALID_OUTPUT')
    assert.equal(llmCalls - before, 2, 'SCHEMA_REJECTED: exactly one retry (2 LLM calls total)')
    console.log(`SCHEMA_REJECTED: ровно один retry, затем ${e.error.code}`)
  }

  // BAD_REQUEST: malformed body rejected by shared Zod schema
  {
    const e = await (await post({ resumeText: '' })).json()
    assert.equal(e.ok, false)
    assert.equal(e.error.code, 'BAD_REQUEST')
    console.log('BAD_REQUEST: Zod-валидация запроса отбила пустое тело')
  }

  // PROVIDER_DOWN: connection refused -> LLM_UNAVAILABLE without consuming a retry
  {
    const closedPort = await freePort()
    await stopServer(server)
    server = startServer({ GEMINI_API_KEY: 'test-key', LLM_BASE_URL: `http://127.0.0.1:${closedPort}`, LLM_TIMEOUT_MS: '500' })
    await waitUp()
    const before = llmCalls
    const t0 = Date.now()
    const e = await (await post(form('Вакансия A'))).json()
    assert.equal(e.ok, false)
    assert.equal(e.error.code, 'LLM_UNAVAILABLE')
    assert.equal(llmCalls - before, 0)
    assert.ok(Date.now() - t0 < 10_000)
    console.log(`PROVIDER_DOWN: соединение отклонено → ${e.error.code} за ${Date.now() - t0}мс`)
    await stopServer(server)
    server = startServer({ GEMINI_API_KEY: 'test-key', LLM_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, LLM_TIMEOUT_MS: '500' })
    await waitUp()
  }

  console.log('generate checks passed')
} finally {
  await stopServer(server)
  mock.closeAllConnections()
  await new Promise((r) => mock.close(r))
}

// --- client/src/lib/api.ts contract: bundled via Vite-SSR, fetch stubbed ---
{
  const OUT_DIR = join(ROOT, 'node_modules/.cache/api-check')
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
  globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, Math.min(ms ?? 0, 20)) // shrink the 90s deadline
  const realFetch = globalThis.fetch
  try {
    const { postGenerate } = await import(pathToFileUrl(join(OUT_DIR, 'api.mjs')))
    const input = { resumeText: 'р', vacancyText: 'в', tone: 'professional' }

    // abort -> LLM_TIMEOUT
    globalThis.fetch = (_url, init) =>
      new Promise((_, rej) =>
        init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))),
      )
    let outcome = await postGenerate(input)
    assert.equal(outcome.kind, 'error')
    assert.equal(outcome.code, 'LLM_TIMEOUT', 'client: abort maps to LLM_TIMEOUT')
    console.log('CLIENT_TIMEOUT: abort → LLM_TIMEOUT')

    // non-ok envelope passes through its own code
    globalThis.fetch = async () => ({
      json: async () => ({ ok: false, error: { code: 'CONFIG', message: 'нет ключа' } }),
    })
    outcome = await postGenerate(input)
    assert.equal(outcome.code, 'CONFIG', 'client: server envelope code passes through')
    console.log('CLIENT_ENVELOPE: код сервера (CONFIG) проходит без искажения')

    // malformed envelope -> LLM_UNAVAILABLE (no TypeError escape)
    globalThis.fetch = async () => ({ json: async () => null })
    outcome = await postGenerate(input)
    assert.equal(outcome.code, 'LLM_UNAVAILABLE', 'client: malformed envelope -> LLM_UNAVAILABLE')
    console.log('CLIENT_MALFORMED: битый envelope → LLM_UNAVAILABLE')

    // schema-invalid data -> client Zod rejects
    globalThis.fetch = async () => ({ json: async () => ({ ok: true, data: { adaptedResume: '', coverLetter: '' } }) })
    outcome = await postGenerate(input)
    assert.equal(outcome.code, 'LLM_INVALID_OUTPUT', 'client: empty documents rejected by client Zod')
    console.log('CLIENT_INVALID_DATA: пустые документы отвергнуты клиентской Zod-валидацией')

    // happy path
    globalThis.fetch = async () => ({
      json: async () => ({ ok: true, data: { adaptedResume: 'Р', coverLetter: 'П' } }),
    })
    outcome = await postGenerate(input)
    assert.deepEqual(outcome, { kind: 'ok', data: { adaptedResume: 'Р', coverLetter: 'П' } })
    console.log('CLIENT_OK: валидный ответ доходит до состояния App')

    console.log('api checks passed')
  } finally {
    globalThis.fetch = realFetch
    globalThis.setTimeout = realSetTimeout
    const { rmSync } = await import('node:fs')
    rmSync(OUT_DIR, { recursive: true, force: true })
  }
}
