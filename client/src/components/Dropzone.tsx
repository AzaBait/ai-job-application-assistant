import { useEffect, useRef, useState } from 'react'
import type { ParseRejectionCode } from '@aja/shared'
import type { ParseOk } from '../lib/parsers'
import { parseResume } from '../lib/parsers'

const MESSAGES = {
  FILE_TOO_LARGE: 'Файл больше 5 МБ. Загрузите резюме в PDF или DOCX (до 5 МБ)',
  UNSUPPORTED_FORMAT: 'Этот формат не поддерживается. Загрузите резюме в PDF или DOCX (до 5 МБ)',
  PARSE_FAILED: 'Не удалось прочитать файл. Похоже, он повреждён — попробуйте другой PDF или DOCX',
} satisfies Record<ParseRejectionCode, string>

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} КБ`
    : `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

type Props = {
  onAccepted: (result: ParseOk) => void
  onCleared: () => void
}

export default function Dropzone({ onAccepted, onCleared }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)
  const [file, setFile] = useState<ParseOk | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const [dragover, setDragover] = useState(false)
  const [parsing, setParsing] = useState(false)

  // dropping outside the zone must not navigate the browser to the file
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  function fail(code: ParseRejectionCode, name?: string) {
    setFile(null)
    setError(MESSAGES[code])
    setAnnounce(name ? `${MESSAGES[code]}: ${name}` : MESSAGES[code])
  }

  async function handleFile(f: File) {
    const id = ++seq.current
    setError(null)
    setAnnounce('')
    setParsing(true)
    try {
      const result = await parseResume(f)
      if (seq.current !== id) return
      if (result.ok) {
        setError(null)
        setFile(result.value)
        setAnnounce(`Файл принят: ${f.name}`)
        onAccepted(result.value)
      } else {
        fail(result.code, f.name)
      }
    } catch {
      if (seq.current !== id) return
      fail('PARSE_FAILED', f.name)
    } finally {
      if (seq.current === id) setParsing(false)
    }
  }

  function handleFiles(files: FileList | undefined | null) {
    if (!files || files.length === 0) return
    if (files.length > 1) {
      fail('UNSUPPORTED_FORMAT')
      return
    }
    void handleFile(files[0])
  }

  function clear() {
    seq.current++
    setFile(null)
    setError(null)
    setAnnounce('')
    onCleared()
  }

  return (
    <section aria-label="Резюме">
      {file ? (
        <div className="dropzone-file">
          <span className="dropzone-name">
            {file.fileName} ({formatSize(file.sizeBytes)})
          </span>
          <button type="button" className="dropzone-clear" onClick={clear} aria-label="Заменить файл">
            ×
          </button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            onChange={(e) => {
              handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className={`dropzone${dragover ? ' dropzone-dragover' : ''}`}
            disabled={parsing}
            aria-describedby={error ? 'dropzone-error' : undefined}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragover(true)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragover(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDragover(false)
              handleFiles(e.dataTransfer.files)
            }}
          >
            {parsing
              ? 'Читаем файл…'
              : 'Перетащите резюме (PDF или DOCX) или нажмите, чтобы выбрать'}
          </button>
        </>
      )}
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      {error && (
        <p id="dropzone-error" role="alert" className="dropzone-error">
          {error}
        </p>
      )}
    </section>
  )
}
