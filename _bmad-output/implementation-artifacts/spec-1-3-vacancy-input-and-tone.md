---
title: 'Story 1.3: Текст вакансии и выбор тональности'
type: 'feature'
created: '2026-08-23'
baseline_commit: '83ccf6e7d96c0cfd4a64dec6b562ef8ca1c49399'
status: 'in-progress'
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** после загрузки резюме пользователь не может указать вакансию и тон результата — генерация (Story 1.4) не получает два из трёх своих входов.

**Approach:** textarea вакансии с счётчиком codepoints и жёстким лимитом 10 000, segmented control тональности (3 опции + дефолт), логика активации кнопки «Сгенерировать» по полноте формы. Всё клиент-side; никаких API-вызовов.

## Boundaries & Constraints

**Always:**
- Счёт символов — codepoints через общую утилиту в `shared/` (`countChars`, не `.length`); лимит — единственная константа `LIMITS.vacancyMaxChars`
- Ввод сверх лимита блокируется; счётчик становится `{colors.error}`; кнопка disabled с подсказкой «Сократите текст вакансии»
- Тональности: Профессиональная (default) / Дружелюбная / Уверенная; enum `Tone` живёт в `shared/` — единственном источнике (import-only)
- Кнопка «Сгенерировать» активна только при: файл загружен И вакансия ≥200 codepoints; иначе disabled с конкретной подсказкой, чего не хватает
- Фокус после успешной загрузки файла переходит на textarea (handoff, обещанный Story 1.2)
- Placeholder textarea показывает пример структуры вакансии (позиция, обязанности, требования)

**Ask First:**
- Любой новый dependency.

**Never:**
- Никакого вызова `/api/generate` или любого сетевого запроса (Story 1.4)
- Никакой серверной валидации вакансии (FR-4 — Story 2.2); здесь только локальная проверка длины
- Никаких глобальных сторов; только локальный useState/reducer
- Никаких изменений Dropzone/парсеров Story 1.2 (кроме получения колбэка готовности файла)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| VALID_FORM | Файл загружен + вакансия ≥200 симв. | Кнопка активна | N/A |
| NO_FILE | Вакансия ≥200, файл не загружен | Кнопка disabled: «Сначала загрузите резюме» | Подсказка |
| SHORT_VACANCY | Файл загружен + <200 симв. | Кнопка disabled: «Опишите вакансию подробнее» | Подсказка |
| OVER_LIMIT | Вставка, выводящая за 10 000 | Ввод обрезается до лимита; счётчик `{colors.error}`; disabled «Сократите текст вакансии» | Блокировка ввода |
| TONE_SWITCH | Выбор другой опции | Описание под контролем обновляется; дефолт — Профессиональная | N/A |

</frozen-after-approval>

## Code Map

Наследуется от Stories 1.1–1.2:

- `client/src/App.tsx` -- держит resume-состояние; сюда добавляются vacancy/tone-состояние, VacancyInput, ToneSelect, кнопка
- `client/src/components/Dropzone.tsx` -- источник события успешной загрузки для фокус-handoff'а (колбэк уже есть: `onAccepted`)
- `client/src/theme.css` -- токены; добавить стили textarea/segmented/disabled-подсказок
- `shared/src/index.ts` -- `LIMITS.vacancyMaxChars`; добавить `MIN_VACANCY_CHARS = 200`, enum `Tone`, утилиту `countChars`

Создаётся:

```text
shared/src/index.ts        # + Tone enum, MIN_VACANCY_CHARS, countChars (codepoints)
client/src/components/VacancyInput.tsx   # textarea + счётчик + блокировка сверх лимита
client/src/components/ToneSelect.tsx     # segmented control + описание выбранной
client/src/components/GenerateButton.tsx # disabled-логика + подсказка чего не хватает
```

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/index.ts` -- `countChars` (codepoints), `MIN_VACANCY_CHARS`, enum `Tone = 'professional' | 'friendly' | 'confident'` -- единый источник контрактов
- [ ] `client/src/components/VacancyInput.tsx` -- textarea, счётчик n/10 000, обрезка ввода на лимите, `{colors.error}` при переполнении -- FR-3
- [ ] `client/src/components/ToneSelect.tsx` -- segmented control, дефолт professional, строка описания -- FR-6
- [ ] `client/src/components/GenerateButton.tsx` -- disabled-логика по трём условиям + конкретные подсказки -- UX-DR5
- [ ] `client/src/App.tsx` -- сборка Зоны 1, фокус-handoff Dropzone→textarea через ref -- связка
- [ ] `scripts/check-form.mjs` (или расширение harness) -- кейсы матрицы I/O против чистых функций состояния -- повторяемая проверка

**Acceptance Criteria:**
- Given файл загружен и вакансия ≥200 codepoints, when смотрю на кнопку, then она активна
- Given файл не загружен, when вакансия длинная, then кнопка disabled с подсказкой про резюме; Given вакансия <200, then подсказка про описание вакансии
- Given текст на лимите, when вставляю ещё символы, then ввод не превышает 10 000, счётчик красный, кнопка disabled с «Сократите текст вакансии»
- Given эмодзи/суррогатные пары в тексте, when считаю символы, then счёт идёт по codepoints (не UTF-16 units)
- Given смена тональности, when кликаю опцию, then описание обновляется, выбор сохраняется при правке текста
- Given успешная загрузка файла, then фокус в textarea

## Spec Change Log

## Design Notes

Codepoints без Intl.Segmenter (достаточно для лимита): `[...text].length`. Обрезка вставки: `Array.from(text).slice(0, LIMITS.vacancyMaxChars).join('')`.

Кнопка рендерится всегда (UX State Patterns), но disabled до полной формы; действие onClick пустое до Story 1.4.

## Verification

**Commands:**
- `npm run build` -- expected: strict TS без ошибок
- `npm test` -- expected: все предыдущие проверки зелёные + новые form-кейсы
- Ручной dev-режим: вставить 10 500 символов → обрезка до 10 000, красный счётчик; переключение тонов; кнопка активируется только после загрузки файла

**Manual checks (if no CLI):**
- Клавиатура: загрузить файл → фокус в textarea; Tab-порядок dropzone → textarea → tone → button
- Эмодзи в тексте считается одной единицей
