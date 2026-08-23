import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// wasm (jbig2/openjpeg/qcms) is only fetched for exotic image codecs; wired
// day one per spec — files are copied to public/pdfjs/wasm by scripts/copy-pdfjs-wasm.mjs
const wasmUrl = `${import.meta.env.BASE_URL}pdfjs/wasm/`

export async function extractPdfText(data: Uint8Array): Promise<string> {
  const task = pdfjs.getDocument({ data, wasmUrl })
  const pages: string[] = []
  try {
    const doc = await task.promise
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str + (item.hasEOL ? '\n' : ' ')
      }
      pages.push(text.trim())
      page.cleanup()
    }
  } finally {
    await task.destroy()
  }
  return pages.join('\n\n')
}
