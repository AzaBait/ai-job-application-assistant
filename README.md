# AI Job Application Assistant

Адаптация резюме и генерация сопроводительного письма без выдуманных фактов.

## Запуск локально

Требуется Node.js 24+.

```sh
npm install
npm run build
npm start
```

Приложение доступно на `http://localhost:3000` (порт — `PORT` в env, см. `.env.example`).

Разработка: `npm run dev` (Vite dev-сервер + Hono с прокси `/api`).
