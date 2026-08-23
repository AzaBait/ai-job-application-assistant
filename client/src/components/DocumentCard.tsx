import { useState } from 'react'
import { documentExpandable, documentPreview } from '../lib/formState'

type Props = {
  title: string
  text: string
}

export default function DocumentCard({ title, text }: Props) {
  const [expanded, setExpanded] = useState(false)
  const expandable = documentExpandable(text)
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
    </article>
  )
}
