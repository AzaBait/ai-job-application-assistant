import { ValidateVacancyRequestSchema } from '@aja/shared'
import { Hono } from 'hono'
import { llmTimeoutMs, validateVacancyText } from '../llm/gemini.ts'

export const validateRoute = new Hono()

const ROUTE = '/api/validate-vacancy'

validateRoute.post(ROUTE, async (c) => {
  const startedAt = Date.now()
  try {
    const body = await c.req.json().catch(() => null)
    const request = ValidateVacancyRequestSchema.safeParse(body)
    if (!request.success) {
      return c.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Некорректный запрос' } }, 400)
    }

    if (!process.env.GEMINI_API_KEY) {
      return c.json({
        ok: false,
        error: {
          code: 'CONFIG',
          message: 'Сервис проверки не настроен: отсутствует GEMINI_API_KEY',
        },
      })
    }

    const outcome = await validateVacancyText(request.data.vacancyText, llmTimeoutMs())

    let payload: { ok: false; error: { code: string; message: string } } | { ok: true; data: { valid: boolean } }
    switch (outcome.kind) {
      case 'ok':
        payload = { ok: true, data: { valid: outcome.valid } }
        break
      case 'invalid':
        payload = {
          ok: false,
          error: {
            code: 'LLM_INVALID_OUTPUT',
            message: 'Модель вернула некорректный результат, попробуйте ещё раз',
          },
        }
        break
      case 'timeout':
        payload = {
          ok: false,
          error: { code: 'LLM_TIMEOUT', message: 'Проверка заняла слишком долго, попробуйте ещё раз' },
        }
        break
      case 'rate_limited':
        payload = {
          ok: false,
          error: { code: 'RATE_LIMITED', message: 'Слишком много запросов, попробуйте позже' },
        }
        break
      default:
        // transport failure must never become VACANCY_INVALID
        console.log(
          JSON.stringify({
            route: ROUTE,
            diag: { detail: [...outcome.message].slice(0, 200).join('') },
          }),
        )
        payload = {
          ok: false,
          error: { code: 'LLM_UNAVAILABLE', message: 'Провайдер недоступен, попробуйте позже' },
        }
    }
    // metadata only, never vacancy content (AD-7)
    console.log(
      JSON.stringify({
        route: ROUTE,
        code: payload.ok ? `valid:${payload.data.valid}` : payload.error.code,
        durationMs: Date.now() - startedAt,
      }),
    )
    return c.json(payload)
  } catch (err) {
    console.log(
      JSON.stringify({
        route: ROUTE,
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
