---
title: 'Story 2.4: Артефакты интенсива и демо-пас'
type: 'feature'
created: '2026-08-24'
status: 'draft'
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** код обоих эпиков готов, но финальные артефакты сдачи не собраны: README не описывает стек/структуру/деплой, демо-сценарий презентации не отрепетирован и не зафиксирован письменно, фактический деплой не выполнен (цель хостинга так и не выбрана).

**Approach:** документация + фактический деплой на **Render** (утверждён владельцем): дополнить README разделами «Архитектура и структура» и «Деплой на Render», создать DEMO.md с полным сценарием презентации и проверкой прод-URL, задеплоить текущий HEAD, получить публичный URL и прогнать прод-smoke/demo. История закрывается только после успешного деплоя.

## Boundaries & Constraints

**Always:**
- README дополняется (не переписывается): разделы «Архитектура и структура проекта» (client/server/shared по AD-1..AD-8 кратко) и «Деплой» (любой Node-хост: build+start, `server/.env` из секретов платформы, порт из `PORT`)
- DEMO.md — пошаговый сценарий финальной презентации строго по SM-1..SM-4: happy path E2E → заведомо некорректные входы (битый файл, текст-не-вакансия ≥200 символов, превышение лимита) → ошибка генерации и восстановление через «Повторить» → показ промптов из PROMPTS.md → чеклист ручной проверки достоверности SM-2
- PROMPTS.md регенерируется `npm run prompts` и проверяется на соответствие generate.ts
- Деплой Render Web Service: Node 24 environment, build `npm install && npm run build`, start `npm start`; health check `/api/health`; секреты (`GEMINI_API_KEY`, `LLM_MODEL`) только в Render Environment Variables
- Прод-URL проходит smoke: `/api/health` 200, страница отдаётся, генерация с настроенным ключом работает, сценарий ошибки→«Повторить»→успех воспроизводим
- Все существующие тесты остаются зелёными

**Ask First:**
- Любой новый dependency.
- Учётная запись Render и значение реального GEMINI_API_KEY для окружения сервиса (создаются/вводятся владельцем в дашборде Render; ключ не попадает в репозиторий).
- Итоговое имя сервиса / прод-домен (Render назначает onrender.com по умолчанию).

**Never:**
- Никаких изменений application/runtime кода, `/api/generate`, промптов генерации
- Никаких изменений Stories 1.1–1.7, 2.1–2.3 поведения
- Никаких секретов в README/DEMO.md/примерах env
- Никаких новых зависимостей для деплоя (Docker/CI запрещены ранее); никакого host-specific runtime-кода (PORT/0.0.0.0 уже универсальны)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CLEAN_CLONE | Свежий клон без server/.env | README-инструкции приводят к работающему приложению (генерация потребует ключа) | Задокументировано |
| PROMPTS_REGEN | npm run prompts после правки промпта | PROMPTS.md идентичен источнику | N/A |
| DEMO_INVALID_INPUT | Битый файл / текст-не-вакансия в демо | Понятная ошибка + восстановление без перезапуска (уже реализовано 2.1/2.2) | Сценарий демо |
| DEPLOY_RENDER | push текущего HEAD в подключённый Render-сервис | Автосборка по build-command, старт по start-command, health check проходит, публичный URL отвечает | Логи сборки в дашборде |
| PROD_SMOKE | Публичный URL после деплоя | health 200, SPA отдаётся, генерация с ключом из Render Env работает, ошибка→«Повторить»→успех | Сценарий DEMO.md против прод-URL |

## Code Map

Существующее, переиспользуется:

- `README.md` -- базовые разделы уже есть (запуск/конфиг/dev/тесты/промпты)
- `PROMPTS.md` + `scripts/gen-prompts.mjs` -- уже реализованы досрочно (Story 1.x); проверить свежесть
- `scripts/test.mjs` -- офлайн smoke; основа для упоминания прод-проверки
- `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` -- источник для секции «Структура» (read-only)

Создаётся/меняется:

```text
README.md      # + «Архитектура и структура», + «Деплой», + ссылка на DEMO.md
DEMO.md        # НОВЫЙ: сценарий презентации + чеклист достоверности SM-2
```

## Tasks & Acceptance

**Execution:**
- [ ] `README.md` -- раздел «Архитектура и структура»: один origin SPA+BFF, клиентский парсинг/экспорт, anti-fabrication слои, реестр ошибок; дерево каталогов кратко -- NFR-3
- [ ] `README.md` -- раздел «Деплой на Render»: создание Web Service из Git-репозитория, Environment = Node, build/start команды проекта, Environment Variables (`GEMINI_API_KEY`, `LLM_MODEL`, опц. `PORT`), health check `/api/health`; явное указание: секреты только в Render Env, никогда в Git -- NFR-3, AD-8
- [ ] `npm run prompts` -- перегенерация и git diff подтверждает актуальность PROMPTS.md -- AD-5
- [ ] `DEMO.md` -- сценарий презентации по SM-1..SM-4 с таймлайном, командами подготовки (env, тестовые файлы) и чеклистом достоверности -- SM-3, SM-4
- [ ] Деплой на Render: сервис создан по инструкции README, прод-URL получен, health 200 -- SM-1
- [ ] Прод-smoke по DEMO.md против прод-URL: happy path, битый файл, текст-не-вакансия, ошибка→«Повторить»→успех -- SM-1, SM-3, SM-4
- [ ] Финальная верификация: полный `npm test`, чистый git status (нет секретов), сверка чеклиста ТЗ интенсива -- закрытие Epic 2

**Acceptance Criteria:**
- Given свежий клон, when следую README, then приложение запускается локально без дополнительных вопросов
- Given README, when читаю, then описаны запуск, конфигурация (все переменные AD-8), стек, структура, деплой-подход и тесты
- Given PROMPTS.md, when сравниваю с generate.ts, then содержимое идентично (генерация свежая)
- Given DEMO.md, when прохожу сценарий на живом приложении с ключом, then все шаги воспроизводимы: happy path, битый файл, текст-не-вакансия, ошибка→«Повторить»→успех
- Given демо-результаты, when проверяю достоверность, then ни одного факта вне исходного резюме (SM-2 чеклист пройден)
- Given весь suite, when npm test, then зелёный без регрессий
- Given текущий HEAD, when задеплоен на Render, then публичный URL отвечает: health 200, UI работает, генерация функционирует с Render-ключом
- Given прод-URL, when прохожу сценарий DEMO.md, then все шаги включая ошибку→«Повторить»→успех воспроизводимы на проде
- Given репозиторий, when ищу секреты, then ни одного значения ключа в трекнутых файлах

## Spec Change Log

## Design Notes

Фактический деплой осознанно вынесен за пределы истории: выбор хостинга — решение владельца (Ask First с Story 1.1). История гарантирует: одношаговый запуск из чистого клона, задокументированные требования хоста, DEMO.md работает и локально и на любом деплое.

Демо-скрипт включает пункт «показать PROMPTS.md аудитории» — прямая демонстрация anti-fabrication обещания.

## Verification

**Commands:**
- `npm run build && npm test` -- expected: всё зелёное
- `npm run prompts && git diff --exit-code PROMPTS.md` -- expected: PROMPTS.md был актуален
- Чистый clone-тест (опционально): clone в temp dir, cp .env.example server/.env, install/build/start, curl health

**Manual checks (if no CLI):**
- Пройти DEMO.md от начала до конца на живом приложении с реальным ключом
