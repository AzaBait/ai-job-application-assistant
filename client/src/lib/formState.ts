import { LIMITS, MIN_VACANCY_CHARS, countChars, type Tone } from '@aja/shared'

export type FormIssue = 'NO_FILE' | 'SHORT_VACANCY' | 'OVER_LIMIT' | null

export function clampVacancy(text: string): { text: string; overLimit: boolean } {
  const overLimit = countChars(text) > LIMITS.vacancyMaxChars
  return {
    text: overLimit ? Array.from(text).slice(0, LIMITS.vacancyMaxChars).join('') : text,
    overLimit,
  }
}

export function formIssue(hasFile: boolean, text: string, overLimit: boolean): FormIssue {
  if (!hasFile) return 'NO_FILE'
  if (overLimit || countChars(text) > LIMITS.vacancyMaxChars) return 'OVER_LIMIT'
  if (countChars(text.trim()) < MIN_VACANCY_CHARS) return 'SHORT_VACANCY'
  return null
}

export const ISSUE_HINTS = {
  NO_FILE: 'Сначала загрузите резюме',
  SHORT_VACANCY: 'Опишите вакансию подробнее',
  OVER_LIMIT: 'Сократите текст вакансии',
} as const

export const TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  {
    value: 'professional',
    label: 'Профессиональная',
    description: 'Деловой стиль, формальные формулировки',
  },
  {
    value: 'friendly',
    label: 'Дружелюбная',
    description: 'Тёплый тон, живой и простой язык',
  },
  {
    value: 'confident',
    label: 'Уверенная',
    description: 'Напористый тон, акцент на результатах',
  },
]

export function toneDescription(tone: Tone): string {
  return (
    TONE_OPTIONS.find((o) => o.value === tone)?.description ?? TONE_OPTIONS[0].description
  )
}

// UX labels over ONE real /api/generate request — not a server pipeline.
// Stages 1–2 complete at fixed intervals after request start; stage 3 stays
// active until the fetch resolves/rejects.
export type StagePhase = 'generating' | 'success'
export type StageProgression = { done: number; active: number | null }

const STAGE_DURATIONS_MS = [600, 600]

export function stageProgress(phase: StagePhase, elapsedMs: number): StageProgression {
  if (phase === 'success') return { done: STAGE_DURATIONS_MS.length + 1, active: null }
  let done = 0
  let acc = 0
  for (const duration of STAGE_DURATIONS_MS) {
    acc += duration
    if (elapsedMs < acc) break
    done++
  }
  return { done, active: done < STAGE_DURATIONS_MS.length + 1 ? done : null }
}

export const PREVIEW_LINES = 8
const PREVIEW_MAX_CHARS = 600

function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
}

export function documentPreview(text: string): string {
  const head = splitLines(text).slice(0, PREVIEW_LINES).join('\n')
  if ([...head].length <= PREVIEW_MAX_CHARS) return head
  return [...head].slice(0, PREVIEW_MAX_CHARS).join('') + '…'
}

export function documentExpandable(text: string): boolean {
  const lines = splitLines(text)
  if (lines.slice(0, PREVIEW_LINES).join('\n').length > PREVIEW_MAX_CHARS) return true
  // whitespace-only remainder beyond the preview is not worth a toggle
  return lines.slice(PREVIEW_LINES).join('\n').trim().length > 0
}

// markdown-lite parser for the LLM output contract from Story 1.4's prompt:
// '# '/'## ' headings, '- ' list items, '---' separator. Consecutive plain
// lines merge into ONE paragraph (blank line starts a new paragraph).
// Tolerant by design: any unrecognized line is a plain paragraph.
export type DocBlock =
  | { type: 'h1' | 'h2' | 'p' | 'li'; text: string }
  | { type: 'hr' }

export function parseDocumentStructure(text: string): DocBlock[] {
  const blocks: DocBlock[] = []
  let canMerge = false
  for (const raw of splitLines(text)) {
    const line = raw.trim()
    if (!line) {
      canMerge = false
      continue
    }
    const last = blocks[blocks.length - 1]
    if (/^-{3,}$/.test(line)) {
      blocks.push({ type: 'hr' })
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3).trim() })
    } else if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2).trim() })
    } else if (/^[-•]\s+/.test(line)) {
      blocks.push({ type: 'li', text: line.replace(/^[-•]\s+/, '') })
    } else if (canMerge && last?.type === 'p') {
      last.text += `\n${line}`
    } else {
      blocks.push({ type: 'p', text: line })
    }
    canMerge = blocks[blocks.length - 1]?.type === 'p'
  }
  return blocks
}
