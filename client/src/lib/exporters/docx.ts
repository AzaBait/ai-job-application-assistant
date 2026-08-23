import { BorderStyle, Document, HeadingLevel, Packer, Paragraph } from 'docx'
import type { DocBlock } from '../formState'

function blockToParagraph(block: DocBlock): Paragraph {
  switch (block.type) {
    case 'h1':
      return new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_1 })
    case 'h2':
      return new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2 })
    case 'li':
      return new Paragraph({ text: block.text, bullet: { level: 0 } })
    case 'p':
      return new Paragraph({ text: block.text })
    case 'hr':
      return new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DEE2E6' } } })
    default:
      throw new Error(`unknown block type: ${(block as DocBlock).type}`)
  }
}

export async function buildDocx(blocks: DocBlock[]): Promise<Blob> {
  const doc = new Document({ sections: [{ children: blocks.map(blockToParagraph) }] })
  return Packer.toBlob(doc)
}
