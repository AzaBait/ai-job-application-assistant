import { useId, type RefObject } from 'react'
import { LIMITS, countChars } from '@aja/shared'

// no native maxLength: it counts UTF-16 units, the limit counts codepoints
type Props = {
  value: string
  overLimit: boolean
  onChange: (text: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  inlineError?: string | null
}

export default function VacancyInput({ value, overLimit, onChange, textareaRef, inlineError }: Props) {
  const counterId = useId()
  const errorId = useId()
  const count = countChars(value)
  const describedBy = inlineError ? `${counterId} ${errorId}` : counterId
  return (
    <section aria-label="Вакансия">
      <label htmlFor="vacancy-text" className="field-label">
        Текст вакансии
      </label>
      <textarea
        id="vacancy-text"
        ref={textareaRef}
        className="vacancy-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy}
        placeholder={
          'Должность: Frontend-разработчик\nОбязанности: разработка SPA, код-ревью\nТребования: React, TypeScript, опыт от 2 лет'
        }
      />
      <div id={counterId} className={`vacancy-counter${overLimit ? ' vacancy-counter-error' : ''}`}>
        {count.toLocaleString('ru-RU')} / {LIMITS.vacancyMaxChars.toLocaleString('ru-RU')}
      </div>
      {inlineError && (
        <p id={errorId} className="generate-error" role="alert">
          {inlineError}
        </p>
      )}
    </section>
  )
}
