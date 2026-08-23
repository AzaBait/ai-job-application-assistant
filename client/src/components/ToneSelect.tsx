import type { Tone } from '@aja/shared'
import { TONE_OPTIONS, toneDescription } from '../lib/formState'

type Props = {
  value: Tone
  onChange: (tone: Tone) => void
}

export default function ToneSelect({ value, onChange }: Props) {
  return (
    <section aria-label="Тональность">
      <span className="field-label" id="tone-label">
        Тональность
      </span>
      <div className="segmented" role="group" aria-labelledby="tone-label">
        {TONE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`segmented-option${o.value === value ? ' segmented-option-active' : ''}`}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="tone-description">{toneDescription(value)}</p>
    </section>
  )
}
