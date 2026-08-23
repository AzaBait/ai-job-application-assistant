import { useRef, useState } from 'react'
import type { Tone } from '@aja/shared'
import Dropzone from './components/Dropzone'
import VacancyInput from './components/VacancyInput'
import ToneSelect from './components/ToneSelect'
import GenerateButton from './components/GenerateButton'
import { clampVacancy, formIssue } from './lib/formState'

export default function App() {
  const [hasFile, setHasFile] = useState(false)
  const [vacancy, setVacancy] = useState({ text: '', overLimit: false })
  const [tone, setTone] = useState<Tone>('professional')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropzoneZoneRef = useRef<HTMLDivElement>(null)

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
              onAccepted={() => {
                setHasFile(true)
                textareaRef.current?.focus()
              }}
              onCleared={() => {
                setHasFile(false)
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
            onChange={(text) => setVacancy(clampVacancy(text))}
            textareaRef={textareaRef}
          />
          <ToneSelect value={tone} onChange={setTone} />
          <GenerateButton issue={formIssue(hasFile, vacancy.text, vacancy.overLimit)} />
        </section>
      </main>
    </>
  )
}
