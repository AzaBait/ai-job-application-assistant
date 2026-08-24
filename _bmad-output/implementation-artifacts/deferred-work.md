## Deferred from: code review of spec-2-2 (2026-08-24)
- Дублирование TS-типа ValidateVacancyResult в api.ts вместо z.infer из shared-схемы — косметика, безопасно отложить до следующего касания файла
## Deferred from: code review of spec-2-2 (2026-08-24) — MAJOR
- Отсутствует автоматическое покрытие последовательности validate→generate в `App.handleGenerate` (порядок вызовов, стоп на VACANCY_INVALID, superseded-unwind). Реализация Story 2.2 остаётся без изменений — это deferred test coverage, а не известный runtime-дефект. Закрытие требует DOM/RTL-тестовой инфраструктуры (jsdom + @testing-library/react), если она не появится; добавление = отдельное одобрение dependency.
