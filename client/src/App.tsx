import { useRef, useState } from 'react'
import type { Tone } from '@aja/shared'
import type { GenerateResponse } from '@aja/shared'
import Dropzone from './components/Dropzone'
import VacancyInput from './components/VacancyInput'
import ToneSelect from './components/ToneSelect'
import GenerateButton from './components/GenerateButton'
import { postGenerate } from './lib/api'
import { clampVacancy, formIssue } from './lib/formState'

export default function App() {
  const [resumeText, setResumeText] = useState<string | null>(null)
  const [vacancy, setVacancy] = useState({ text: '', overLimit: false })
  const [tone, setTone] = useState<Tone>('professional')
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropzoneZoneRef = useRef<HTMLDivElement>(null)

  // stale results must not survive input changes
  function invalidate() {
    setResult(null)
    setGenerateError(null)
  }

  async function handleGenerate() {
    if (!resumeText) return
    setGenerating(true)
    setGenerateError(null)
    const outcome = await postGenerate({ resumeText, vacancyText: vacancy.text, tone })
    if (outcome.kind === 'ok') {
      setResult(outcome.data)
    } else {
      setGenerateError(outcome.message)
    }
    setGenerating(false)
  }

  return (
    <>
      <header className="header">
        <div className="container">
          <h1>AI Job Application Assistant</h1>
          <p className="trust-line">
            Мы не добавляем факты, которых нет в вашем резюме
          </p>
        </div>
      </header>
      <main className="container">
        <section aria-label="Ввод" className="input-zone">
          <div ref={dropzoneZoneRef}>
            <Dropzone
              onAccepted={(parsed) => {
                setResumeText(parsed.text)
                textareaRef.current?.focus()
              }}
              onCleared={() => {
                setResumeText(null)
                invalidate()
                // the dropzone button remounts after the file chip unmounts
                requestAnimationFrame(() => {
                  dropzoneZoneRef.current?.querySelector<HTMLButtonElement>('.dropzone')?.focus()
                })
              }}
            />
          </div>
          <VacancyInput
            value={vacancy.text}
            overLimit={vacancy.overLimit}
            onChange={(text) => {
              setVacancy(clampVacancy(text))
              invalidate()
            }}
            textareaRef={textareaRef}
          />
          <ToneSelect
            value={tone}
            onChange={(t) => {
              setTone(t)
              invalidate()
            }}
          />
          <GenerateButton
            issue={formIssue(resumeText !== null, vacancy.text, vacancy.overLimit)}
            generating={generating}
            onClick={() => void handleGenerate()}
            error={generateError}
          />
          {result && (
            <p className="generate-hint" aria-live="polite">
              Документы готовы
            </p>
          )}
        </section>
      </main>
    </>
  )
}
