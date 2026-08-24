import { useEffect, useRef, useState } from 'react'
import type { Tone } from '@aja/shared'
import type { GenerateResponse } from '@aja/shared'
import Dropzone from './components/Dropzone'
import VacancyInput from './components/VacancyInput'
import ToneSelect from './components/ToneSelect'
import GenerateButton from './components/GenerateButton'
import StageTracker from './components/StageTracker'
import DocumentCard from './components/DocumentCard'
import { postGenerate, postValidateVacancy, type GenerateResult } from './lib/api'
import { VACANCY_INVALID_MESSAGE, clampVacancy, formIssue } from './lib/formState'

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export default function App() {
  const [resumeText, setResumeText] = useState<string | null>(null)
  const [vacancy, setVacancy] = useState({ text: '', overLimit: false })
  const [tone, setTone] = useState<Tone>('professional')
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [vacancyError, setVacancyError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropzoneZoneRef = useRef<HTMLDivElement>(null)
  const trackerRef = useRef<HTMLElement>(null)
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null)
  // synchronous guards: state flushes are async, refs are not
  const busyRef = useRef(false) // blocks re-entry before generating=true paints
  const genSeqRef = useRef(0) // bumped on every run start AND input change
  const activeRunRef = useRef(0) // id of the run that owns the UI

  // scroll to the tracker as soon as the generating phase mounts it
  useEffect(() => {
    if (!generating) return
    trackerRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
    const startedAt = Date.now()
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 200)
    return () => clearInterval(timer)
  }, [generating])

  // focus + scroll to Zone 3 heading when results appear
  useEffect(() => {
    if (!result) return
    resultsHeadingRef.current?.focus()
    resultsHeadingRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
  }, [result])

  // stale results must not survive input changes; also discards in-flight outcomes
  function invalidate() {
    genSeqRef.current++
    setResult(null)
    setGenerateError(null)
    setVacancyError(null)
  }

  async function handleGenerate() {
    if (!resumeText || busyRef.current) return
    busyRef.current = true
    const id = ++genSeqRef.current
    activeRunRef.current = id
    setResult(null)
    setGenerateError(null)
    setVacancyError(null)
    setElapsed(0) // sync with start: tracker never mounts with a stale elapsed
    setGenerating(true)

    // tracker stays timer-driven (Story 1.5); validation is a client step
    // INSIDE the generating window, its outcome never touches stage labels
    const superseded = () => id !== genSeqRef.current || id !== activeRunRef.current
    // postValidateVacancy always resolves (transport errors are outcomes)
    const validation = await postValidateVacancy({ vacancyText: vacancy.text })
    if (superseded()) {
      if (activeRunRef.current === id) {
        activeRunRef.current = 0
        setGenerating(false)
      }
      busyRef.current = false
      return
    }
    if (!(validation.kind === 'ok' && validation.valid)) {
      if (validation.kind === 'ok') {
        // VACANCY_INVALID: pipeline stops before generation; input untouched
        setVacancyError(VACANCY_INVALID_MESSAGE)
      } else {
        // transport error surfaces like Story 1.4, never as a vacancy refusal
        setGenerateError(validation.message)
      }
      activeRunRef.current = 0
      busyRef.current = false
      setGenerating(false)
      return
    }

    let outcome: GenerateResult
    try {
      outcome = await postGenerate({ resumeText, vacancyText: vacancy.text, tone })
    } catch {
      outcome = {
        kind: 'error',
        code: 'LLM_UNAVAILABLE',
        message: 'Сервис генерации временно недоступен',
      }
    }
    if (superseded()) {
      // superseded by input change or a newer run; unwind only if no newer run owns the UI
      if (activeRunRef.current === id) {
        activeRunRef.current = 0
        setGenerating(false)
      }
      busyRef.current = false
      return
    }
    activeRunRef.current = 0
    busyRef.current = false
    if (outcome.kind === 'ok') {
      setResult(outcome.data)
    } else {
      setGenerateError(outcome.message) // tracker unmounts: generating=false, result=null
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
            inlineError={vacancyError}
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
          {(generating || result) && (
            <section ref={trackerRef}>
              <StageTracker phase={generating ? 'generating' : 'success'} elapsedMs={elapsed} />
            </section>
          )}
        </section>
        {result && (
          <section aria-label="Результаты" className="results-zone">
            <h2 ref={resultsHeadingRef} tabIndex={-1}>
              Результаты
            </h2>
            <p className="trust-line">
              Мы не добавляем факты, которых нет в вашем резюме
            </p>
            <DocumentCard title="Адаптированное резюме" text={result.adaptedResume} fileBase="resume-tailored" />
            <DocumentCard title="Сопроводительное письмо" text={result.coverLetter} fileBase="cover-letter" />
          </section>
        )}
      </main>
    </>
  )
}
