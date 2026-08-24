import {
  GENERATE_RESPONSE_JSON_SCHEMA,
  VALIDATE_VACANCY_JSON_SCHEMA,
  type GenerateRequest,
  type GenerateResponse,
  GenerateResponseSchema,
} from '@aja/shared'
import { GENERATE_SYSTEM_PROMPT, buildGenerateUserContent } from '../prompts/generate.ts'
import { VALIDATE_SYSTEM_PROMPT, buildValidateUserContent } from '../prompts/validate.ts'

// Single seam for tests: override with LLM_BASE_URL to point at a mock.
const BASE_URL = process.env.LLM_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta'

// ponytail: env-overridable only so the offline harness can use a short timeout; production default is the spec's 90s
export function llmTimeoutMs(): number {
  return Number(process.env.LLM_TIMEOUT_MS) || 90_000
}

export type LlmOutcome =
  | { kind: 'ok'; response: GenerateResponse }
  | { kind: 'schema_rejected'; detail: string }
  | { kind: 'invalid'; detail: string }
  | { kind: 'timeout' }
  | { kind: 'rate_limited' }
  | { kind: 'provider_error'; message: string }

// Shared transport core: one HTTP call, JSON envelope unwrapped to the model's
// raw text. Callers own prompt + responseSchema + schema validation.
type TransportOutcome =
  | { kind: 'ok'; text: string }
  | { kind: 'invalid'; detail: string }
  | { kind: 'schema_rejected'; detail: string }
  | { kind: 'timeout' }
  | { kind: 'rate_limited' }
  | { kind: 'provider_error'; message: string }

async function geminiJson(
  systemPrompt: string,
  userParts: string[],
  jsonSchema: Record<string, unknown>,
  timeoutMs: number,
): Promise<TransportOutcome> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/models/${process.env.LLM_MODEL ?? 'gemini-2.5-flash'}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY ?? '',
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: userParts.map((text) => ({ text })),
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: jsonSchema,
        },
      }),
    })
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return { kind: 'timeout' }
    }
    return { kind: 'provider_error', message: err instanceof Error ? err.message : String(err) }
  }

  if (res.status === 429) return { kind: 'rate_limited' }

  const raw = await res.text()
  if (!res.ok) {
    // only provider refusals of responseSchema itself count as schema-rejected (AD-5 retry);
    // anything else is a provider failure that must NOT consume the repair-retry
    if (/responseSchema|response_schema|response schema|Unsupported.*schema|schema.*Unsupported/i.test(raw)) {
      return { kind: 'schema_rejected', detail: raw.slice(0, 500) }
    }
    return { kind: 'provider_error', message: `HTTP ${res.status}: ${raw.slice(0, 500)}` }
  }

  let parsed: {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[]
    promptFeedback?: { blockReason?: string }
  }
  try {
    parsed = JSON.parse(raw)
  } catch {
    // pre-2.2 behavior preserved (Story 2.2 Never: /api/generate untouched):
    // malformed envelope counts as invalid model output -> eligible for repair-retry
    return { kind: 'invalid', detail: 'non-JSON envelope from provider' }
  }
  if (parsed.promptFeedback?.blockReason) {
    return { kind: 'provider_error', message: `blocked: ${parsed.promptFeedback.blockReason}` }
  }
  const candidate = parsed.candidates?.[0]
  if (!candidate) {
    return { kind: 'provider_error', message: 'no candidates in provider response' }
  }
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    return { kind: 'provider_error', message: `finishReason ${candidate.finishReason}` }
  }
  const text = candidate.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  try {
    return { kind: 'ok', text: JSON.parse(text) }
  } catch {
    return { kind: 'invalid', detail: 'model output is not valid JSON' }
  }
}

export async function callGemini(
  input: GenerateRequest,
  extraUserMessage?: string,
  timeoutMs: number = llmTimeoutMs(),
): Promise<LlmOutcome> {
  const outcome = await geminiJson(
    GENERATE_SYSTEM_PROMPT,
    [
      buildGenerateUserContent(input.resumeText, input.vacancyText, input.tone),
      ...(extraUserMessage ? [extraUserMessage] : []),
    ],
    GENERATE_RESPONSE_JSON_SCHEMA,
    timeoutMs,
  )

  switch (outcome.kind) {
    case 'ok': {
      const result = GenerateResponseSchema.safeParse(outcome.text)
      if (!result.success) {
        return {
          kind: 'invalid',
          detail: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        }
      }
      return { kind: 'ok', response: result.data }
    }
    case 'invalid':
    case 'timeout':
      return outcome
    case 'rate_limited':
      return outcome
    case 'schema_rejected':
      return { kind: 'schema_rejected', detail: outcome.detail }
    default:
      return { kind: 'provider_error', message: outcome.message }
  }
}

export type ValidateVacancyOutcome =
  | { kind: 'ok'; valid: boolean }
  | { kind: 'invalid' }
  | { kind: 'timeout' }
  | { kind: 'rate_limited' }
  | { kind: 'provider_error'; message: string }

export async function validateVacancyText(
  vacancyText: string,
  timeoutMs: number = llmTimeoutMs(),
): Promise<ValidateVacancyOutcome> {
  const outcome = await geminiJson(
    VALIDATE_SYSTEM_PROMPT,
    [buildValidateUserContent(vacancyText)],
    VALIDATE_VACANCY_JSON_SCHEMA,
    timeoutMs,
  )
  switch (outcome.kind) {
    case 'ok':
      // transport core guarantees parsed JSON; shape-check the classifier contract
      return typeof outcome.text === 'object' &&
        outcome.text !== null &&
        typeof (outcome.text as { valid?: unknown }).valid === 'boolean'
        ? { kind: 'ok', valid: (outcome.text as { valid: boolean }).valid }
        : { kind: 'invalid' }
    case 'invalid':
    case 'timeout':
    case 'rate_limited':
      return outcome
    default:
      // schema_rejected / provider errors are transport-class for validation:
      // never a VACANCY_INVALID verdict
      return { kind: 'provider_error', message: outcome.kind === 'schema_rejected' ? outcome.detail : outcome.message }
  }
}
