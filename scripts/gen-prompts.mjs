// Generates PROMPTS.md from the production source of truth:
// server/src/prompts/generate.ts. The prompt text is imported, never
// duplicated here — edit prompts in generate.ts and re-run this script.
// Run: npm run prompts
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function pathToFileUrl(p) {
  return 'file://' + p.replaceAll('\\', '/')
}
const { GENERATE_SYSTEM_PROMPT, TONE_INSTRUCTIONS } = await import(
  pathToFileUrl(join(ROOT, 'server/src/prompts/generate.ts'))
)

const tones = Object.entries(TONE_INSTRUCTIONS)
  .map(([tone, text]) => `- \`${tone}\` — ${text.replace(/^Тональность:\s*\S+\s*—\s*/, '')}`)
  .join('\n')

const md = `# PROMPTS.md

Промпты, которыми приложение вызывает LLM. Этот файл **генерируется** из
исходника \`server/src/prompts/generate.ts\` командой \`npm run prompts\` —
вручную не правится. Источник истины: \`server/src/prompts/generate.ts\`.

## System prompt

Отправляется как \`systemInstruction\` в каждом запросе \`POST /api/generate\`.

\`\`\`text
${GENERATE_SYSTEM_PROMPT}
\`\`\`

## Инструкции тональности (TONE_INSTRUCTIONS)

Одна из трёх строк добавляется в начало пользовательского сообщения
в зависимости от выбранной пользователем тональности:

${tones}

## User-content envelope

Пользовательское сообщение формируется функцией \`buildGenerateUserContent()\`
и содержит только три элемента — инструкции тональности и данные в тегах:

\`\`\`text
{инструкция тональности}

<resume>
{текст загруженного резюме пользователя}
</resume>

<vacancy>
{текст вакансии}
</vacancy>
\`\`\`

Системный промпт объявляет содержимое тегов данными, а не инструкциями
(защита от prompt injection). Ответ модели ограничен JSON-схемой
(\`responseSchema\`, см. \`shared/src/index.ts\`) и валидируется на клиенте.
`

writeFileSync(join(ROOT, 'PROMPTS.md'), md)
console.log(`PROMPTS.md сгенерирован (${md.length} байт) из server/src/prompts/generate.ts`)
