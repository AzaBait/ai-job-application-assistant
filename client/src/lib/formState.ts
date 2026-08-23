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
