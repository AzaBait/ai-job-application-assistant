---
title: 'Story 1.2: Загрузка резюме и извлечение текста'
type: 'feature'
created: '2026-08-23'
baseline_commit: 'e2bc613509c86cfbeff51683779883077a3a1d5c'
status: 'done'
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** пользователь не может передать сервису своё резюме — нет загрузки файла и извлечения текста, без которых генерация невозможна.

**Approach:** клиентский dropzone (drag-and-drop + клик, замена файла) с мгновенной валидацией размера/magic-byte и извлечением текста целиком в браузере: `pdfjs-dist` для PDF (явный Vite worker wiring), `mammoth` для DOCX. Файл не покидает вкладку; извлечённый текст живёт только в памяти (AD-3, AD-4).

## Boundaries & Constraints

**Always:**
- Формат проверяется по magic-byte до парсинга: `%PDF` для PDF, `PK\x03\x04` для DOCX; размер ≤5 МБ (`LIMITS.fileMaxBytes` из `shared/`)
- Извлечённый текст держится в React-состоянии вкладки; никаких запросов с файлом на сервер
- pdfjs-dist подключается с явным worker'ом через Vite (`?url` import + `GlobalWorkerOptions.workerSrc`) — day one, без хаков
- Dropzone доступна с клавиатуры (Enter/Space), dragover/hover состояния по токенам DESIGN.md (`{colors.accent}` граница)
- После выбора файла показываются имя и размер, кнопка замены ×

**Ask First:**
- Любой новый dependency сверх `pdfjs-dist`, `mammoth` (оба уже разрешены спайном).

**Never:**
- Focus handoff to vacancy textarea is owned by Story 1.3 — в этой истории не создаётся placeholder/якорь будущей textarea и не имитируется её контрол
- Никакой отправки файла или извлечённого текста на сервер (это появится только как параметр generate в Story 1.4)
- Никакой полировки ошибок невалидного файла (Epic 2, Story 2.1): достаточно минимального отклонения неподдерживаемого формата/размера без красивого UX
- Никаких серверных изменений (сервер Story 1.1 не трогается)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| PDF_OK | Валидный PDF ≤5 МБ | Текст резюме в состоянии; имя+размер+× в dropzone; состояние «файл принят» | N/A |
| DOCX_OK | Валидный DOCX ≤5 МБ | То же, текст извлечён mammoth'ом | N/A |
| WRONG_FORMAT | Напр., .txt/.jpg (magic-byte ≠ PDF/DOCX) | Файл отклонён до парсинга; минимальное сообщение о поддерживаемых форматах | Inline-сообщение, файл не парсится |
| TOO_LARGE | PDF >5 МБ | Отклонение до чтения содержимого | Inline-сообщение о лимите |

</frozen-after-approval>

## Code Map

Наследуется от Story 1.1 (все пути от корня репо):

- `client/src/App.tsx` -- точка монтирования Зоны 1; сюда встраивается Dropzone
- `client/src/theme.css` -- CSS-переменные DESIGN.md (dropzone использует `{colors.border/accent/error}`)
- `shared/src/index.ts` -- `LIMITS.fileMaxBytes`; расширить: добавить типы `ResumeSource = { kind: 'pdf' | 'docx', fileName: string }` при необходимости
- `scripts/test.mjs` -- паттерн smoke-теста; аналогичный клиентский чек добавляется по необходимости

Создаётся:

```text
client/src/components/Dropzone.tsx   # drag-and-drop + клик + замена × + keyboard Enter/Space
client/src/lib/parsers/index.ts      # dispatch по magic-byte -> pdf.ts | docx.ts
client/src/lib/parsers/pdf.ts        # pdfjs-dist + worker ?url import + wasmUrl
client/src/lib/parsers/docx.ts       # mammoth extractRawText({ arrayBuffer })
```

## Tasks & Acceptance

**Execution:**
- [x] `client/src/lib/parsers/pdf.ts` -- pdfjs-dist v6: worker через `pdfjs-dist/build/pdf.worker.min.mjs?url`, `GlobalWorkerOptions.workerSrc`, перебор страниц → объединённый текст -- ядро истории
- [x] `client/src/lib/parsers/docx.ts` -- mammoth `extractRawText` из ArrayBuffer -- второй формат
- [x] `client/src/lib/parsers/index.ts` -- чтение первых байт (magic-byte), проверка размера, dispatch формата; возвращает `{ text, fileName }` или код отказа -- единая точка входа парсинга
- [x] `client/src/components/Dropzone.tsx` -- dragover/click/keyboard, отображение имени/размера, кнопка ×, минимальные inline-отклонения -- UX точки входа
- [x] `client/src/App.tsx` -- состояние `{ fileName, sizeBytes, sourceKind }`, интеграция Dropzone -- связка в страницу
[x] smoke-проверка сборки с worker-ассетом pdfjs в `dist/` -- регрессия билда

**Acceptance Criteria:**
- Given валидный текстовый PDF ≤5 МБ, when выбираю его в dropzone, then показываются имя и размер, текст извлечён в память вкладки, сетевых запросов с телом файла нет
- Given валидный DOCX ≤5 МБ, when загружаю, then текст извлечён аналогично
- Given файл >5 МБ или не-PDF/DOCX, when выбираю, then отклоняется до парсинга с inline-сообщением (полировка — Story 2.1)
- Given dropzone в фокусе, when Enter/Space, then открывается выбор файла
- Given файл принят, when dropzone завершает interaction state, then UI остаётся консистентным без фиктивных контролов (перенос фокуса на textarea — Story 1.3)

## Spec Change Log

## Design Notes

Worker-подключение pdfjs под Vite (типовой минимум):

```ts
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
```

Текст со всех страниц собирается конкатенацией `\n\n`. Пустой результат парсинга (скан без текстового слоя) — это ветка Story 2.1 (`PARSE_FAILED`), здесь достаточно вернуть пустую строку без креша.

## Verification

**Commands:**
- `npm run build` -- expected: сборка проходит, worker-ассет присутствует в `client/dist/assets/`
- `npm test` -- expected: smoke-тест по-прежнему зелёный (сервер не затронут)
- Ручной e2e в браузере dev-режима: загрузить тестовые resume.pdf и resume.docx, увидеть имя/размер и отсутствие ошибок в консоли

**Manual checks (if no CLI):**
- DevTools Network: при загрузке файла нет запросов к серверу с его содержимым
- Клавиатура: Tab до dropzone → Enter открывает диалог выбора файла

## Suggested Review Order

**Парсинг: единая точка входа**

- Magic-byte dispatch + лимит размера до парсинга; коды отказа из закрытого реестра
  [`index.ts:18`](../../client/src/lib/parsers/index.ts#L18)

- PDF: worker через ?url + hasEOL-сохранение строк, destroy в finally
  [`pdf.ts:10`](../../client/src/lib/parsers/pdf.ts#L10)

- DOCX: mammoth extractRawText, warnings в console.warn
  [`docx.ts:3`](../../client/src/lib/parsers/docx.ts#L3)

**Dropzone: interaction и robustness**

- try/catch → PARSE_FAILED; seq-guard гонок; pending-состояние чтения
  [`Dropzone.tsx:27`](../../client/src/components/Dropzone.tsx#L27)

- Drag-флик guard + window preventDefault + aria-live объявления
  [`Dropzone.tsx:74`](../../client/src/components/Dropzone.tsx#L74)

**Периферия**

- Реестр кодов: PARSE_FAILED добавлен по AD-7
  [`index.ts:1`](../../shared/src/index.ts#L1)

- Персистентный harness парсеров: 5 кейсов + post-build проверки
  [`check-parsers.mjs:6`](../../scripts/check-parsers.mjs#L6)
