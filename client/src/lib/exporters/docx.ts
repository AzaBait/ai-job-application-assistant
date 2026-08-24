import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import type { DocBlock } from '../formState'
import { classifyBlocks, STYLE, LETTER_TITLE, type RenderItem } from '../template'

// pt -> docx half-points
const hp = (pt: number) => Math.round(pt * 2)

function itemToParagraph(item: RenderItem): Paragraph {
  const style = STYLE[item.role]
  const run = (text: string) =>
    new TextRun({
      text,
      size: hp(style.size),
      bold: style.bold,
      color: (style.color as string) ?? '212529',
      font: 'Noto Sans',
    })
  const spacing = {
    before: hp(style.spaceBefore) * 10, // half-points * 10 = twips (1pt = 20tw; keep proportional)
    after: hp(style.spaceAfter) * 10,
  }
  switch (item.role) {
    case 'name':
      return new Paragraph({ children: [run(item.text ?? '')], spacing: { before: 0, after: hp(style.spaceAfter) * 10 } })
    case 'position':
      return new Paragraph({ children: [run(item.text ?? '')], spacing })
    case 'contact':
      return new Paragraph({ children: [run(item.text ?? '')], spacing: { before: 10, after: 10 } })
    case 'section':
      return new Paragraph({
        children: [run(item.text ?? '')],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: hp(style.spaceBefore) * 10, after: hp(style.spaceAfter) * 10 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: style.color as string } },
      })
    case 'subheading':
      return new Paragraph({ children: [run(item.text ?? '')], heading: HeadingLevel.HEADING_2, spacing })
    case 'bullet':
      return new Paragraph({
        children: [run(item.text ?? '')],
        bullet: { level: 0 },
        indent: { left: ('indent' in style ? ((style as { indent?: number }).indent ?? 0) + 360 : 360) },
        spacing: { before: hp(style.spaceBefore) * 10, after: hp(style.spaceAfter) * 10 },
      })
    case 'rule':
      return new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: style.color as string } }, spacing })
    default:
      return new Paragraph({ children: [run(item.text ?? '')], spacing, alignment: AlignmentType.LEFT })
  }
}

export async function buildDocx(blocks: DocBlock[], kind: 'resume' | 'letter'): Promise<Blob> {
  const model = classifyBlocks(blocks, kind)
  const children = model.items.map(itemToParagraph)
  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}

// kept for the letter title constant re-export used by harnesses
export { LETTER_TITLE }
