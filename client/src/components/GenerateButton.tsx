import { ISSUE_HINTS, type FormIssue } from '../lib/formState'

type Props = {
  issue: FormIssue
  generating: boolean
  onClick: () => void
  error: string | null
}

export default function GenerateButton({ issue, generating, onClick, error }: Props) {
  const hintId = 'generate-hint'
  return (
    <section aria-label="Генерация">
      <button
        type="button"
        className="generate-button"
        disabled={issue !== null || generating}
        aria-describedby={issue ? hintId : undefined}
        onClick={onClick}
      >
        {generating ? 'Генерируем…' : 'Сгенерировать'}
      </button>
      {error && !generating && (
        <p className="generate-error" role="alert">
          {error}
        </p>
      )}
      {issue && (
        <p id={hintId} className="generate-hint" aria-live="polite">
          {ISSUE_HINTS[issue]}
        </p>
      )}
    </section>
  )
}
