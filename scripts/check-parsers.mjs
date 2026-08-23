// Node harness for the client-side resume parsers (no browser needed):
// bundles client/src/lib/parsers via Vite (SSR) and runs them against
// generated fixtures. Run: node scripts/check-parsers.mjs (after npm run build).
import assert from 'node:assert'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { crc32 } from 'node:zlib'
import { pathToFileURL as pathToFileUrl } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')

// ---------- fixtures ----------

function makePdf(text) {
  const stream = Buffer.from(`BT /F1 24 Tf 72 720 Td (${text}) Tj ET`)
  const objs = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),
      stream,
      Buffer.from('\nendstream'),
    ]),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ]
  const out = [Buffer.from('%PDF-1.4\n')]
  const offsets = []
  for (let i = 0; i < objs.length; i++) {
    offsets.push(Buffer.concat(out).length)
    out.push(Buffer.from(`${i + 1} 0 obj\n`), objs[i], Buffer.from('\nendobj\n'))
  }
  const xrefPos = Buffer.concat(out).length
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`
  out.push(
    Buffer.from(xref),
    Buffer.from(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`),
  )
  return Buffer.concat(out)
}

function makeZip(entries) {
  const locals = []
  const central = []
  let offset = 0
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 8) // stored, no compression
    local.writeUInt32LE(Number(crc32(data)), 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, data)

    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(0, 10)
    cen.writeUInt32LE(Number(crc32(data)), 16)
    cen.writeUInt32LE(data.length, 20)
    cen.writeUInt32LE(data.length, 24)
    cen.writeUInt16LE(nameBuf.length, 28)
    cen.writeUInt32LE(offset, 42)
    central.push(cen, nameBuf)

    offset += 30 + nameBuf.length + data.length
  }
  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, eocd])
}

const XML = (s) => Buffer.from(s, 'utf8')
function makeDocx(text) {
  return makeZip([
    [
      '[Content_Types].xml',
      XML(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
    ],
    [
      '_rels/.rels',
      XML(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
    ],
    [
      'word/document.xml',
      XML(
        `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
      ),
    ],
  ])
}

// ---------- SSR-bundle the parsers so Node can import them ----------

const OUT_DIR = join(ROOT, 'node_modules/.cache/parsers-check')

async function bundleParsers() {
  const { build } = await import('vite')
  await build({
    root: join(ROOT, 'client'),
    logLevel: 'error',
    // output inside the repo so externalized bare imports still resolve
    // against root node_modules
    build: {
      ssr: 'src/lib/parsers/index.ts',
      outDir: OUT_DIR,
      emptyOutDir: true,
      rollupOptions: { output: { entryFileNames: 'parsers.mjs' } },
    },
    resolve: {
      // Node lacks DOMMatrix etc.; pdfjs's own guidance is the legacy build there.
      // Browser field swaps in mammoth's unzip.js with arrayBuffer support.
      alias: [
        { find: /^pdfjs-dist$/, replacement: 'pdfjs-dist/legacy/build/pdf.mjs' },
        { find: /^mammoth$/, replacement: 'mammoth/mammoth.browser.js' },
      ],
    },
  })
  return pathToFileUrl(join(OUT_DIR, 'parsers.mjs'))
}

// ---------- main ----------

const workDir = mkdtempSync(join(tmpdir(), 'aja-parsers-'))
try {
  writeFileSync(join(workDir, 'resume.pdf'), makePdf('Hello PDF Resume'))
  writeFileSync(join(workDir, 'resume.docx'), makeDocx('Hello DOCX Resume'))
  writeFileSync(join(workDir, 'resume.txt'), Buffer.from('just text, not a resume format'))
  // %PDF magic but garbage body — passes magic-byte gate, fails in pdf.js
  writeFileSync(
    join(workDir, 'corrupt.pdf'),
    Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2048, 0xff)]),
  )

  const parsersUrl = await bundleParsers()

  const require = createRequire(join(ROOT, 'package.json'))
  // browsers get a real worker via ?url; under Node point at the local worker
  // file — must be set AFTER import (the bundled module assigns its own ?url)
  const { parseResume } = await import(parsersUrl)
  const { GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')

  const file = (name) => new File([readFileSync(join(workDir, name))], name)

  // PDF_OK
  {
    const bytes = readFileSync(join(workDir, 'resume.pdf'))
    const r = await parseResume(file('resume.pdf'))
    assert(r.ok && r.value.kind === 'pdf', 'PDF_OK: should parse as pdf')
    assert.equal(r.value.fileName, 'resume.pdf')
    assert.equal(r.value.sizeBytes, bytes.length)
    assert.match(r.value.text, /Hello PDF Resume/)
    console.log('PDF_OK: extracted', JSON.stringify(r.value.text))
  }

  // DOCX_OK
  {
    const r = await parseResume(file('resume.docx'))
    assert(r.ok && r.value.kind === 'docx', 'DOCX_OK: should parse as docx')
    assert.match(r.value.text, /Hello DOCX Resume/)
    console.log('DOCX_OK: extracted', JSON.stringify(r.value.text))
  }

  // WRONG_FORMAT
  {
    const r = await parseResume(file('resume.txt'))
    assert(!r.ok && r.code === 'UNSUPPORTED_FORMAT', 'WRONG_FORMAT: txt must be rejected before parsing')
    console.log('WRONG_FORMAT: rejected with', r.code)
  }

  // TOO_LARGE (rejected before reading content)
  {
    const big = new Uint8Array(5_000_001)
    big.set([0x25, 0x50, 0x44, 0x46]) // %PDF magic, valid format, over limit
    const r = await parseResume(new File([big], 'big.pdf'))
    assert(!r.ok && r.code === 'FILE_TOO_LARGE', 'TOO_LARGE: oversize must be rejected before parsing')
    console.log('TOO_LARGE: rejected with', r.code)
  }

  // PARSE_FAILED (%PDF magic passes, parser throws on garbage body)
  {
    await assert.rejects(
      () => parseResume(file('corrupt.pdf')),
      undefined,
      'PARSE_FAILED: corrupt pdf must throw (Dropzone maps it to PARSE_FAILED)',
    )
    console.log('PARSE_FAILED: corrupt-but-magic-valid file throws as expected')
  }

  // post-build wiring: wasm assets copied, worker asset referenced by the bundle
  const dist = join(ROOT, 'client/dist')
  assert(existsSync(join(dist, 'pdfjs/wasm/jbig2.wasm')), 'dist/pdfjs/wasm must exist after build')
  const jsAssets = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'))
  const bundled = jsAssets.some((f) =>
    readFileSync(join(dist, 'assets', f), 'utf8').includes('assets/pdf.worker.min'),
  )
  assert(bundled, `built bundle must reference the pdf worker asset (checked ${jsAssets.join(', ')})`)
  console.log('POST_BUILD: dist/pdfjs/wasm present; bundle references pdf.worker asset')

  console.log('parser checks passed')
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
