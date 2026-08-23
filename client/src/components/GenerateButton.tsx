import { ISSUE_HINTS, type FormIssue } from '../lib/formState'

type Props = {
  issue: FormIssue
}

export default function GenerateButton({ issue }: Props) {
  const hintId = 'generate-hint'
  return (
    <section aria-label="Генерация">
      {/* onClick intentionally empty until Story 1.4 wires POST /api/generate */}
      <button type="button" className="generate-button" disabled={issue !== null} aria-describedby={issue ? hintId : undefined}>
        Сгенерировать
      </button>
      {issue && (
        <p id={hintId} className="generate-hint" aria-live="polite">
          {ISSUE_HINTS[issue]}
        </p>
      )}
    </section>
  )
}
