# AI Job Application Assistant

Адаптация резюме и генерация сопроводительного письма под конкретную вакансию —
без выдуманных фактов: AI работает только с информацией из загруженного резюме.

## Требования

- Node.js **24+** (используется нативный запуск TypeScript)

## Установка и запуск

```sh
npm install
npm run build
npm start
```

Приложение доступно на **http://localhost:3000** (порт меняется переменной `PORT`).

## Конфигурация

Обязательный файл окружения — **`server/.env`**. Создайте его из шаблона:

```sh
cp .env.example server/.env
```

и заполните значения. Переменные:

| Переменная | Назначение |
|---|---|
| `PORT` | Порт сервера (по умолчанию 3000) |
| `LLM_MODEL` | Модель Gemini для генерации |
| `GEMINI_API_KEY` | Ключ Google AI Studio — **обязателен для реальной генерации** |

Значения секретов в репозиторий не коммитится (`server/.env` в `.gitignore`).
Без `GEMINI_API_KEY` приложение запускается, но генерация вернёт ошибку конфигурации.

## Разработка

```sh
npm run dev
```

Поднимает Vite dev-сервер клиента и Hono-сервер одновременно; UI открывается на
адресе, который выведет Vite (по умолчанию http://localhost:5173), `/api`
проксируется на сервер. Серверная часть читает `server/.env`.


## Деплой на Render

Приложение деплоится как Render **Web Service** (Node environment):

1. Push репозитория на GitHub.
2. Render Dashboard → New → Web Service → подключить репозиторий.
3. Настройки:
   - Environment: **Node**
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
4. Environment Variables (Dashboard → Environment):
   - `GEMINI_API_KEY` — ключ Google AI Studio (**секрет: только здесь, никогда в Git**)
   - `LLM_MODEL` — модель Gemini (например, `gemini-3.6-flash`)
   - `PORT` — не требуется, Render назначает автоматически
5. Deploy. После сборки сервис отвечает на health check и отдаёт приложение.

Обновление: push в main → автодеплой.

## Архитектура и структура проекта

Один Node-процесс (Hono) отдаёт собранный SPA (Vite + React) и API с одного
origin; браузер работает с файлом резюме локально — на сервер уходят только
текстовые данные генерации, ключ LLM живёт исключительно на сервере.

```
client/    # Vite + React SPA: загрузка PDF/DOCX (pdfjs/mammoth),
           # экспорт результатов (docx/pdf-lib), UI
server/    # Hono BFF: статика + /api/generate (LLM), промпты в server/src/prompts
shared/    # Zod-контракты API, лимиты, общие типы
```

Ключевые инварианты: stateless (ничего не хранится), anti-fabrication
(промпт + JSON-схема + валидация + retry), понятные ошибки без stack trace,
клиентский экспорт PDF/DOCX со встроенными шрифтами кириллицы.
## Тесты

```sh
npm test
```

Полный офлайн-набор: smoke, парсеры резюме, логика формы, контракт generate
(через mock LLM), стадии процесса, экспорт PDF/DOCX.

## Промпты

LLM-промпты живут в `server/src/prompts/generate.ts` (источник истины).
`PROMPTS.md` генерируется из них командой `npm run prompts`.
