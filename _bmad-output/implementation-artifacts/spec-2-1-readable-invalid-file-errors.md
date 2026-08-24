---
title: 'Story 2.1: Понятные ошибки невалидного файла'
type: 'feature'
created: '2026-08-24'
baseline_commit: '053ab9907b9c76a7df11fb7464f62569379d587f'
status: 'in-progress'
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ошибочные ветки загрузки файла показывают короткие технические сообщения без причин и путей восстановления; скан-PDF без текстового слоя молча принимается как «успех» с пустым текстом (отложено в 1.2 ровно в эту историю). Пользователь не понимает, что делать.

**Approach:** довести существующий каркас ошибок Dropzone до AC истории: полные actionable-сообщения по реестру кодов, привязка ошибок к dropzone через `aria-describedby` + `role="alert"`, детект пустого извлечения → `PARSE_FAILED`. Каркас (коды, catch, seq-guard, замена файла) уже существует со Story 1.2/1.4 — эта история его завершает.

## Boundaries & Constraints

**Always:**
- Сообщения по кодам закрытого реестра (AD-7), дословно по AC эпика:
  - `UNSUPPORTED_FORMAT` → «Этот формат не поддерживается. Загрузите резюме в PDF или DOCX (до 5 МБ)»
  - `FILE_TOO_LARGE` → упомянуть лимит 5 МБ и поддерживаемые форматы
  - `PARSE_FAILED` → «Не удалось прочитать файл. Похоже, он повреждён — попробуйте другой PDF или DOCX»
- Ошибка связана с dropzone через `aria-describedby`; роль оповещения — `role="alert"` на блоке ошибки
- После ошибки: введённый текст вакансии и выбранная тональность НЕ сбрасываются (они живут в App, Dropzone не имеет к ним доступа — зафиксировать тестом)
- Замена файла доступна немедленно после ошибки; успешная замена убирает сообщение
- Скан-PDF/пустое извлечение → `PARSE_FAILED` вместо молчаливого успеха (перенесено из Story 1.2)
- Happy path Epic 1 (валидный PDF/DOCX) работает как раньше — регрессионная защита

**Ask First:**
- Любой новый dependency (не ожидается).

**Never:**
- Никакой валидации вакансии `/api/validate-vacancy` (Story 2.2)
- Никаких изменений UX ошибок генерации/ретрая (Story 2.3)
- Никаких изменений README/PROMPTS.md/деплоя (Story 2.4)
- Никаких изменений промптов и `/api/generate`
- Никаких изменений Stories 1.3–1.7 компонентов (VacancyInput/ToneSelect/tracker/cards)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| UNSUPPORTED | .txt/.jpg (magic-byte ≠ PDF/DOCX) | Inline: «Этот формат не поддерживается. Загрузите резюме в PDF или DOCX (до 5 МБ)» | role="alert", aria-describedby |
| TOO_LARGE | PDF 6 МБ | Inline с лимитом и форматами | То же |
| CORRUPT | `%PDF` magic + битое тело | Inline: «Не удалось прочитать файл. Похоже, он повреждён — попробуйте другой PDF или DOCX» | То же |
| EMPTY_TEXT | Валидный PDF без текстового слоя (скан) | Извлечение даёт пустой текст → трактуется как PARSE_FAILED с тем же сообщением | То же |
| REPLACE_AFTER_ERROR | Ошибка → выбор валидного файла | Ошибка исчезает, конвейер работает, vacancy/tone нетронуты | N/A |
| PRESERVE_INPUT | Ошибка при заполненной форме | Vacancy text + tone идентичны до/после | N/A |

</frozen-after-approval>

## Code Map

Существующее, переиспользуется почти как есть:

- `client/src/components/Dropzone.tsx` -- MESSAGES (расширить копию), `fail()` (оставить), error-`<p>` (добавить id+role), aria-live announce (оставить)
- `client/src/lib/parsers/index.ts` -- dispatch magic-byte/размер уже возвращает `{ok:false, code}`; добавить проверку пустого извлечения
- `shared/src/index.ts` -- `ParseRejectionCode` реестр уже содержит все три кода, не меняется
- `scripts/check-parsers.mjs` -- harness парсеров; добавить кейс EMPTY_TEXT

Изменяется минимально:

```text
client/src/lib/parsers/index.ts      # пустое извлечение -> PARSE_FAILED
client/src/components/Dropzone.tsx   # полные копии сообщений, aria-describedby, role="alert"
scripts/check-parsers.mjs            # + EMPTY_TEXT кейс
```

## Tasks & Acceptance

**Execution:**
[x] `client/src/lib/parsers/index.ts` -- после успешного извлечения `!text.trim()` → `{ ok:false, code:'PARSE_FAILED' }` -- закрывает дыру сканов из 1.2
[x] `client/src/components/Dropzone.tsx` -- MESSAGES заменены на полные AC-копии трёх кодов; error-блок получает `id`, `role="alert"`, а кнопка dropzone — `aria-describedby` на активную ошибку -- FR-2, UX-DR8
[x] Регрессия ввода: ручная трассировка + существующие suite подтверждают, что `fail()` не затрагивает состояние App (vacancy/tone) -- PRESERVE_INPUT
[x] `scripts/check-parsers.mjs` -- кейс EMPTY_TEXT (валидный PDF-фикстура → пустая строка) ожидает `PARSE_FAILED` -- матрица
- [ ] Полный `npm test` -- регрессия happy path Epic 1

**Acceptance Criteria:**
- Given .txt файл, when загружаю, then inline-ошибка с точной копией про формат и поддерживаемые форматы, ошибка доступна через aria-describedby от dropzone
- Given PDF >5 МБ, then отдельное сообщение про размер
- Given повреждённый `%PDF`-файл, then сообщение про повреждение с советом попробовать другой
- Given валидный скан-PDF без текста, then PARSE_FAILED с сообщением о повреждении/нечитаемости, НЕ молчаливый успех
- Given любая ошибка файла, when смотрю форму, then vacancy text и tone не изменились
- Given замена на валидный файл после ошибки, then ошибка исчезла, генерация работает
- Given happy path Epic 1, when прогоняю npm test, then все suite зелёные без изменений поведения

## Spec Change Log

## Design Notes

`aria-live="polite"` announce остаётся для success-объявлений; ошибки получают `role="alert"` (assertive) — оба канала не дублируют друг друга: alert-блок появляется/исчезает, announce используется только для принятого файла.

Пустой текст ≠ ошибка парсинга технически, но продуктово неотличим для пользователя («мы ничего не смогли прочитать») — поэтому единый код PARSE_FAILED без нового элемента реестра.

## Verification

**Commands:**
- `npm run build` -- expected: strict TS чистый
- `npm test` -- expected: все suite зелёные + новый EMPTY_TEXT кейс
- Ручной dev: загрузить .txt / большой PDF / скан — увидеть все три сообщения; затем валидный файл — ошибка ушла, текст вакансии на месте

**Manual checks (if no CLI):**
- Скринридер: ошибка объявляется при появлении (role=alert)

## Suggested Review Order

- Пустое извлечение → PARSE_FAILED (обе ветки парсера)
  [`index.ts:25`](../../client/src/lib/parsers/index.ts#L25)

- Полные AC-копии сообщений реестра
  [`Dropzone.tsx:7`](../../client/src/components/Dropzone.tsx#L7)

- aria-describedby + role="alert" на ошибке
  [`Dropzone.tsx:117`](../../client/src/components/Dropzone.tsx#L117)

- EMPTY_TEXT harness-кейс (скан-фикстура)
  [`check-parsers.mjs:201`](../../scripts/check-parsers.mjs#L201)
