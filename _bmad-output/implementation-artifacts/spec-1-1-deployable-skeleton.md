---
title: 'Story 1.1: Деплоируемый скелет продукта'
type: 'feature'
created: '2026-08-23'
baseline_commit: 'f29d00d857992090da235d4446fcad52363ac85d'
status: 'done'
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** репозиторий пуст — нет запускаемого приложения; все последующие истории Epic 1 требуют живого каркаса (SPA + BFF на одном origin) и деплой-пайплайна с первого дня.

**Approach:** создать монорепо `client/ server/ shared/` (npm workspaces): Hono-сервер отдаёт собранную статику Vite+React SPA и отвечает на `GET /api/health`; конфигурация только через env; базовая тема из дизайн-токенов DESIGN.md; одностраничный UI с header'ом и trust-line.

## Boundaries & Constraints

**Always:**
- Один Node-процесс, один origin: статика + `/api/*` (AD-1); CORS не настраивается
- Конфигурация только через env: `PORT`, `LLM_MODEL`, `GEMINI_API_KEY`; `.env.example` закоммичен, `.env` в `.gitignore` (AD-8)
- Дизайн-токены DESIGN.md как CSS-переменные: палитра (`--color-accent: #2563EB` и др.), Inter/system-ui, скругления 8/12px, page-max-width 960px (UX-DR12)
- Стек по Architecture Spine: Node 24, Vite 7, React 19, TypeScript strict, Hono, zod 4
- Сервер слушает `0.0.0.0:$PORT` — деплой-нейтрально для любого Node-хоста

**Ask First:**
- Конкретный deployment target (Render/Railway/VPS/иной) — решение пользователя, в архитектуре осознанно отложено. История считается выполненной, когда приложение деплой-готово и проверено локально; фактический деплой на выбранный хост — отдельный шаг после решения пользователя.
- Любой новый dependency сверх стека спайна.

**Never:**
- Никакого Docker/Docker Compose (архитектура их не требует)
- Никакой БД, авторизации, хранения состояния (AD-3)
- Никаких вызовов LLM в этой истории (это Story 1.4)
- Никаких глобальных сторов состояния (Conventions)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HEALTH_OK | `GET /api/health` | `200` `{ok: true, data: {status: "up"}}` | N/A |
| STATIC_ROOT | `GET /` (после build) | index.html SPA с header + trust-line | N/A |
| ENV_MISSING | `PORT` не задан | сервер стартует на дефолтном порту (3000) | N/A |

</frozen-after-approval>

## Code Map

Репозиторий пуст (greenfield) — кодовой базы нет; план создаёт структуру с нуля:

- `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` -- источник инвариантов AD-1..AD-8 и стека (read-only)
- `_bmad-output/planning-artifacts/ux-designs/ux-.../DESIGN.md` -- источник токенов темы (read-only)
- `_bmad-output/planning-artifacts/epics.md` -- AC истории 1.1 (read-only)

Создаваемая структура:

```text
package.json            # npm workspaces: client, server, shared; scripts dev/build/start
.env.example            # PORT=3000, LLM_MODEL=<gemini-flash-alias>, GEMINI_API_KEY=
server/src/index.ts     # Hono: serveStatic(client/dist), GET /api/health, env
client/                 # Vite 7 + React 19 + TS strict
client/src/App.tsx      # header «AI Job Application Assistant» + trust-line
client/src/theme.css    # CSS-переменные из DESIGN.md
shared/src/index.ts     # минимальный экспорт (константы лимитов — заглушка контрактов)
```

## Tasks & Acceptance

**Execution:**
[x] `package.json` -- корень с workspaces `[client, server, shared]`, скрипты `dev` (concurrently vite+hono), `build` (vite build), `start` (node server) -- единая точка запуска
[x] `shared/` -- TS-пакет, экспорт `LIMITS = { vacancyMaxChars: 10000, fileMaxBytes: 5_000_000 }` (заглушка будущих контрактов, Story 1.3 расширит)
[x] `server/` -- Hono: маршрут `/api/health`, serveStatic статики `client/dist`, чтение env через `process.env`, порт из `PORT || 3000`, биндинг `0.0.0.0`
[x] `client/` -- Vite+React приложение: header с названием сервиса, trust-line «Мы не добавляем факты, которых нет в вашем резюме», тема на CSS-переменных из DESIGN.md
[x] `.env.example` + проверка `.gitignore` (.env уже игнорируется) -- конфигурация без секретов в репо (AD-8)
[x] `README.md` -- краткий раздел «Запуск локально» (install/build/start) -- минимальный остов, финализируется в Story 2.4

**Acceptance Criteria:**
- Given чистая установка, when `npm install && npm run build && npm start`, then сервер отвечает на `GET /api/health` → `200 {ok:true,data:{status:"up"}}`
- And `GET /` отдаёт SPA с header'ом и trust-line на публично-деплой-готовом процессе (0.0.0.0:$PORT)
- And конфигурация читается только из env; `.env.example` закоммичен; `.env` отсутствует в git
- И токены DESIGN.md применены как CSS-переменные; страница визуально соответствует палитре/типографике

## Spec Change Log

## Verification

**Commands:**
- `npm install` -- expected: установка без ошибок
- `npm run build` -- expected: client/dist собран, TypeScript strict без ошибок
- `npm start` + `curl localhost:3000/api/health` -- expected: `{"ok":true,"data":{"status":"up"}}`
- `curl localhost:3000/` -- expected: HTML со строками «AI Job Application Assistant» и «Мы не добавляем факты»
- `git check-ignore .env` -- expected: путь игнорируется

**Manual checks (if no CLI):**
- Визуально: страница в палитре DESIGN.md, шрифт Inter/system-ui, trust-line в header'е

## Suggested Review Order

**Сервер: контракт и деплой-готовность**

- Health-эндпоинт — единственный API-контракт истории, форма из I/O-матрицы
  [`index.ts:9`](../../server/src/index.ts#L9)

- Статик-рут от module dir, не CWD — сервер работает из любого каталога
  [`index.ts:11`](../../server/src/index.ts#L11)

- Биндинг 0.0.0.0:$PORT — деплой-нейтральность (AC)
  [`index.ts:14`](../../server/src/index.ts#L14)

- Читаемая ошибка занятого порта вместо необработанного крэша
  [`index.ts:23`](../../server/src/index.ts#L23)

**Клиент: тема и trust-line**

- Header + trust-line в React-шелле
  [`App.tsx:4`](../../client/src/App.tsx#L4)

- Прокси dev-режима следует PORT — same-origin без CORS (AD-1)
  [`vite.config.ts:15`](../../client/vite.config.ts#L15)

**Конфигурация и проверки**

- env-only конфиг через --env-file-if-exists, без dotenv
  [`package.json:17`](../../package.json#L17)

- Smoke-тест поднимает сервер и проверяет обе матричные строки
  [`test.mjs:20`](../../scripts/test.mjs#L20)

- LIMITS — заглушка контрактов для Story 1.3
  [`index.ts:1`](../../shared/src/index.ts#L1)
