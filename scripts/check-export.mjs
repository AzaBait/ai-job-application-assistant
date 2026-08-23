// Node harness for Story 1.6 exporters: SSR-bundles the markdown-lite parser,
// both exporters and the delivery layer via Vite, then builds DOCX + PDF from
// a Cyrillic fixture with headings/lists/paragraphs. Asserts non-empty blobs,
// embedded Noto Sans (FontFile2) in the PDF, multi-page flow, a pdfjs Cyrillic
// round-trip, font-fetch retry semantics, and the DOM delivery layer behind a
// stub anchor. Fully offline — font comes from client/src/assets/fonts.
// Run: node scripts/check-export.mjs (after npm run build).
import assert from 'node:assert'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { inflateRawSync } from 'node:zlib'
import { join, resolve } from 'node:path'
import { pathToFileURL as pathToFileUrl } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const OUT_DIR = join(ROOT, 'node_modules/.cache/export-check')

const FIXTURE = [
  '# Адаптированное резюме',
  '',
  '## Опыт работы',
  '- Разработчик в компании «Пример», 2020—2026',
  '- Вёл проекты на TypeScript и React',
  '',
  'Второй абзац с кириллицей: ё, Й, ж, длинная строка для проверки переноса ' +
    'слов при узкой колонке текста в документе PDF.',
  '---',
  'Заключительный абзац после разделителя.',
].join('\n')

// extract one stored/deflated entry from a zip Buffer (docx = plain zip)
function zipEntry(zip, name) {
  let off = 0
  while (zip.readUInt32LE(off) === 0x04034b50) {
    const method = zip.readUInt16LE(off + 8)
    const size = zip.readUInt32LE(off + 18)
    const nameLen = zip.readUInt16LE(off + 26)
    const extraLen = zip.readUInt16LE(off + 28)
    const entryName = zip.subarray(off + 30, off + 30 + nameLen).toString()
    const dataStart = off + 30 + nameLen + extraLen
    if (entryName === name) {
      const data = zip.subarray(dataStart, dataStart + size)
      return method === 0 ? data : inflateRawSync(data)
    }
    off = dataStart + size
  }
  throw new Error(`zip entry not found: ${name}`)
}

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
          join(ROOT, 'client/src/lib/exporters/docx.ts'),
          join(ROOT, 'client/src/lib/exporters/pdf.ts'),
          join(ROOT, 'client/src/lib/exporters/index.ts'),
        ],
        output: { entryFileNames: '[name].mjs' },
      },
    },
    resolve: {
      // Node lacks DOMMatrix etc.; the legacy build is pdfjs's own guidance there.
      alias: [{ find: /^pdfjs-dist$/, replacement: 'pdfjs-dist/legacy/build/pdf.mjs' }],
    },
  })

  const formStateUrl = pathToFileUrl(join(OUT_DIR, 'formState.mjs'))
  const pdfModuleUrl = pathToFileUrl(join(OUT_DIR, 'pdf.mjs'))
  const indexModuleUrl = pathToFileUrl(join(OUT_DIR, 'index.mjs'))
  const { parseDocumentStructure } = await import(formStateUrl)
  const { buildDocx } = await import(pathToFileUrl(join(OUT_DIR, 'docx.mjs')))
  const { buildPdf, loadNotoSans, PdfExportError } = await import(pdfModuleUrl)

  // PARSER: markdown-lite -> structure (single source for docx/pdf)
  {
    const blocks = parseDocumentStructure(FIXTURE)
    assert.deepEqual(
      blocks.map((b) => b.type),
      ['h1', 'h2', 'li', 'li', 'p', 'hr', 'p'],
      `PARSER: unexpected structure: ${JSON.stringify(blocks.map((b) => b.type))}`,
    )
    assert.equal(blocks[0].text, 'Адаптированное резюме', 'PARSER: heading marker stripped')
    assert.equal(blocks[3].text, 'Вёл проекты на TypeScript и React', 'PARSER: list marker stripped')
    assert.equal(parseDocumentStructure('обычная строка')[0].type, 'p', 'PARSER: unknown line = paragraph')
    assert.deepEqual(parseDocumentStructure(''), [], 'PARSER: empty input -> no blocks')

    // wrapped soft lines merge into ONE paragraph; blank line starts a new one
    const merged = parseDocumentStructure(
      ['Первая мягкая строка абзаца,', 'продолжение на следующей строке.', '', 'Новый абзац'].join('\n'),
    )
    assert.deepEqual(
      merged.map((b) => b.type),
      ['p', 'p'],
      `PARSER: wrapped lines must be ONE p-block: ${JSON.stringify(merged)}`,
    )
    assert.equal(
      merged[0].text,
      'Первая мягкая строка абзаца,\nпродолжение на следующей строке.',
      'PARSER: merged paragraph keeps both soft lines',
    )
    console.log('PARSER: #/##/- /---/абзац; мягкие строки сливаются в один p-блок')
  }

  // DOWNLOAD_DOCX: valid zip with preserved structure
  {
    const blob = await buildDocx(parseDocumentStructure(FIXTURE))
    const bytes = Buffer.from(await blob.arrayBuffer())
    assert.ok(bytes.length > 0, 'DOCX: non-empty blob')
    assert.deepEqual([...bytes.subarray(0, 2)], [0x50, 0x4b], 'DOCX: zip magic (PK)')
    const xml = zipEntry(bytes, 'word/document.xml').toString()
    assert.ok(xml.includes('Опыт работы'), 'DOCX: heading text present')
    assert.ok(xml.includes('<w:numPr>'), 'DOCX: list numbering present')
    console.log(`DOCX: blob ${bytes.length} bytes, заголовки и списки внутри document.xml`)
  }

  // DOWNLOAD_PDF: embedded Noto Sans, Cyrillic readable
  {
    const fontBytes = readFileSync(join(ROOT, 'client/src/assets/fonts/NotoSans-Regular.ttf'))
    const bytes = Buffer.from(await buildPdf(parseDocumentStructure(FIXTURE), fontBytes))
    assert.ok(bytes.length > 0, 'PDF: non-empty output')
    assert.ok(bytes.subarray(0, 5).toString() === '%PDF-', 'PDF: magic header')
    assert.ok(bytes.includes('FontFile2'), 'PDF: embeds a TrueType font program (FontFile2)')
    assert.ok(bytes.includes('NotoSans'), 'PDF: embedded font is NotoSans')

    // ROUND-TRIP: extract text back out with pdfjs — proves the embedded
    // subset's ToUnicode CMap maps glyphs back to the original Cyrillic
    const require = createRequire(join(ROOT, 'package.json'))
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise
    let text = ''
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await doc.getPage(i).then((p) => p.getTextContent())
      text += content.items.map((it) => it.str).join(' ')
    }
    for (const needle of ['Адаптированное резюме', 'ё, Й, ж', 'Заключительный абзац']) {
      assert.ok(text.includes(needle), `ROUND-TRIP: extracted PDF text must contain ${JSON.stringify(needle)}; got ${JSON.stringify(text)}`)
    }
    console.log(`PDF: blob ${bytes.length} bytes, встроен NotoSans (FontFile2); round-trip через pdfjs вернул кириллицу («${'Адаптированное резюме'}», «ё, Й, ж»)`)
  }

  // LONG_TEXT: page breaks — count real page objects, not any /Count
  {
    // blank line between paragraphs keeps them as separate blocks —
    // consecutive soft lines would legitimately merge into fewer pages
    const long = Array.from({ length: 80 }, (_, i) => `Строка ${i + 1}: пример длинного документа`).join('\n\n')
    const fontBytes = readFileSync(join(ROOT, 'client/src/assets/fonts/NotoSans-Regular.ttf'))
    const bytes = Buffer.from(await buildPdf(parseDocumentStructure(long), fontBytes))
    const pageCount = (bytes.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length
    assert.ok(pageCount >= 2, `LONG_TEXT: expected >=2 page objects, got ${pageCount}`)
    console.log(`LONG_TEXT: документ разбит на ${pageCount} страницы (/Type /Page объектов)`)
  }

  // BUILD_ERROR fallback path: no font + Cyrillic -> clear inline error;
  // Latin list items survive the bullet-prefix glyph check (U+2022 = WinAnsi 0x95)
  {
    await assert.rejects(
      () => buildPdf(parseDocumentStructure(FIXTURE), null),
      (e) => e instanceof PdfExportError && e.message.includes('DOCX'),
      'BUILD_ERROR: Cyrillic without embedded font must fail with DOCX advice',
    )
    const latin = await buildPdf(
      [{ type: 'h1', text: 'Plain Latin' }, { type: 'li', text: 'a list item' }],
      null,
    )
    assert.ok(latin.length > 0, 'BUILD_ERROR: Latin (incl. bulleted list) exports with standard font')
    console.log('BUILD_ERROR: без шрифта кириллица даёт понятную ошибку (советуем DOCX); латиница и списки экспортируются')
  }

  // FONT RETRY: loadNotoSans against the committed asset through its own
  // fetch path — transient failure yields null but stays retryable
  {
    const committedAsset = readFileSync(join(ROOT, 'client/src/assets/fonts/NotoSans-Regular.ttf'))
    const realFetch = globalThis.fetch

    globalThis.fetch = async () => {
      throw new Error('simulated offline')
    }
    assert.equal(await loadNotoSans(), null, 'FONT RETRY: fetch failure resolves null')

    // recovery: serve the committed asset for whatever URL the bundle holds
    globalThis.fetch = async () => new Response(committedAsset)
    const first = await loadNotoSans()
    assert.ok(first instanceof ArrayBuffer, 'FONT RETRY: retry after failure returns ArrayBuffer')
    assert.equal(first.byteLength, committedAsset.length, 'FONT RETRY: bytes are the committed asset')
    const second = await loadNotoSans()
    assert.equal(second, first, 'FONT RETRY: successful fetch is cached')
    globalThis.fetch = realFetch
    console.log(`FONT RETRY: сбой → null → повтор загружает ассет ${first.byteLength} байт и кэшируется`)
  }

  // DELIVERY LAYER: downloadDocument behind a minimal DOM shim
  {
    const anchors = []
    const createdUrls = []
    const revokedUrls = []
    class StubAnchor {
      href = ''
      download = ''
      click() {
        anchors.push(this)
      }
    }
    globalThis.document = { createElement: () => new StubAnchor() }
    URL.createObjectURL = (blob) => {
      createdUrls.push(blob)
      return `blob:stub-${createdUrls.length}`
    }
    URL.revokeObjectURL = (url) => revokedUrls.push(url)

    const { downloadDocument } = await import(indexModuleUrl)

    await downloadDocument('pdf', 'resume-tailored', FIXTURE)
    let anchor = anchors.at(-1)
    let blob = createdUrls.at(-1)
    assert.equal(anchor.download, 'resume-tailored.pdf', 'DELIVERY: kind=pdf -> .pdf extension')
    assert.equal(blob.type, 'application/pdf', 'DELIVERY: pdf blob MIME')
    assert.ok(blob.size > 0, 'DELIVERY: pdf blob non-empty')
    assert.ok(!revokedUrls.includes(anchor.href), 'DELIVERY: revoke delayed (not synchronous with click)')

    await downloadDocument('docx', 'cover-letter', FIXTURE)
    anchor = anchors.at(-1)
    blob = createdUrls.at(-1)
    assert.equal(anchor.download, 'cover-letter.docx', 'DELIVERY: kind=docx -> .docx extension')
    assert.equal(
      blob.type,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'DELIVERY: docx blob MIME',
    )

    await assert.rejects(
      () => downloadDocument('pdf', 'empty-doc', ''),
      /Документ пуст/,
      'EMPTY_DOC: zero blocks -> friendly inline error',
    )

    // shim cleanup so later suites in the same process are unaffected
    delete globalThis.document
    console.log('DELIVERY: имя файла по kind, MIME обоих форматов, отложенный revoke, «Документ пуст»')
  }

  console.log('export checks passed')
} finally {
  rmSync(OUT_DIR, { recursive: true, force: true })
}
