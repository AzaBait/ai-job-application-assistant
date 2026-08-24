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
          join(ROOT, 'client/src/components/GenerateButton.tsx'),
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
  const GenerateButton = (await import(pathToFileUrl(join(OUT_DIR, 'GenerateButton.mjs')))).default
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

  // ERROR_SHOWN: error phase freezes progression at the failure point — done
  // as-is, nothing active, tracker shows ✕ on the failed stage, no spinner
  {
    let p = stageProgress('error', 0)
    assert.deepEqual(p, { done: 0, active: null }, 'ERROR_SHOWN: t=0 failure, stage 1 frozen')
    p = stageProgress('error', 700)
    assert.deepEqual(p, { done: 1, active: null }, 'ERROR_SHOWN: mid-run failure frozen after stage 1')
    p = stageProgress('error', 600_000)
    assert.deepEqual(p, { done: 2, active: null }, 'ERROR_SHOWN: late failure frozen on stage 3')

    const render = (ms) => renderToString(h(StageTracker, { phase: 'error', elapsedMs: ms }))

    let html = render(700)
    assert.equal((html.match(/stage-error/g) ?? []).length, 1, 'ERROR_SHOWN: exactly one failed stage')
    assert.ok(html.includes('✕'), 'ERROR_SHOWN: ✕ marker on the failed stage')
    assert.equal((html.match(/✓/g) ?? []).length, 1, 'ERROR_SHOWN: completed stages keep ✓')
    assert.ok(!html.includes('stage-spinner'), 'ERROR_SHOWN: no spinner in error phase')

    html = render(100)
    assert.equal((html.match(/✓/g) ?? []).length, 0, 'ERROR_SHOWN: early failure leaves nothing done')
    assert.equal((html.match(/stage-error/g) ?? []).length, 1)

    html = render(700)
    assert.ok(html.includes('Произошла ошибка'), 'A11Y: sr-only live region announces the error')
    assert.equal((html.match(/aria-live="polite"/g) ?? []).length, 1, 'A11Y: still one live region')
    assert.ok(!html.includes('aria-current'), 'ERROR_SHOWN: no aria-current without an active stage')
    console.log('ERROR_SHOWN: трекер заморожен в точке сбоя — ✕ на активной стадии, ✓ сохранены, без спиннера')
  }

  // RETRY_CLICK / REPEATED_FAILURE + GenerateButton SSR: «Повторить» next to the
  // message, single block, hidden while generating; fresh run starts clean
  {
    const { GENERATE_FALLBACK_ERROR } = await import(pathToFileUrl(join(OUT_DIR, 'formState.mjs')))
    const base = { issue: null, generating: false, onClick: () => {} }
    const renderBtn = (props) => renderToString(h(GenerateButton, props))

    let html = renderBtn({ ...base, error: GENERATE_FALLBACK_ERROR })
    assert.ok(
      html.includes(GENERATE_FALLBACK_ERROR),
      'RETRY_CLICK: exact default copy shown',
    )
    assert.ok(html.includes('Повторить'), 'RETRY_CLICK: «Повторить» button next to the message')
    assert.equal((html.match(/role="alert"/g) ?? []).length, 1, 'REPEATED_FAILURE: single alert block')
    assert.equal((html.match(/Повторить/g) ?? []).length, 1, 'REPEATED_FAILURE: single retry button')

    html = renderBtn({ ...base, generating: true, error: GENERATE_FALLBACK_ERROR })
    assert.ok(!html.includes('Повторить'), 'no retry button while a run is active')

    html = renderBtn(base)
    assert.ok(!html.includes('Повторить') && !html.includes('role="alert"'), 'nothing shown without an error')

    // fresh run after retry: clean generating state, no error residue
    assert.deepEqual(stageProgress('generating', 0), { done: 0, active: 0 }, 'RETRY_CLICK: new run restarts from stage 1')
    const fresh = renderToString(h(StageTracker, { phase: 'generating', elapsedMs: 0 }))
    assert.ok(
      !fresh.includes('✕') && !fresh.includes('stage-error') && !fresh.includes('Произошла ошибка'),
      'RETRY_CLICK: previous error state fully gone from the tracker',
    )
    console.log('RETRY_CLICK/REPEATED_FAILURE: сообщение+«Повторить» одним блоком; новый прогон стартует чисто')
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
    assert.ok(!short.includes('document-card-toggle'), 'CARD short: no preview-toggle for short text')
    assert.ok(short.includes('Тест') && short.includes('строка 1'))

    const crlfDoc = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\r\n')
    const crlfHtml = render(crlfDoc)
    assert.ok(crlfHtml.includes('aria-expanded="false"'), 'CARD crlf: default collapsed state marked')
    assert.ok(crlfHtml.includes('document-card-toggle'), 'CARD crlf: preview-toggle present for 10 lines')
    assert.ok(crlfHtml.includes('line 1') && !crlfHtml.includes('line 10</p>'), 'CARD crlf: preview shows head, not tail')

    const longPara = render('б'.repeat(700))
    assert.ok(longPara.includes('document-card-toggle'), 'CARD long paragraph: preview-toggle present (>600 chars)')
    assert.ok(longPara.includes('…'), 'CARD long paragraph: preview truncated with ellipsis')

    const wsTailDoc = `${Array.from({ length: 8 }, (_, i) => `x${i}`).join('\n')}\n  \n`
    assert.ok(!render(wsTailDoc).includes('document-card-toggle'), 'CARD ws-tail: whitespace-only remainder hides preview-toggle')

    assert.ok(!render('').includes('document-card-toggle'), 'CARD empty: no toggle on empty document')
    console.log('CARD: схлопнуто по умолчанию; кнопка для 10 строк/длинного абзаца; нет кнопки на пробельном хвосте')
  }

  // DOCUMENT CARD Story 1.6: download buttons on every card (Story 1.5 cards)
  {
    const { renderToString } = await import('react-dom/server')
    const html = renderToString(
      h(DocumentCard, { title: 'Тест', text: 'строка', fileBase: 'resume-tailored' }),
    )
    for (const label of ['Скачать PDF', 'Скачать DOCX']) {
      assert.ok(html.includes(label), `CARD 1.6: button «${label}» present`)
    }
    assert.ok(html.includes('btn-secondary-outline'), 'CARD 1.6: secondary outline styling hook')
    console.log('CARD 1.6: обе кнопки скачивания присутствуют на карточке')
  }

  console.log('results checks passed')
} finally {
  rmSync(OUT_DIR, { recursive: true, force: true })
}
