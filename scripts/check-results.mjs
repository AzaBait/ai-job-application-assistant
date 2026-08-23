// Node harness for Story 1.5: bundles client/src/lib/formState and the
// StageTracker/DocumentCard components via Vite (SSR) and checks stage
// progression, preview truncation, and SSR render states against the spec's
// I/O matrix — no browser, no network.
// Run: node scripts/check-results.mjs (after npm run build).
import assert from 'node:assert'
import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL as pathToFileUrl } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const OUT_DIR = join(ROOT, 'node_modules/.cache/results-check')

try {
  const { build } = await import('vite')
  await build({
    root: join(ROOT, 'client'),
    logLevel: 'error',
    build: {
      ssr: true,
      outDir: OUT_DIR,
      emptyOutDir: true,
      rollupOptions: {
        input: [
          join(ROOT, 'client/src/lib/formState.ts'),
          join(ROOT, 'client/src/components/StageTracker.tsx'),
          join(ROOT, 'client/src/components/DocumentCard.tsx'),
        ],
        output: { entryFileNames: '[name].mjs' },
      },
    },
  })

  const { stageProgress, documentPreview, documentExpandable, PREVIEW_LINES } = await import(
    pathToFileUrl(join(OUT_DIR, 'formState.mjs'))
  )
  const StageTracker = (await import(pathToFileUrl(join(OUT_DIR, 'StageTracker.mjs')))).default
  const DocumentCard = (await import(pathToFileUrl(join(OUT_DIR, 'DocumentCard.mjs')))).default
  const { createElement: h } = await import('react')
  const { renderToString } = await import('react-dom/server')

  // GENERATING: stages 1-2 complete sequentially at fixed intervals; stage 3
  // stays active until the request resolves
  {
    let p = stageProgress('generating', 0)
    assert.deepEqual(p, { done: 0, active: 0 }, 'GENERATING: at t=0 stage 1 active')
    p = stageProgress('generating', 599)
    assert.deepEqual(p, { done: 0, active: 0 }, 'GENERATING: just under 600ms stage 1 still active')
    p = stageProgress('generating', 600)
    assert.deepEqual(p, { done: 1, active: 1 }, 'GENERATING: at 600ms stage 1 done, stage 2 active')
    p = stageProgress('generating', 1199)
    assert.deepEqual(p, { done: 1, active: 1 }, 'GENERATING: just under 1200ms stage 2 still active')
    p = stageProgress('generating', 1200)
    assert.deepEqual(p, { done: 2, active: 2 }, 'GENERATING: from 1200ms stage 3 active')
    p = stageProgress('generating', 600_000)
    assert.deepEqual(p, { done: 2, active: 2 }, 'GENERATING: long request keeps stage 3 active')
    console.log('GENERATING: стадии 1→2→3 проходят последовательно, стадия 3 держится до ответа')
  }

  // SUCCESS: all three stages done regardless of elapsed, nothing active
  {
    for (const t of [0, 700, 5000]) {
      const p = stageProgress('success', t)
      assert.deepEqual(p, { done: 3, active: null }, `SUCCESS: all done at elapsed=${t}`)
    }
    console.log('SUCCESS: все три стадии ✓ при любом elapsed, активных нет')
  }

  // PREVIEW pure logic: \r\n split, 8-line window, 600-char cap, whitespace remainder
  {
    assert.equal(PREVIEW_LINES, 8, 'PREVIEW: threshold is ~8 lines per spec')

    assert.equal(documentPreview(''), '', "PREVIEW: empty text -> empty preview")
    assert.equal(documentExpandable(''), false, "PREVIEW: empty text not expandable")

    assert.equal(documentPreview('одна строка'), 'одна строка', 'PREVIEW: single line as-is')
    assert.equal(documentExpandable('одна строка'), false)

    assert.equal(documentPreview('a\r\nb\r\nc'), 'a\nb\nc', 'PREVIEW: \\r\\n split normalizes to \\n')
    assert.equal(documentExpandable('a\r\nb\r\nc'), false)

    assert.equal(documentPreview('a\n'), 'a\n', "PREVIEW: trailing \\n kept (invisible under pre-wrap)")
    assert.equal(documentExpandable('a\n'), false, "PREVIEW: trailing newline is whitespace-only remainder")

    const exactly8 = Array.from({ length: 8 }, (_, i) => `строка ${i + 1}`).join('\n')
    assert.equal(documentPreview(exactly8), exactly8, 'PREVIEW: exactly 8 lines kept whole')
    assert.equal(documentExpandable(exactly8), false, 'PREVIEW: exactly 8 lines not expandable')

    const nine = [...Array.from({ length: 8 }, (_, i) => `строка ${i + 1}`), 'девятая']
    assert.equal(
      documentPreview(nine.join('\r\n')),
      nine.slice(0, 8).join('\n'),
      'PREVIEW: first 8 of 9 lines (CRLF input)',
    )
    assert.equal(documentExpandable(nine.join('\n')), true, 'PREVIEW: 9th line makes it expandable')

    // 9th line whitespace-only -> no toggle
    const wsTail = `${exactly8}\n   \n\t`
    assert.equal(documentExpandable(wsTail), false, 'PREVIEW: whitespace-only remainder not expandable')

    // single long paragraph, <= 8 lines but > 600 chars -> expandable, char-capped preview
    const longParagraph = 'а'.repeat(700)
    assert.equal(documentExpandable(longParagraph), true, 'PREVIEW: >600-char single paragraph expandable')
    const capped = documentPreview(longParagraph)
    assert.ok(capped.startsWith('а'.repeat(50)), 'PREVIEW: capped preview starts with text')
    assert.ok([...capped].length <= 601 && capped.endsWith('…'), `PREVIEW: capped to ~600 chars + ellipsis (got ${[...capped].length})`)

    const shortParagraph = 'а'.repeat(600)
    assert.equal(documentExpandable(shortParagraph), false, 'PREVIEW: exactly 600 chars not expandable')

    // >600 chars spread over many lines with real remainder
    const wideDoc = [...Array.from({ length: 12 }, (_, i) => `строка ${i + 1}`)].join('\n')
    assert.equal(documentExpandable(wideDoc), true)
    console.log('PREVIEW: \\r\\n, границы 8/9 строк, хвост-пробелы, кап 600 символов, пустая строка')
  }

  // STAGE TRACKER SSR: li-states across the 0/600/1200ms matrix + a11y shape
  {
    const render = (phase, ms) =>
      renderToString(h(StageTracker, { phase, elapsedMs: ms }))

    let html = render('generating', 0)
    assert.equal((html.match(/stage-pending/g) ?? []).length, 2, 'TRACKER t=0: two pending stages')
    assert.equal((html.match(/stage-active/g) ?? []).length, 1, 'TRACKER t=0: one active stage')
    assert.equal((html.match(/stage-spinner/g) ?? []).length, 1, 'TRACKER t=0: spinner on stage 1')
    assert.ok(html.includes('Анализ резюме…') && !html.includes('✓'), 'TRACKER t=0: stage 1 label duplicated, nothing done')

    html = render('generating', 600)
    assert.equal((html.match(/stage-done/g) ?? []).length, 1, 'TRACKER t=600: stage 1 done')
    assert.ok(html.includes('✓') && html.includes('Анализ вакансии…'), 'TRACKER t=600: stage 2 active with text')

    html = render('generating', 1200)
    assert.equal((html.match(/stage-done/g) ?? []).length, 2, 'TRACKER t=1200: stages 1-2 done')
    assert.equal((html.match(/stage-spinner/g) ?? []).length, 1, 'TRACKER t=1200: spinner on stage 3')
    assert.ok(html.includes('Генерация результата…'))

    html = render('success', 5000)
    assert.equal((html.match(/stage-done/g) ?? []).length, 3, 'TRACKER success: all three done')
    assert.ok(!html.includes('stage-spinner') && !html.includes('aria-current'), 'TRACKER success: no spinner, no aria-current')

    // a11y shape: exactly one aria-live region holding ONLY the active stage text
    const liveCount = (ph, ms) =>
      (render(ph, ms).match(/aria-live="polite"/g) ?? []).length
    assert.equal(liveCount('generating', 0), 1, 'A11Y: exactly one aria-live region')
    assert.ok(render('generating', 0).includes('sr-only'), 'A11Y: live region is visually hidden')
    assert.ok(!render('generating', 0).includes('<ol aria-live'), 'A11Y: list itself is not live')
    assert.ok(
      render('generating', 0).includes('>Анализ резюме…</span></span>') ||
        />Анализ резюме…<\/span>/.test(render('generating', 0)),
      'A11Y: live region announces only the active stage text',
    )
    console.log('TRACKER+A11Y: SSR-состояния 0/600/1200/success корректны; одна sr-only aria-live со стадией')
  }

  // DOCUMENT CARD SSR: collapsed default / toggle presence per preview rules
  {
    const render = (text) => renderToString(h(DocumentCard, { title: 'Тест', text }))
    const short = render(['строка 1', 'строка 2'].join('\n'))
    assert.ok(!short.includes('<button'), 'CARD short: no toggle button for short text')
    assert.ok(short.includes('Тест') && short.includes('строка 1'))

    const crlfDoc = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\r\n')
    const crlfHtml = render(crlfDoc)
    assert.ok(crlfHtml.includes('aria-expanded="false"'), 'CARD crlf: default collapsed state marked')
    assert.ok(crlfHtml.includes('<button'), 'CARD crlf: toggle present for 10 lines')
    assert.ok(crlfHtml.includes('line 1') && !crlfHtml.includes('line 10</p>'), 'CARD crlf: preview shows head, not tail')

    const longPara = render('б'.repeat(700))
    assert.ok(longPara.includes('<button'), 'CARD long paragraph: toggle present (>600 chars)')
    assert.ok(longPara.includes('…'), 'CARD long paragraph: preview truncated with ellipsis')

    const wsTailDoc = `${Array.from({ length: 8 }, (_, i) => `x${i}`).join('\n')}\n  \n`
    assert.ok(!render(wsTailDoc).includes('<button'), 'CARD ws-tail: whitespace-only remainder hides toggle')

    assert.ok(!render('').includes('<button'), 'CARD empty: no toggle on empty document')
    console.log('CARD: схлопнуто по умолчанию; кнопка для 10 строк/длинного абзаца; нет кнопки на пробельном хвосте')
  }

  console.log('results checks passed')
} finally {
  rmSync(OUT_DIR, { recursive: true, force: true })
}
