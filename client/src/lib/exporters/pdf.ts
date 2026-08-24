import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { DocBlock } from '../formState'
import { classifyBlocks, STYLE } from '../template'
import fontUrl from '../../assets/fonts/NotoSans-Regular.ttf?url'
import boldFontUrl from '../../assets/fonts/NotoSans-Bold.ttf?url'

// A4 portrait
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 56

export class PdfExportError extends Error {}

type PDFFont = Awaited<ReturnType<PDFDocument['embedFont']>>

// Lazy one-time fetch of the embedded Noto Sans (OFL) assets.
// undefined = not fetched; a failed fetch stays undefined so the next click retries.
let fontCache: ArrayBuffer | undefined
let boldCache: ArrayBuffer | undefined
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
async function loadNotoSansBold(): Promise<ArrayBuffer | null> {
  if (boldCache === undefined) {
    try {
      const res = await fetch(boldFontUrl)
      if (!res.ok) throw new Error(`font asset HTTP ${res.status}`)
      boldCache = await res.arrayBuffer()
    } catch {
      boldCache = undefined
    }
  }
  return boldCache ?? null
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

function hexToRgb(hex: string) {
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255)
}

interface Fonts {
  regular: PDFFont
  bold: PDFFont | null
  embedded: boolean // false => Helvetica fallback, WinAnsi-only
}

function itemStyle(item: RenderItem) {
  return STYLE[item.role]
}
import type { RenderItem } from '../template'

function drawItem(page: ReturnType<PDFDocument['addPage']>, item: RenderItem, y: number, fonts: Fonts): number {
  const style = itemStyle(item)
  const font = (style.bold && fonts.bold) || fonts.regular
  const indent = 'indent' in style ? ((style as { indent?: number }).indent ?? 0) : 0
  const x = MARGIN + indent
  const prefix = item.role === 'bullet' ? '• ' : ''
  if (!fonts.embedded) assertWinAnsi(prefix + (item.text ?? ''))
  const columnWidth = PAGE_WIDTH - 2 * MARGIN - indent
  const size = style.size
  const lineHeight = size * 1.45
  const color = hexToRgb((style.color as string) ?? '212529')
  const lines = wrap(prefix + (item.text ?? ''), columnWidth, (s) => font.widthOfTextAtSize(s, size))
  for (const line of lines) {
    page.drawText(line, { x, y: y - size, size, font, color })
    y -= lineHeight
  }
  return y - style.spaceAfter
}

function newPage(doc: PDFDocument) {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  return { page, y: PAGE_HEIGHT - MARGIN }
}

export async function buildPdf(blocks: DocBlock[], kind: 'resume' | 'letter', fontBytes: ArrayBuffer | null): Promise<Uint8Array> {
  const model = classifyBlocks(blocks, kind)

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const regularBytes = fontBytes ?? (await loadNotoSans())
  const boldBytes = regularBytes ? await loadNotoSansBold() : null
  const regular = regularBytes
    ? await doc.embedFont(regularBytes, { subset: true })
    : await doc.embedFont(StandardFonts.Helvetica)
  let bold: PDFFont | null = null
  if (regularBytes && boldBytes) bold = await doc.embedFont(boldBytes, { subset: true })
  const fonts: Fonts = { regular, bold, embedded: Boolean(regularBytes) }

  let { page, y } = newPage(doc)

  for (let i = 0; i < model.items.length; i++) {
    const item = model.items[i]
    const style = itemStyle(item)
    y -= style.spaceBefore

    // orphan-heading avoidance: heading needs itself + one line of the next
    // block on the same page
    const next = model.items[i + 1]
    if ((item.role === 'section' || item.role === 'subheading') && next) {
      const nextStyle = itemStyle(next)
      const needed = sizeLine(style) + nextStyle.spaceBefore + sizeLine(nextStyle)
      if (y - needed < MARGIN) {
        ;({ page, y } = newPage(doc))
        y -= style.spaceBefore
      }
    }

    if (item.role === 'rule') {
      if (y - style.size < MARGIN) {
        ;({ page, y } = newPage(doc))
        y -= style.spaceBefore
      }
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 0.5,
        color: hexToRgb(style.color as string),
      })
      y -= sizeLine(style) * 0.6 + style.spaceAfter
      continue
    }

    if (y - sizeLine(style) < MARGIN) {
      ;({ page, y } = newPage(doc))
    }
    y = drawItem(page, item, y, fonts)

    if (item.role === 'section') {
      page.drawLine({
        start: { x: MARGIN, y: y + 3 },
        end: { x: PAGE_WIDTH - MARGIN, y: y + 3 },
        thickness: 0.75,
        color: hexToRgb(STYLE.section.color as string),
      })
    }
  }

  // useObjectStreams:false keeps dicts uncompressed — lets the offline
  // harness assert on embedded-font markers; size delta is negligible here.
  return doc.save({ useObjectStreams: false })
}

function sizeLine(style: { size: number }): number {
  return style.size * 1.45
}
