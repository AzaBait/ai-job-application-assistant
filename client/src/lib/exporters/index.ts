import { parseDocumentStructure } from '../formState'
import { buildDocx } from './docx'
import { buildPdf, loadNotoSans } from './pdf'

export type ExportKind = 'pdf' | 'docx'

export async function downloadDocument(
  kind: ExportKind,
  fileBase: string,
  text: string,
): Promise<void> {
  const blocks = parseDocumentStructure(text)
  if (blocks.length === 0) throw new Error('Документ пуст — нечего скачивать')
  const docKind: 'resume' | 'letter' = fileBase === 'cover-letter' ? 'letter' : 'resume'
  const blob =
    kind === 'pdf'
      ? new Blob([await buildPdf(blocks, docKind, await loadNotoSans())] as BlobPart[], {
          type: 'application/pdf',
        })
      : await buildDocx(blocks, docKind)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileBase}.${kind}`
  a.click()
  // delayed revoke: Safari/Chrome cancel downloads whose blob URL dies
  // synchronously after click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
