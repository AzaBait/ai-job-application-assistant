---
title: 'Story 1.7: Профессиональное оформление экспортируемых документов'
type: 'feature'
created: '2026-08-23'
baseline_commit: '7f5f44563c7cf6d620176dfe314a2b230fdbbdd0'
status: 'in-progress'
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** скачанные PDF/DOCX содержат правильный контент и базовую структуру, но выглядят как plain text — нет визуальной иерархии, типографики и профессионального вида. Продуктовое решение: НЕ воспроизводить оригинальную вёрстку резюме пользователя, а рендерить генерат в наш собственный чистый детерминированный шаблон.

**Approach:** слой шаблонизации между парсером структуры и экспортёрами: **консервативная** семантическая классификация DocBlocks + единая таблица стилей для PDF и DOCX. Контент не изменяется — только классификация существующих блоков и presentation-only элементы шаблона (заголовок письма).

## Boundaries & Constraints

**Always:**
- **No-invention rule (главный инвариант):** template/export код НИКОГДА не изобретает, не изменяет, не перефразирует и не удаляет факты кандидата. Разрешено: классификация существующих блоков + presentation-only подписи, являющиеся частью шаблона (например, заголовок «Сопроводительное письмо»)
- **Консервативная классификация**, только по явным признакам:
  - первый явный candidate-name заголовок → имя
  - позиция — ТОЛЬКО по явной метке («Желаемая позиция:» или эквивалент)
  - контакты — строки с email/телефон/t.me/github.com/linkedin.com паттернами (включая строки вида «Контакты: …», «GitHub: …», «LinkedIn: …»)
  - известные секции резюме («Ключевые навыки…», «Опыт работы», «Образование», «Дополнительная информация» и т.п.) → секции
  - **неуверенность = блок остаётся обычным контентом**; никогда не присваивать семантику по позиции соседа (строка после имени НЕ становится позицией автоматически)
- PDF и DOCX читают одну конфигурацию шаблона (единый source of truth стилей)
- Типографика: имя крупно bold, секционные заголовки с акцентом `{colors.accent}`, контакты компактно, списки с отступом, единые интервалы, поля ~2см
- Кириллица через встроенные шрифты (NotoSans Regular + NotoSans-Bold); мультистраничность; orphan-heading avoidance
- Заголовок «Сопроводительное письмо» добавляется слоем шаблона к письму (presentation-only); тело письма не меняется
- Терпимость к входу: нераспознанное = абзац

**Ask First:**
- Любой новый npm dependency (шрифты-ассеты не dependency).

**Never:**
- Никаких изменений `/api/generate`, промптов, retry
- Никаких попыток воспроизвести/сохранить оригинальную вёрстку загруженного резюме
- Никаких изменений Stories 1.1–1.5 UI/логики
- Никакого изменения download-interaction из 1.6
- Никакого перемещения, потери, дублирования или модификации контента при классификации

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| RESUME_FULL | Реальная структура E2E: имя → Контакты:/GitHub:/LinkedIn: → Желаемая позиция: → навыки → опыт → образование → доп. информация | Имя крупно, контактные строки компактным блоком, «Желаемая позиция: Java Developer» выделен как позиция по метке, секции акцентом | N/A |
| LETTER | Приветствие + абзацы + closing + имя/телефон/email | Template-заголовок «Сопроводительное письмо»; абзацы оформлены; тело без изменений | N/A |
| AMBIGUOUS | Строка без меток после имени | Остаётся обычным абзацем (НЕ позиция) | N/A |
| MULTIPAGE | Длинное резюме | Чистые переносы, no orphan headings | N/A |
| CYRILLIC | Кириллица везде | Читаемо в обоих форматах | N/A |
| NO_DRIFT | Любой вход | Множество строк контента до = после (без перемещений/дублей/потерь) | Fail теста |

</frozen-after-approval>

## Code Map

Переиспользуется из Story 1.6 без изменений: `parseDocumentStructure`, delivery (`exporters/index.ts`), DocumentCard-кнопки, шрифтовый fallback/retry, harness-паттерн.

Изменяется:

```text
client/src/lib/template.ts            # НОВЫЙ: консервативная classifyBlocks() -> TemplateModel {name?, position?, contactLines[], blocks[]} + STYLE таблица
client/src/lib/exporters/pdf.ts       # рендер TemplateModel + стили; NotoSans-Bold; orphan-avoidance
client/src/lib/exporters/docx.ts      # рендер TemplateModel + стили
client/src/assets/fonts/NotoSans-Bold.ttf  # НОВЫЙ ассет (OFL)
scripts/check-export.mjs              # + реальные фикстуры E2E, no-drift, шаблонные assert'ы
```

Новые dependencies: **нет** (Bold-шрифт — ассет).

## Tasks & Acceptance

**Execution:**
- [ ] `client/src/lib/template.ts` -- classifyBlocks(): name по первому явному heading; position ТОЛЬКО по метке «Желаемая позиция:»/(Position:) префиксу; contacts по паттернам (@, tel/+7/+996, t.me, github.com, linkedin.com, «Контакты:»); известные resume-заголовки → секции; uncertain → paragraph -- консервативная семантика
- [ ] `template.ts` -- STYLE таблица (pt/spacing/цвета) общая для PDF/DOCX -- единый источник
- [ ] `pdf.ts` -- рендер TemplateModel: имя bold крупно, позиция выделена, контакты компактно, секции accent+rule, body 10pt; orphan-heading перенос -- PDF-ветка
- [ ] `docx.ts` -- тот же TemplateModel через HeadingLevel/bold/color/spacing -- DOCX-ветка
- [ ] `NotoSans-Bold.ttf` ассет + lazy загрузка с fallback на Regular -- типографика
- [ ] Письмо: template-заголовок «Сопроводительное письмо» перед телом (presentation-only) -- оформление письма
- [ ] Расширение `check-export.mjs`: реальные фикстуры (resume E2E-структуры + letter), no-drift assert (мультимножество непустых строк до=после для обоих форматов), AMBIGUOUS-кейс, стилевые маркеры, кириллица round-trip -- регрессия

**Acceptance Criteria:**
- Given реальный E2E resume-генерат, when экспортирую, then имя/контакты/позиция/секции распознаны по явным признакам и оформлены профессионально в обоих форматах
- Given «Контакты: …» сразу после имени, then это классифицировано как контакты, НЕ как позиция
- Given строка «Желаемая позиция: Java Developer», then она оформлена как позиция (по явной метке)
- Given неоднозначная строка без метки, then она остаётся абзацем без присвоенной роли
- Given письмо, then заголовок «Сопроводительное письмо» добавлен шаблоном, тело идентично исходному
- Given любой вход, both formats, then мультимножество непустых строк контента идентично до/после (no move/lose/duplicate/modify)
- Given длинный документ, then нет висячих заголовков; кириллица читаема; suite 1.6 зелёный

## Spec Change Log

## Design Notes

Позиция распознаётся префиксом-меткой, а не соседством: «Желаемая позиция: X» → position=X (метка отделяется presentation-only). Аналогично «Контакты: …» — контактная строка целиком.

Letter-template добавляет только заголовок документа; имя/контакты в подписи письма остаются как сгенерированы.

## Verification

**Commands:**
- `npm run build` -- expected: strict TS, оба шрифта в ассетах
- `npm test` -- expected: все suite зелёные + template-кейсы (фикстуры, no-drift, AMBIGUOUS, orphan)
- Ручной dev-режим: скачать 4 файла на реальном генерате, визуальная проверка

**Manual checks (if no CLI):**
- Открыть PDF/DOCX: иерархия соответствует реальной структуре, ничего не потеряно/не задублировано
