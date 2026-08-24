import type { DocBlock } from './formState'

// Presentation-only label the letter template prepends; never generated content.
export const LETTER_TITLE = 'Сопроводительное письмо'

export type TemplateRole =
  | 'name'
  | 'position'
  | 'contact'
  | 'section'
  | 'subheading'
  | 'paragraph'
  | 'bullet'
  | 'rule'

export type RenderItem = { role: TemplateRole; text?: string }

export type TemplateModel = {
  kind: 'resume' | 'letter'
  items: RenderItem[]
}

// Shared by PDF and DOCX: sizes in pt (DOCX converts to half-points),
// spacing in pt, colors as hex without '#'.
export const STYLE = {
  name: { size: 17, spaceBefore: 0, spaceAfter: 4, color: null, bold: true },
  position: { size: 12.5, spaceBefore: 2, spaceAfter: 8, color: '495057', bold: true },
  contact: { size: 9.5, spaceBefore: 1, spaceAfter: 1, color: '6C757D', bold: false },
  section: { size: 11.5, spaceBefore: 14, spaceAfter: 5, color: '2563EB', bold: true },
  subheading: { size: 10.5, spaceBefore: 8, spaceAfter: 3, color: '212529', bold: true },
  paragraph: { size: 10.5, spaceBefore: 4, spaceAfter: 4, color: '212529', bold: false },
  bullet: { size: 10.5, spaceBefore: 2, spaceAfter: 2, color: '212529', bold: false, indent: 16 },
  rule: { size: 10.5, spaceBefore: 6, spaceAfter: 6, color: 'ADB5BD', bold: false },
} as const

const CONTACT_PATTERNS = [
  /@[\w.-]+\.\w+/,
  /\+?\d[\d\s()-]{7,}\d/,
  /t\.me\//i,
  /github\.com\//i,
  /linkedin\.com\//i,
  /^(Контакты?|Contact|Телефон|Email|E-mail|GitHub|LinkedIn|Telegram)\s*:/i,
]

const POSITION_PREFIX = /^(Желаемая позиция|Желаемая должность|Позиция|Должность|Position)\s*:\s*/i

const SECTION_HEADINGS =
  /^(Ключевые навыки|Навыки и стек|Навыки|Технологии|Стек|Опыт работы|Профессиональный опыт|Опыт|Образование|Курсы и обучение|Курсы|Дополнительная информация|Дополнительно|О себе|Проекты|Языки)([\s,:;—-]|$)/i

function isContactLine(text: string): boolean {
  return CONTACT_PATTERNS.some((re) => re.test(text)) && text.length < 200
}

/**
 * Conservative semantic classification. Only explicit markers upgrade a
 * block's role; anything uncertain stays a plain paragraph. Text is never
 * altered — roles change presentation only.
 */
export function classifyBlocks(blocks: DocBlock[], kind: 'resume' | 'letter'): TemplateModel {
  if (kind === 'letter') {
    // if the model already produced the title, don't duplicate it
    const hasOwnTitle = blocks.some(
      (b) => b.type !== 'li' && b.type !== 'hr' && (b.text ?? '').trim().toLowerCase() === LETTER_TITLE.toLowerCase(),
    )
    return {
      kind,
      items: [
        ...(hasOwnTitle ? [] : [{ role: 'section' as const, text: LETTER_TITLE }]),
        ...blocks.map((b) =>
          b.type === 'hr'
            ? { role: 'rule' as const }
            : b.type === 'li'
              ? { role: 'bullet' as const, text: b.text }
              : b.type === 'h2'
                ? { role: 'subheading' as const, text: b.text }
                : { role: 'paragraph' as const, text: b.text },
        ),
      ],
    }
  }

  const items: RenderItem[] = []
  let nameTaken = false

  const classifyLine = (text: string): RenderItem => {
    if (isContactLine(text)) return { role: 'contact', text }
    if (POSITION_PREFIX.test(text) && text.length <= 120) return { role: 'position', text }
    if (SECTION_HEADINGS.test(text) && text.length <= 60) return { role: 'section', text }
    return { role: 'paragraph', text }
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.type === 'hr') {
      items.push({ role: 'rule' })
      continue
    }
    const text = block.text ?? ''

    // name: first heading-like or short unmarked plain block only
    if (!nameTaken && (block.type === 'h1' || (i === 0 && block.type === 'p'))) {
      if (block.type === 'h1' || (text.length <= 60 && !isContactLine(text) && !POSITION_PREFIX.test(text) && !/[:•]/.test(text))) {
        items.push({ role: 'name', text })
        nameTaken = true
        continue
      }
    }

    // li keeps its bullet role regardless of content
    if (block.type === 'li') {
      items.push({ role: 'bullet', text })
      continue
    }

    // soft-wrapped paragraphs pack several semantic lines; classify per line
    if (text.includes('\n')) {
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        items.push(classifyLine(line))
      }
      continue
    }

    if (block.type === 'h2') {
      items.push(SECTION_HEADINGS.test(text) ? { role: 'section', text } : { role: 'subheading', text })
      continue
    }
    if (block.type === 'h1') {
      items.push({ role: 'section', text })
      continue
    }
    items.push(classifyLine(text))
  }
  return { kind, items }
}
