import { z } from 'zod'

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

const nonEmpty = z.string().min(1)

export const GenerateRequestSchema = z.object({
  resumeText: nonEmpty,
  vacancyText: nonEmpty,
  tone: z.enum(['professional', 'friendly', 'confident']),
})

export const GenerateResponseSchema = z.object({
  adaptedResume: nonEmpty,
  coverLetter: nonEmpty,
})

export const ValidateVacancyRequestSchema = z.object({ vacancyText: nonEmpty })

export const ValidateVacancyResultSchema = z.object({ valid: z.boolean() })

export type ValidateVacancyRequest = z.infer<typeof ValidateVacancyRequestSchema>

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>

// Gemini responseSchema accepts only a JSON Schema subset (type/properties/
// required/items/enum/...); prune everything else z.toJSONSchema emits.
function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const ALLOWED = new Set([
    'type',
    'properties',
    'required',
    'items',
    'enum',
    'format',
    'description',
    'nullable',
    'propertyOrdering',
  ])
  const prune = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(prune)
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(obj)
          .filter(([k]) => k === 'properties' || ALLOWED.has(k))
          .map(([k, v]) => [k, k === 'properties' ? mapValues(v) : prune(v)]),
      )
    }
    return node
  }
  const mapValues = (v: unknown): unknown =>
    Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([name, s]) => [name, prune(s)]),
    )
  return prune(z.toJSONSchema(schema, { io: 'input', reused: 'inline' })) as Record<string, unknown>
}

export const GENERATE_RESPONSE_JSON_SCHEMA = toGeminiSchema(GenerateResponseSchema)

export const VALIDATE_VACANCY_JSON_SCHEMA = toGeminiSchema(ValidateVacancyResultSchema)

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'CONFIG'
  | 'LLM_TIMEOUT'
  | 'LLM_INVALID_OUTPUT'
  | 'RATE_LIMITED'
  | 'LLM_UNAVAILABLE'
  | 'VACANCY_INVALID'

export const ErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'CONFIG',
  'LLM_TIMEOUT',
  'LLM_INVALID_OUTPUT',
  'RATE_LIMITED',
  'LLM_UNAVAILABLE',
  'VACANCY_INVALID',
])

export const EnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: GenerateResponseSchema }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: ErrorCodeSchema, message: z.string() }),
  }),
])

export type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } }
