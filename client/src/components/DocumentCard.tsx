import { useState } from 'react'
import { documentExpandable, documentPreview } from '../lib/formState'
import { downloadDocument, type ExportKind } from '../lib/exporters'

type Props = {
  title: string
  text: string
  fileBase: string
}

const DOWNLOAD_BUTTONS: { kind: ExportKind; label: string }[] = [
  { kind: 'pdf', label: 'Скачать PDF' },
  { kind: 'docx', label: 'Скачать DOCX' },
]

export default function DocumentCard({ title, text, fileBase }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [busyKind, setBusyKind] = useState<ExportKind | null>(null)
  const [errors, setErrors] = useState<Partial<Record<ExportKind, string>>>({})
  const expandable = documentExpandable(text)

  async function handleDownload(kind: ExportKind) {
    if (busyKind) return
    setErrors((prev) => ({ ...prev, [kind]: undefined }))
    setBusyKind(kind)
    try {
      await downloadDocument(kind, fileBase, text)
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [kind]: e instanceof Error ? e.message : 'Не удалось собрать файл',
      }))
    } finally {
      setBusyKind(null)
    }
  }

  return (
    <article className="document-card">
      <h3 className="document-card-title">{title}</h3>
      <p className="document-card-text">{expanded ? text : documentPreview(text)}</p>
      {expandable && (
        <button
          type="button"
          className="document-card-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Свернуть' : 'Показать полностью'}
        </button>
      )}
      <div className="document-card-actions">
        {DOWNLOAD_BUTTONS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            className="btn-secondary-outline"
            disabled={busyKind !== null}
            aria-describedby={
              errors[kind] ? `${fileBase}-${kind}-export-error` : undefined
            }
            onClick={() => void handleDownload(kind)}
          >
            {label}
          </button>
        ))}
      </div>
      {DOWNLOAD_BUTTONS.map(({ kind }) =>
        errors[kind] ? (
          <p
            key={kind}
            id={`${fileBase}-${kind}-export-error`}
            className="document-card-error"
            role="alert"
          >
            {errors[kind]}
          </p>
        ) : null,
      )}
    </article>
  )
}
