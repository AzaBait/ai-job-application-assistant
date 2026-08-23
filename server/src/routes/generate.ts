import type { GenerateRequest } from '@aja/shared'
import { GenerateRequestSchema } from '@aja/shared'
import { Hono } from 'hono'
import { callGemini, llmTimeoutMs } from '../llm/gemini.ts'

export const generateRoute = new Hono()

generateRoute.post('/api/generate', async (c) => {
  const startedAt = Date.now()
  try {
    const body = await c.req.json().catch(() => null)
    const request = GenerateRequestSchema.safeParse(body)
    if (!request.success) {
      return c.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Некорректный запрос' } }, 400)
    }

    if (!process.env.GEMINI_API_KEY) {
      return c.json({
        ok: false,
        error: {
          code: 'CONFIG',
          message: 'Сервис генерации не настроен: отсутствует GEMINI_API_KEY',
        },
      })
    }

    // one overall deadline for initial attempt + repair-retry (PRD: LLM <= 90s total)
    const deadline = Date.now() + llmTimeoutMs()

    let outcome = await callGemini(request.data, undefined, deadline - Date.now())
    if (outcome.kind === 'schema_rejected' || outcome.kind === 'invalid') {
      // exactly one repair-retry: same prompt + validation-failure message
      outcome =
        deadline - Date.now() > 0
          ? await callGemini(
              request.data,
              `Предыдущий ответ не соответствует схеме: ${outcome.detail}. Верни строго по схеме.`,
              deadline - Date.now(),
            )
          : { kind: 'timeout' }
    }

    let payload: { ok: false; error: { code: string; message: string } } | { ok: true; data: unknown }
    switch (outcome.kind) {
      case 'ok':
        payload = { ok: true, data: outcome.response }
        break
      case 'timeout':
        payload = {
          ok: false,
          error: { code: 'LLM_TIMEOUT', message: 'Генерация заняла слишком долго, попробуйте ещё раз' },
        }
        break
      case 'rate_limited':
        payload = {
          ok: false,
          error: { code: 'RATE_LIMITED', message: 'Слишком много запросов, попробуйте позже' },
        }
        break
      case 'schema_rejected':
      case 'invalid':
        payload = {
          ok: false,
          error: {
            code: 'LLM_INVALID_OUTPUT',
            message: 'Модель вернула некорректный результат, попробуйте ещё раз',
          },
        }
        break
      default: {
        // AD-7 diagnostics: never log raw provider bodies. Log HTTP status +
        // only the provider's error.code/error.message fields (parsed from the
        // JSON error body when possible), truncated; API key redacted when set.
        const httpMatch = /^HTTP (\d+): ?([\s\S]*)$/.exec(outcome.message)
        let detail = httpMatch ? httpMatch[2] : outcome.message
        try {
          const parsed: unknown = JSON.parse(detail)
          const pe = (parsed as { error?: { code?: unknown; message?: unknown } }).error
          const fields = [pe?.code, pe?.message].filter((v) => typeof v === 'string')
          if (fields.length > 0) detail = fields.join(': ')
        } catch {}
        const apiKey = process.env.GEMINI_API_KEY
        if (apiKey) detail = detail.replaceAll(apiKey, '[REDACTED]')
        console.log(
          JSON.stringify({
            route: 'POST /api/generate',
            diag: {
              status: httpMatch ? Number(httpMatch[1]) : undefined,
              detail: [...detail].slice(0, 200).join(''),
            },
          }),
        )
        payload = {
          ok: false,
          error: { code: 'LLM_UNAVAILABLE', message: 'Провайдер недоступен, попробуйте позже' },
        }
      }
    }
    console.log(
      JSON.stringify({
        route: 'POST /api/generate',
        code: payload.ok ? 'ok' : payload.error.code,
        durationMs: Date.now() - startedAt,
      }),
    )
    return c.json(payload)
  } catch (err) {
    console.log(
      JSON.stringify({
        route: 'POST /api/generate',
        code: 'LLM_UNAVAILABLE',
        durationMs: Date.now() - startedAt,
        crash: err instanceof Error ? err.message : String(err),
      }),
    )
    return c.json({
      ok: false,
      error: { code: 'LLM_UNAVAILABLE', message: 'Внутренняя ошибка, попробуйте позже' },
    })
  }
})
