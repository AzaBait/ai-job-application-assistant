import {
  GENERATE_RESPONSE_JSON_SCHEMA,
  type GenerateRequest,
  type GenerateResponse,
  GenerateResponseSchema,
} from '@aja/shared'
import { GENERATE_SYSTEM_PROMPT, buildGenerateUserContent } from '../prompts/generate.ts'

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

export async function callGemini(
  input: GenerateRequest,
  extraUserMessage?: string,
  timeoutMs: number = llmTimeoutMs(),
): Promise<LlmOutcome> {
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
        systemInstruction: { parts: [{ text: GENERATE_SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [buildGenerateUserContent(input.resumeText, input.vacancyText, input.tone), ...(extraUserMessage ? [extraUserMessage] : [])].map(
              (text) => ({ text }),
            ),
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GENERATE_RESPONSE_JSON_SCHEMA,
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
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return { kind: 'invalid', detail: 'model output is not valid JSON' }
  }
  const result = GenerateResponseSchema.safeParse(document)
  if (!result.success) {
    return {
      kind: 'invalid',
      detail: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    }
  }
  return { kind: 'ok', response: result.data }
}
