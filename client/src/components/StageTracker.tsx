import { stageProgress, type StagePhase } from '../lib/formState'

const STAGES = ['Анализ резюме', 'Анализ вакансии', 'Генерация результата']

type Props = {
  phase: StagePhase
  elapsedMs: number
}

export default function StageTracker({ phase, elapsedMs }: Props) {
  const { done, active } = stageProgress(phase, elapsedMs)
  return (
    <div>
      <span className="sr-only" aria-live="polite">
        {active === null ? '' : `${STAGES[active]}…`}
      </span>
      <ol className="stage-tracker" aria-label="Прогресс генерации">
        {STAGES.map((label, i) => {
          const isDone = i < done
          const isActive = i === active
          return (
            <li key={label} className={isDone ? 'stage-done' : isActive ? 'stage-active' : 'stage-pending'} aria-current={isActive ? 'step' : undefined}>
              <span className="stage-marker" aria-hidden="true">
                {isDone ? '✓' : isActive ? <span className="stage-spinner" /> : '○'}
              </span>
              <span>{isActive ? `${label}…` : label}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
