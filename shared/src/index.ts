export const LIMITS = {
  vacancyMaxChars: 10_000,
  fileMaxBytes: 5_000_000,
} as const

export const MIN_VACANCY_CHARS = 200

export type Tone = 'professional' | 'friendly' | 'confident'

export function countChars(text: string): number {
  return [...text].length
}

export type ResumeSource = { kind: 'pdf' | 'docx'; fileName: string }

export type ParseRejectionCode =
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'PARSE_FAILED'
