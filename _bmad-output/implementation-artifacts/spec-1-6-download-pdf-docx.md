---
title: 'Story 1.6: Скачивание PDF и DOCX'
type: 'feature'
created: '2026-08-23'
baseline_commit: '340f4f4c22895c50b162f9b3d151abfbece18557'
status: 'done'
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** результаты видны на экране, но пользователь не может забрать документы с собой — нет скачивания в PDF/DOCX, финального шага сценария UJ-1.

**Approach:** клиентская сборка файлов из текстов результатов: `docx` (Packer.toBlob) для DOCX, `pdf-lib` со встроенным Unicode-шрифтом (Noto Sans, кириллица) для PDF. Кнопки «Скачать PDF»/«Скачать DOCX» на каждой DocumentCard — 4 варианта. Файл собирается в браузере, Blob → download; сервер не участвует (AD-4).

## Boundaries & Constraints

**Always:**
- Экспорт сохраняет структуру: заголовки, списки, абзацы, разделители — планка MVP (не пиксель-перфект)
- PDF встраивает Unicode/Noto Sans шрифт — кириллица читаема в любом просмотрщике
- Оба формата для обоих документов (4 кнопки); имя файла осмысленное (`resume-tailored.docx`, `cover-letter.pdf`, ...)
- Кнопки secondary outline по DESIGN.md, touch ≥44px
- Ошибка сборки/скачивания — inline в карточке + возможность повторить (кнопка остаётся активной)

**Ask First:**
- Любой новый dependency сверх `docx`, `pdf-lib` (разрешены спайном).
- УТВЕРЖДЕНО владельцем продукта 2026-08-23: `@pdf-lib/fontkit` разрешён — технически неизбежен для embedFont кастомного TTF (официальное требование pdf-lib), без него кириллица в PDF невыполнима.

**Never:**
- Никакого участия сервера в экспорте (AD-4)
- Никакого изменения контракта `/api/generate`, DocumentCard-структуры Story 1.5 сверх добавления кнопок
- Никаких пиксель-перфет требований к вёрстке PDF
- Никаких изменений Stories 1.1–1.5 логики

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DOWNLOAD_DOCX | Текст документа | Blob → файл `.docx` открывается в Word/Google Docs, структура сохранена | N/A |
| DOWNLOAD_PDF | Текст с кириллицей | PDF с встроенным Noto Sans, кириллица читаема | N/A |
| LONG_TEXT | Документ на несколько страниц | PDF корректно переносит страницы; DOCX поток | N/A |
| BUILD_ERROR | Исключение при сборке | Inline-сообщение в карточке, кнопка активна для повтора | Повтор кликом |

</frozen-after-approval>

## Code Map

Наследуется от Stories 1.1–1.5:

- `client/src/components/DocumentCard.tsx` -- карточка результата; сюда добавляются кнопки скачивания
- `client/src/lib/formState.ts` -- чистые функции; добавить markdown-ish → структура (заголовки/списки/абзацы)
- `shared/src/index.ts` -- типы уже есть
- `client/package.json` -- deps: добавить `docx@9`, `pdf-lib`

Создаётся:

```text
client/src/lib/exporters/docx.ts    # структура -> Packer.toBlob (headings/lists/paragraphs)
client/src/lib/exporters/pdf.ts     # структура -> pdf-lib + embedded Noto Sans, page breaks
client/src/lib/exporters/index.ts   # downloadDocument(kind, fileName) -> Blob -> a[download]
```

Шрифт: Noto Sans Regular .ttf (~500KB) как статик ассет в `client/src/assets/fonts/`, загружается fetch→ArrayBuffer при первом PDF-экспорте.

## Tasks & Acceptance

**Execution:**
[x] `client/src/lib/formState.ts` -- парсер лёгкой разметки результата LLM (#/## заголовки, `-` списки, пустая строка = абзац, --- разделитель) в структуру `{type, text}[]` -- единый источник для docx/pdf
[x] `client/src/lib/exporters/docx.ts` -- структура -> Document с HeadingLevel/Paragraph/bullet, Packer.toBlob -- DOCX-ветка
[x] `client/src/lib/exporters/pdf.ts` -- структура -> PDFDocument + embedFont(NotoSans), перенос страниц по высоте, winAnsi-safe текст через glyph check -- PDF-ветка
[x] `client/src/lib/exporters/index.ts` -- trigger download через URL.createObjectURL + `<a download>` -- доставка файла
[x] `DocumentCard.tsx` -- две кнопки «Скачать PDF»/«Download DOCX», inline-error при неудаче, retry повторным кликом -- UX точки выхода
[x] Расширение harness (`scripts/check-export.mjs`) -- парсер структуры + генерация обоих форматов на фикстуре с кириллицей/списками/заголовками; assert непустых blob'ов и наличия встроенного шрифта в PDF -- повторяемая проверка

**Acceptance Criteria:**
- Given результат, when жму «Скачать DOCX», then скачивается .docx с заголовками/списками/абзацами
- Given результат с кириллицей, when жму «Скачать PDF», then PDF содержит читаемую кириллицу (встроенный шрифт)
- Given длинный документ, when экспортирую в PDF, then страницы переносятся автоматически
- Given ошибка сборки, when она происходит, then inline-сообщение в карточке, повторный клик работает
- Given все 4 кнопки, when кликаю каждую, then 4 различных файла соответствующих форматов

## Spec Change Log

## Design Notes

pdf-lib WinAnsi не покрывает кириллицу -- единственный путь: embedFont(NotoSans-Regular.ttf). Шрифт OFL, грузится один раз лениво.

Структура LLM-вывода договорена промптом Story 1.4 (markdown-lite). Парсер держать толерантным: неизвестная строка = абзац.

## Verification

**Commands:**
- `npm run build` -- expected: strict TS чистый, шрифт в ассетах
- `npm test` -- expected: предыдущие suite зелёные + export-кейсы (структура, размеры blob >0, PDF содержит FontFile2/NotoSans)
- Ручной dev-режим: скачать все 4 варианта, открыть в просмотрщиках

**Manual checks (if no CLI):**
- Открыть скачанные файлы: кириллица читаема, структура видна

## Suggested Review Order

**Парсер структуры (единый источник)**

- parseDocumentStructure: заголовки/списки/hr, склейка абзацев
  [`formState.ts:300`](../../client/src/lib/formState.ts#L300)

**Экспортёры**

- PDF: NotoSans embed через fontkit, перенос страниц, fallback+retry шрифта
  [`pdf.ts:20`](../../client/src/lib/exporters/pdf.ts#L20)

- DOCX: HeadingLevel/bullet → Packer.toBlob
  [`docx.ts:5`](../../client/src/lib/exporters/docx.ts#L5)

- Доставка: Blob → a[download], отложенный revoke
  [`index.ts:7`](../../client/src/lib/exporters/index.ts#L7)

**UI и harness**

- DocumentCard: busy-state, error по kind, retry
  [`DocumentCard.tsx:19`](../../client/src/components/DocumentCard.tsx#L19)

- Harness: round-trip кириллицы через pdfjs, delivery-shim
  [`check-export.mjs:1`](../../scripts/check-export.mjs#L1)
