import type { Envelope, GenerateRequest, GenerateResponse, ValidateVacancyRequest } from '@aja/shared'
import { EnvelopeSchema, GenerateResponseSchema, ValidateVacancyResultSchema } from '@aja/shared'

const TIMEOUT_MS = 90_000

export type GenerateResult =
  | { kind: 'ok'; data: GenerateResponse }
  | { kind: 'error'; code: string; message: string }

export async function postGenerate(input: GenerateRequest): Promise<GenerateResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let envelope: Envelope<GenerateResponse>
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    })
    const parsed: unknown = await res.json().catch(() => null)
    const checked = EnvelopeSchema.safeParse(parsed)
    if (!checked.success) {
      // schema-invalid payload under {ok:true} is the model's fault; anything else is transport
      const badPayload =
        !!parsed &&
        typeof parsed === 'object' &&
        (parsed as { ok?: unknown }).ok === true &&
        !GenerateResponseSchema.safeParse((parsed as { data?: unknown }).data).success
      return badPayload
        ? { kind: 'error', code: 'LLM_INVALID_OUTPUT', message: 'Модель вернула некорректный результат' }
        : { kind: 'error', code: 'LLM_UNAVAILABLE', message: 'Сервис генерации временно недоступен' }
    }
    envelope = checked.data
  } catch (err) {
    if (controller.signal.aborted) {
      return {
        kind: 'error',
        code: 'LLM_TIMEOUT',
        message: 'Генерация заняла слишком долго, попробуйте ещё раз',
      }
    }
    return { kind: 'error', code: 'LLM_UNAVAILABLE', message: 'Сервис генерации временно недоступен' }
  } finally {
    clearTimeout(timer)
  }
  if (!envelope.ok) return { kind: 'error', code: envelope.error.code, message: envelope.error.message }
  return { kind: 'ok', data: envelope.data }
}

export type ValidateVacancyResult =
  | { kind: 'ok'; valid: boolean }
  | { kind: 'error'; code: string; message: string }

// same 90s architecture budget (AD-6) as postGenerate — no separate product number
export async function postValidateVacancy(input: ValidateVacancyRequest): Promise<ValidateVacancyResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('/api/validate-vacancy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    })
    const parsed: unknown = await res.json().catch(() => null)
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as { ok?: unknown }).ok === true &&
      ValidateVacancyResultSchema.safeParse((parsed as { data?: unknown }).data).success
    ) {
      return { kind: 'ok', valid: (parsed as { data: { valid: boolean } }).data.valid }
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as { ok?: unknown }).ok === false &&
      typeof (parsed as { error?: { code?: unknown; message?: unknown } }).error?.code === 'string'
    ) {
      const error = (parsed as { error: { code: string; message?: unknown } }).error
      return {
        kind: 'error',
        code: error.code,
        message: typeof error.message === 'string' ? error.message : '',
      }
    }
    return { kind: 'error', code: 'LLM_UNAVAILABLE', message: 'Сервис генерации временно недоступен' }
  } catch (err) {
    if (controller.signal.aborted) {
      return {
        kind: 'error',
        code: 'LLM_TIMEOUT',
        message: 'Проверка заняла слишком долго, попробуйте ещё раз',
      }
    }
    return { kind: 'error', code: 'LLM_UNAVAILABLE', message: 'Сервис генерации временно недоступен' }
  } finally {
    clearTimeout(timer)
  }
}
