import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { DocBlock } from '../formState'
import fontUrl from '../../assets/fonts/NotoSans-Regular.ttf?url'

// A4 portrait
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 56

type Style = { size: number; lineHeight: number; spaceBefore: number; indent: number }

const STYLES: Record<DocBlock['type'], Style> = {
  h1: { size: 16, lineHeight: 22, spaceBefore: 14, indent: 0 },
  h2: { size: 13, lineHeight: 19, spaceBefore: 12, indent: 0 },
  p: { size: 11, lineHeight: 16, spaceBefore: 6, indent: 0 },
  li: { size: 11, lineHeight: 16, spaceBefore: 3, indent: 18 },
  hr: { size: 11, lineHeight: 16, spaceBefore: 10, indent: 0 },
}

export class PdfExportError extends Error {}

// Lazy one-time fetch of the embedded Noto Sans (OFL) asset.
// undefined = not fetched; a failed fetch stays undefined so the next click retries.
let fontCache: ArrayBuffer | undefined
export async function loadNotoSans(): Promise<ArrayBuffer | null> {
  if (fontCache === undefined) {
    try {
      const res = await fetch(fontUrl)
      if (!res.ok) throw new Error(`font asset HTTP ${res.status}`)
      fontCache = await res.arrayBuffer()
    } catch {
      fontCache = undefined
    }
  }
  return fontCache ?? null
}

// Standard-font fallback cannot encode anything beyond WinAnsi (bullet U+2022
// is WinAnsi 0x95 and allowed); Cyrillic is the common case — point the user
// at DOCX instead of shipping mojibake.
function assertWinAnsi(text: string): void {
  if (/[^\x20-\x7E\xA0-\xFF\u2018\u2019\u201C\u201D\u2013\u2014\u2022\u2026\u00AB\u00BB]/.test(text)) {
    throw new PdfExportError(
      'Не удалось загрузить шрифт с кириллицей для PDF. Используйте «Скачать DOCX» — он сохраняет кириллицу.',
    )
  }
}

function wrap(text: string, width: number, measure: (s: string) => number): string[] {
  const lines: string[] = []
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1]
    if (last && measure(`${last} ${word}`) <= width) {
      lines[lines.length - 1] = `${last} ${word}`
      continue
    }
    if (!last || measure(word) > width) {
      // hard-break words wider than the column
      let chunk = last ? `${last} ` : ''
      for (const char of word) {
        if (measure(chunk + char) > width && chunk.trim()) {
          lines.push(chunk.trimEnd())
          chunk = char
        } else {
          chunk += char
        }
      }
      lines.push(chunk)
      continue
    }
    lines.push(word)
  }
  return lines.length > 0 ? lines : ['']
}

export async function buildPdf(blocks: DocBlock[], fontBytes: ArrayBuffer | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = fontBytes
    ? await doc.embedFont(fontBytes, { subset: true })
    : await doc.embedFont(StandardFonts.Helvetica)

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - MARGIN
  }

  for (const block of blocks) {
    const style = STYLES[block.type]
    y -= style.spaceBefore
    if (y - style.lineHeight < MARGIN) newPage()
    if (block.type === 'hr') {
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 0.5,
        color: rgb(0.87, 0.89, 0.9),
      })
      y -= style.lineHeight
      continue
    }
    const x = MARGIN + style.indent
    const columnWidth = PAGE_WIDTH - 2 * MARGIN - style.indent
    const prefix = block.type === 'li' ? '• ' : ''
    // hr already continued above; validate exactly what will be drawn,
    // bullet prefix included
    if (!fontBytes) assertWinAnsi(prefix + block.text)
    const lines = wrap(prefix + block.text, columnWidth, (s) => font.widthOfTextAtSize(s, style.size))
    for (const line of lines) {
      if (y < MARGIN) newPage()
      page.drawText(line, { x, y: y - style.size, size: style.size, font })
      y -= style.lineHeight
    }
  }

  // useObjectStreams:false keeps dicts uncompressed — lets the offline
  // harness assert on embedded-font markers; size delta is negligible here.
  return doc.save({ useObjectStreams: false })
}
