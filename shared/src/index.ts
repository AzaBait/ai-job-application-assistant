export const LIMITS = {
  vacancyMaxChars: 10_000,
  fileMaxBytes: 5_000_000,
} as const

export type ResumeSource = { kind: 'pdf' | 'docx'; fileName: string }

export type ParseRejectionCode =
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'PARSE_FAILED'
