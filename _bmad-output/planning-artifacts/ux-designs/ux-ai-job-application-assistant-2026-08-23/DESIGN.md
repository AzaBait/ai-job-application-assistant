---
title: "DESIGN: AI Job Application Assistant"
status: final
created: 2026-08-23
updated: 2026-08-23
---

# DESIGN.md

## Brand & Style

Инструмент доверия: визуальный язык спокойный, чистый, «канцелярски надёжный» — без игривости и агрессивного SaaS-маркетинга. Много воздуха, минимум декора. Акцентный цвет только для primary action и успеха; ошибки — единственный красный. `[ASSUMPTION: направление выбрано автономно под 2-дневный MVP, пользователь может переопределить]`

## Colors

```yaml
colors:
  background: "#FFFFFF"
  surface: "#F8F9FA"        # карточки, зоны
  border: "#DEE2E6"
  text: "#212529"
  text-muted: "#6C757D"
  accent: "#2563EB"         # primary action, фокус
  success: "#16A34A"
  error: "#DC2626"
```

Контраст `text`/`background` и `text-muted`/`background` — WCAG AA. Красный используется **только** для ошибок.

## Typography

```yaml
typography:
  font: "'Inter', system-ui, sans-serif"   # system-ui fallback = ноль загрузки шрифта
  scale:
    h1: 1.5rem / 700      # название сервиса
    h2: 1.125rem / 600    # заголовки зон и карточек
    body: 1rem / 400      # основной текст, line-height 1.5
    small: 0.875rem / 400 # подписи, счётчики, микрокопия
```

## Layout & Spacing

```yaml
spacing:
  unit: 4px
  page-max-width: 960px   # центрированная колонка
  zone-gap: 32px          # между зонами IA
  field-gap: 16px         # между полями формы
  card-padding: 24px
```

## Elevation & Depth

Один уровень тени для карточек результатов и dropzone в hover/dragover. Без многослойных теней и модальных поверхностей (кроме системных диалогов браузера для скачивания).

## Shapes

```yaml
rounded:
  card: 12px
  button: 8px
  input: 8px
```

## Components

- **Primary button** — фон `{colors.accent}`, белый текст, скругление `{rounded.button}`; disabled = фон `{colors.border}` + текст `{colors.text-muted}`.
- **Dropzone** — пунктирная граница `{colors.border}` на фоне `{colors.surface}`; dragover/hover — граница `{colors.accent}`; ошибка — `{colors.error}`.
- **Textarea** — белая, на фоне `{colors.surface}`; граница `{colors.border}`, focus ring `{colors.accent}`.
- **Segmented control** — капсула `{colors.surface}`, активная опция — белый фон с тенью.
- **Stage tracker** — ✓ `{colors.success}`, ● спиннер `{colors.accent}`, ○ `{colors.border}`.
- **Document card** — `{colors.surface}`, тень уровня Elevation; кнопки скачивания: PDF = secondary (outline), DOCX = secondary.

## Do's and Don'ts

- ✅ Один акцентный цвет для действий на экране; ✅ ошибки inline у источника; ✅ системные шрифты как fallback.
- ❌ Никаких градиентов, иллюстраций и декоративных анимаций в MVP; ❌ красный вне ошибок; ❌ кастомные шрифты с загрузкой `[OPTIONAL: веб-шрифт после MVP]`.
