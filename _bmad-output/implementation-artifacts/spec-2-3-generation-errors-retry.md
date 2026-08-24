---
title: 'Story 2.3: Ошибки генерации и ретрай одной кнопкой'
type: 'feature'
created: '2026-08-24'
baseline_commit: '1269476511e7d4e83bee977d870c9b00a430f255'
status: 'done'
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** при ошибке генерации трекер просто исчезает, а сообщение остаётся без явного действия восстановления рядом с местом сбоя; State Patterns EXPERIENCE.md требует «понятный текст + кнопка „Повторить" одной кнопкой» и ошибочное состояние трекера вместо зависания/исчезновения.

**Approach:** чисто клиентская история: (1) блок ошибки в зоне прогресса получает кнопку «Повторить» рядом с сообщением; (2) StageTracker получает фазу `error` — стадии замирают в моменте сбоя, активная помечается ✕ красным, без спиннера; (3) повтор = тот же handleGenerate (validate→generate) с полным сбросом состояния ошибки. Сервер не трогается.

## Boundaries & Constraints

**Always:**
- Точная копия сообщения по умолчанию: «Произошла временная ошибка. Попробуйте ещё раз»; код-специфичные сообщения из api.ts сохраняются как есть (маппинг AD-7 уже реализован в 1.4)
- Кнопка «Повторить» видна только когда есть ошибка И нет активной генерации; клик = новый POST `/api/generate` (после валидации 2.2), ввод (резюме/вакансия/тон) нетронут
- Трекер в фазе error: индикаторы замирают (✓ остаются, активная становится ✕ `{colors.error}`), спиннер исчезает, никакого зависшего ●
- aria-live объявления продолжают работать; ошибка дублируется role="alert"
- Никаких stack trace / технических кодов в UI

**Ask First:**
- Любой новый dependency (не ожидается).

**Never:**
- Никаких изменений `/api/generate`, его контракта, промптов, retry-механики сервера
- Никаких изменений Stories 1.1–1.7 компонентов (Dropzone/VacancyInput/ToneSelect/cards/exporters/template)
- Никаких изменений валидационного гейта Story 2.2 (порядок validate→generate сохраняется; ретрай проходит через ту же валидацию)
- Никаких toast'ов и модалок

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| ERROR_SHOWN | Генерация упала (любой транспортный/LLM код) | Сообщение в зоне ошибки + кнопка «Повторить»; трекер заморожен с ✕ на активной стадии | N/A |
| RETRY_CLICK | Ошибка показана | Новый полный прогон validate→generate; трекер сбрасывается и идёт заново; старое сообщение убрано | N/A |
| RETRY_SUCCESS | Повтор после успеха | Зона 3 с новыми карточками; ошибка/трекер сброшены | N/A |
| INPUT_EDIT_THEN_RETRY | Пользователь поправил вакансию после ошибки | Ретрай использует текущий (исправленный) текст | N/A |
| REPEATED_FAILURE | Повтор тоже падает | Снова сообщение+«Повторить», без дублей блоков | N/A |

</frozen-after-approval>

## Code Map

Существующее:

- `client/src/App.tsx` -- handleGenerate/genSeqRef/busyRef/activeRunRef (2.2), generateError state; сюда — флаг error для трекера и обработчик ретрая
- `client/src/components/StageTracker.tsx` -- фазы 'generating'|'success'; добавить 'error'
- `client/src/components/GenerateButton.tsx` -- уже рендерит error с role="alert"; добавить «Повторить»
- `client/src/lib/formState.ts` -- StagePhase расширить; stageProgress('error', elapsed) — заморозка прогрессии
- `client/src/theme.css` -- .stage-error маркер, кнопка «Повторить» (secondary outline)
- `scripts/check-results.mjs` -- паттерн stageProgress/renderToString кейсов

## Tasks & Acceptance

**Execution:**
[x] `formState.ts` -- StagePhase += 'error'; stageProgress('error', elapsed): прогрессия фиксируется (done как есть), active → null, трекер не крутится -- семантика ошибки
[x] `StageTracker.tsx` -- фаза error: активная стадия ✕ `{colors.error}` (не спиннер), ✓ сохраняются; sr-only объявляет «Произошла ошибка» -- FR-10 visual
[x] `GenerateButton.tsx` -- блок ошибки: сообщение + кнопка «Повторить» (≥44px, secondary outline) одним действием -- FR-10 AC
[x] `App.tsx` -- проброс error-phase в трекер; onRetry = тот же handleGenerate (validate→generate, genSeq/busy guard'ы действуют) -- ретрай одной кнопкой
[x] `theme.css` -- стили ✕ и кнопки повтора по токенам DESIGN.md -- визуал
[x] `check-results.mjs` -- кейсы матрицы: ERROR_SHOWN (заморозка), RETRY_CLICK (сброс), REPEATED_FAILURE (без дублей) + SSR GenerateButton c error → наличие «Повторить» -- повторяемая проверка

**Acceptance Criteria:**
- Given любая ошибка генерации, when она происходит, then трекер замирает с ✕ (не спиннер, не исчезает до следующего запуска), сообщение с «Попробуйте ещё раз» видно
- Given ошибка показана, when кликаю «Повторить», then выполняется новый полный прогон (validate→generate), ввод нетронут
- Given повтор успешен, then карточки результатов заменяются, ошибка исчезает
- Given повтор снова падает, then один блок ошибки (без дублей)
- Given скринридер, then ошибка объявляется (role=alert / aria-live)

## Spec Change Log

## Design Notes

Фаза error намеренно НЕ сбрасывает трекер (отличие от текущего unmount): State Patterns требует ошибочное состояние трекера. Сброс происходит при новом запуске (RETRY_CLICK).

Ретрай переиспользует handleGenerate целиком — включая валидацию 2.2: если пользователь между попытками исправил текст, валидация честно отработает заново.

## Verification

**Commands:**
- `npm run build` -- expected: strict TS чистый
- `npm test` -- expected: все suite зелёные + новые results-кейсы (ERROR_SHOWN/RETRY_CLICK/REPEATED_FAILURE)
- Ручной dev с реальным ключом или mock: вызвать ошибку (выключить ключ), увидеть сообщение+«Повторить», восстановить ключ, нажать «Повторить» → успех

**Manual checks (if no CLI):**
- Скринридер объявляет ошибку; Tab достигает «Повторить»

## Suggested Review Order

- stageProgress('error'): заморозка прогрессии, active → null
  [`formState.ts:56`](../../client/src/lib/formState.ts#L56)

- StageTracker: ✕ на активной стадии, sr-only «Произошла ошибка»
  [`StageTracker.tsx:20`](../../client/src/components/StageTracker.tsx#L20)

- GenerateButton: сообщение + «Повторить» одним блоком, role="alert"
  [`GenerateButton.tsx:23`](../../client/src/components/GenerateButton.tsx#L23)

- App: error-phase проброс, setResult(null) при сбое, ретрай = handleGenerate
  [`App.tsx:66`](../../client/src/App.tsx#L66)

- Harness: ERROR_SHOWN / RETRY_CLICK / REPEATED_FAILURE
  [`check-results.mjs:100`](../../scripts/check-results.mjs#L100)
