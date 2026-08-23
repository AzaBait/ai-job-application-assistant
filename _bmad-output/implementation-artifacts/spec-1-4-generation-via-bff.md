---
title: 'Story 1.4: Генерация без фабрикации через BFF'
type: 'feature'
created: '2026-08-23'
baseline_commit: '369b841ab610cf179153a294c72ccde84c956164'
status: 'in-progress'
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ядро продукта отсутствует — форма собрана, но кнопка ничего не вызывает; адаптированное резюме и сопроводительное письмо не генерируются.

**Approach:** `POST /api/generate` на BFF: сервер вызывает Gemini Flash (ключ из env, браузер провайдера не видит) с grounding-промптом жёсткого запрета фабрикации и structured output. Контракт — Zod-схема в `shared/`; невалидный вывод или отказ провайдера принять схему → один repair-retry. Клиент вешает вызов на кнопку с таймаутом 90 c.

## Boundaries & Constraints

**Always:**
- Anti-fabrication defense in depth (AD-5), все слои обязательны:
  1. Системный промпт: генерировать ТОЛЬКО из фактов текста резюме из запроса; запрет выдумывать опыт/навыки/образование/проекты/цифры; разрешено переформулировать, реструктурировать, выбирать релевантное, использовать ключевые слова вакансии
  2. В контексте модели — только resumeText + vacancyText из текущего запроса
  3. Structured output: responseSchema, сгенерированный из Zod-схемы (`shared/`) средствами zod v4 (`z.toJSONSchema`)
  4. Клиентская Zod-валидация ответа → один repair-retry (повторный вызов с описанием ошибки валидации); обрабатывается И невалидный вывод, И отказ провайдера принять схему; вторая неудача → `{ok:false,error:{code,message}}`
- Ключ только на сервере: `GEMINI_API_KEY`/`LLM_MODEL` из env; отсутствие ключа — понятная ошибка конфигурации, не креш
- Таймаут 90 c: AbortController на клиенте + серверный таймаут того же запроса
- Промпты версионируются в `server/src/prompts/*.ts`
- Тональность передаётся параметром и влияет на оба документа

**Ask First:**
- Любой новый dependency сверх стека спайна (hono/zod уже есть; HTTP-клиент — встроенный fetch).
- Смена провайдера/модели (env `LLM_MODEL` — единственная точка смены).

**Never:**
- Никакого хранения результата/входов между запросами (AD-3)
- Никаких stage tracker / document cards / скачивания (Stories 1.5–1.6) — результат кладётся в состояние App
- Никакой полировки ошибок генерации в UI (FR-10 UX — Story 2.3): минимальный inline-текст у кнопки
- Никакой правки Story 1.1–1.3 кроме подключения onClick и состояния результатов

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| GENERATE_OK | Валидная форма, рабочий ключ | `200 {ok:true,data:{adaptedResume,coverLetter}}`; оба документа непустые, тон соблюдён; состояние App обновлено | N/A |
| NO_KEY | `GEMINI_API_KEY` пуст | Запрос не уходит к провайдеру; `{code:'CONFIG'}` человекочитаемо | Inline у кнопки |
| TIMEOUT | LLM молчит >90 c | Клиентский AbortController рвёт запрос; `{code:'LLM_TIMEOUT'}` | Inline у кнопки |
| INVALID_OUTPUT | Ответ мимо схемы | Один repair-retry с ошибкой валидации; при повторе → `{code:'LLM_INVALID_OUTPUT'}` | Retry затем inline |
| SCHEMA_REJECTED | Провайдер отверг responseSchema | То же: один repair-retry → `LLM_INVALID_OUTPUT` | Retry затем inline |

</frozen-after-approval>

## Code Map

Наследуется от Stories 1.1–1.3:

- `shared/src/index.ts` -- Tone enum уже есть; добавить GenerateRequest/Response Zod-схемы (единственный источник контракта)
- `client/src/components/GenerateButton.tsx` -- onClick сейчас пуст (комментарий-заглушка); сюда подключается вызов
- `client/src/App.tsx` -- состояние формы; добавить состояние результатов + фазу generation для disable кнопки
- `server/src/index.ts` -- Hono app; сюда монтируется POST /api/generate
- `.env.example` -- GEMINI_API_KEY/LLM_MODEL уже объявлены

Создаётся:

```text
server/src/prompts/generate.ts    # системный промпт no-fabrication + сборка user-контента
server/src/llm/gemini.ts          # fetch к generativelanguage API: responseSchema, таймаут, retry
server/src/routes/generate.ts     # Zod-валидация запроса -> llm -> envelope {ok,data|error}
client/src/lib/api.ts             # postGenerate(): AbortController 90c, парсинг envelope
```

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/index.ts` -- GenerateRequestSchema `{resumeText, vacancyText, tone}` + GenerateResponseSchema `{adaptedResume, coverLetter}` (непустые строки), экспорт JSON-схемы для responseSchema -- контракт в одном месте
- [ ] `server/src/prompts/generate.ts` -- системный промпт запрета фабрикации + сборка контента из резюме/вакансии/тона -- слой 1 AD-5
- [ ] `server/src/llm/gemini.ts` -- вызов `${LLM_MODEL}:generateContent` c responseSchema, serverTimeout, классификация исходов (ok / schema-rejected / invalid / timeout / rate-limit) -- ядро BFF
- [ ] `server/src/routes/generate.ts` + монтаж в `index.ts` -- repair-retry логика (ровно один), envelope ошибок -- оркестрация
- [ ] `client/src/lib/api.ts` -- postGenerate c AbortController 90 c -- клиентская половина таймаута
- [ ] `GenerateButton/App` -- подключение onClick, фаза generating (disable + «Генерируем…»), результаты в состояние, минимальный inline-error -- замыкание сценария
- [ ] `scripts/check-generate.mjs` -- harness: mock-сервер LLM (подменённый base URL) покрывает все 5 строк матрицы без реального API -- повторяемая проверка без сети

**Acceptance Criteria:**
- Given рабочая форма, when кликаю «Сгенерировать», then браузер вызывает только `/api/generate` (не провайдера), ответ проходит клиентскую Zod-валидацию и попадает в состояние App
- Given промпт, when инспектирую запрос к LLM, then системный промпт запрещает фабрикацию и в контенте только резюме+вакансия+тон
- Given провайдер вернул невалидный схеме вывод, then выполнен ровно один repair-retry; второй неудачный → `LLM_INVALID_OUTPUT` в UI
- Given LLM молчит 90 c, then запрос прерван, пользователь видит `LLM_TIMEOUT` сообщение
- Given пустой GEMINI_API_KEY, when генерирую, then понятная CONFIG-ошибка без крэша сервера
- Given два запроса подряд с разными данными, then второй ответ соответствует второму запросу (ничего не кэшируется)

## Spec Change Log

## Design Notes

Gemini REST: `POST https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=...`, body: systemInstruction + contents + generationConfig.responseSchema (JSON Schema subset: type/properties/required/items — zod v4 `z.toJSONSchema(schema)` даёт совместимое после strip). Base URL — константа в gemini.ts, переопределяемая env-переменной для тестового mock (единственный seam).

Repair-retry: второй вызов получает тот же промпт + пользовательское сообщение «Предыдущий ответ не соответствует схеме: <ошибки>. Верни строго по схеме.»

## Verification

**Commands:**
- `npm run build` -- expected: strict TS чистый
- `npm test` -- expected: предыдущие проверки зелёные + check-generate покрывает 5 строк матрицы (mock LLM, без сети)
- Ручной smoke с реальным ключом (опционально, вне harness): `GEMINI_API_KEY=... npm run dev` → генерация на тестовых данных

**Manual checks (if no CLI):**
- DevTools Network: запрос уходит только на свой origin; тело ответа содержит два непустых документа
