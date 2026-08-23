// Node harness for Story 1.3 form-state logic: bundles client/src/lib/formState
// via Vite (SSR) and runs the spec's I/O matrix cases against the pure functions.
// Run: node scripts/check-form.mjs (after npm run build).
import assert from 'node:assert'
import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL as pathToFileUrl } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const OUT_DIR = join(ROOT, 'node_modules/.cache/form-check')

const { build } = await import('vite')
await build({
  root: join(ROOT, 'client'),
  logLevel: 'error',
  build: {
    ssr: 'src/lib/formState.ts',
    outDir: OUT_DIR,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'formState.mjs' } },
  },
})

try {
  const { clampVacancy, formIssue, ISSUE_HINTS, TONE_OPTIONS, toneDescription } = await import(
    pathToFileUrl(join(OUT_DIR, 'formState.mjs'))
  )
  // countChars/MIN live in shared; Node runs its TS directly
  const { countChars, MIN_VACANCY_CHARS } = await import('@aja/shared')

  const longText = 'а'.repeat(MIN_VACANCY_CHARS)
  const shortText = 'а'.repeat(MIN_VACANCY_CHARS - 1)

  // VALID_FORM
  {
    const issue = formIssue(true, longText, false)
    assert.equal(issue, null, 'VALID_FORM: button must be enabled')
    console.log('VALID_FORM: enabled')
  }

  // NO_FILE
  {
    const issue = formIssue(false, longText, false)
    assert.equal(issue, 'NO_FILE', 'NO_FILE: must be NO_FILE')
    assert.equal(ISSUE_HINTS[issue], 'Сначала загрузите резюме')
    console.log('NO_FILE:', ISSUE_HINTS[issue])
  }

  // SHORT_VACANCY (including whitespace-only padding)
  {
    const issue = formIssue(true, shortText, false)
    assert.equal(issue, 'SHORT_VACANCY', 'SHORT_VACANCY: must be SHORT_VACANCY')
    assert.equal(ISSUE_HINTS[issue], 'Опишите вакансию подробнее')
    console.log('SHORT_VACANCY:', ISSUE_HINTS[issue])

    const padded = `${' '.repeat(MIN_VACANCY_CHARS)}\n\t`
    assert.equal(
      formIssue(true, padded, false),
      'SHORT_VACANCY',
      'SHORT_VACANCY: whitespace-only text must not enable the button',
    )
    console.log('SHORT_VACANCY: whitespace-only rejected')
  }

  // OVER_LIMIT (raw over-limit input still reports OVER_LIMIT)
  {
    const raw = 'а'.repeat(10_500)
    const clamped = clampVacancy(raw)
    assert.equal(countChars(clamped.text), 10_000, 'OVER_LIMIT: input truncated to limit')
    assert.equal(clamped.overLimit, true, 'OVER_LIMIT: overLimit flag set')
    const issue = formIssue(true, clamped.text, clamped.overLimit)
    assert.equal(issue, 'OVER_LIMIT', 'OVER_LIMIT: button disabled after truncation')
    assert.equal(ISSUE_HINTS[issue], 'Сократите текст вакансии')
    console.log('OVER_LIMIT: truncated to 10 000,', ISSUE_HINTS[issue])
  }

  // BOUNDARY: exactly at the limit is valid; one over clamps
  {
    const atLimit = clampVacancy('а'.repeat(10_000))
    assert.equal(countChars(atLimit.text), 10_000, 'BOUNDARY: exactly 10 000 kept as-is')
    assert.equal(atLimit.overLimit, false, 'BOUNDARY: exactly 10 000 not flagged over-limit')
    assert.equal(formIssue(true, atLimit.text, atLimit.overLimit), null, 'BOUNDARY: enabled at exact limit')
    console.log('BOUNDARY: exactly 10 000 codepoints -> enabled')

    const raw10001 = `${'😀'}${'а'.repeat(10_000)}` // 10 001 codepoints (20 002 UTF-16 units)
    assert.equal(countChars(raw10001), 10_001, 'BOUNDARY: input is 10 001 codepoints')
    const clampedOver = clampVacancy(raw10001)
    assert.equal(countChars(clampedOver.text), 10_000, 'BOUNDARY: 10 001 clamps to 10 000')
    assert.equal(clampedOver.overLimit, true, 'BOUNDARY: clamp sets overLimit flag')
    console.log('BOUNDARY: 10 001 codepoints -> clamped to 10 000, overLimit set')
  }

  // TONE_SWITCH: option/description mapping is total and falls back safely
  {
    for (const o of TONE_OPTIONS) {
      assert.equal(toneDescription(o.value), o.description, `TONE_SWITCH: ${o.value} maps to its description`)
    }
    const values = new Set(TONE_OPTIONS.map((o) => o.value))
    assert.deepEqual(values, new Set(['professional', 'friendly', 'confident']), 'TONE_SWITCH: all three tones reachable')
    assert.equal(TONE_OPTIONS[0].value, 'professional', 'TONE_SWITCH: professional is the default first option')
    assert.equal(
      toneDescription('nope'),
      toneDescription('professional'),
      'TONE_SWITCH: unknown value falls back to professional description',
    )
    console.log('TONE_SWITCH: 3 options mapped, unknown falls back to professional')
  }

  // Codepoint counting + recovery after shortening
  {
    const emoji = '😀'.repeat(300)
    assert.equal(countChars('😀'), 1, 'codepoints: surrogate pair counts once')
    assert.equal(countChars(emoji), 300, 'codepoints: emoji string counted by codepoints')
    const recovered = { text: 'а'.repeat(250), overLimit: false }
    assert.equal(formIssue(true, recovered.text, recovered.overLimit), null, 'recovery: enabled again after shortening')
    console.log('CODEPOINTS+RECOVERY: ok')
  }

  console.log('form checks passed')
} finally {
  rmSync(OUT_DIR, { recursive: true, force: true })
}
