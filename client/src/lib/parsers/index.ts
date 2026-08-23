import type { ParseRejectionCode, ResumeSource } from '@aja/shared'
import { LIMITS } from '@aja/shared'
import { extractDocxText } from './docx'
import { extractPdfText } from './pdf'

export type ParseOk = ResumeSource & { sizeBytes: number; text: string }
export type ParseResult =
  | { ok: true; value: ParseOk }
  | { ok: false; code: ParseRejectionCode }

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] // %PDF
const DOCX_MAGIC = [0x50, 0x4b, 0x03, 0x04] // PK\x03\x04

function hasMagic(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((b, i) => bytes[i] === b)
}

export async function parseResume(file: File): Promise<ParseResult> {
  if (file.size > LIMITS.fileMaxBytes) {
    return { ok: false, code: 'FILE_TOO_LARGE' }
  }
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  if (hasMagic(head, PDF_MAGIC)) {
    const text = await extractPdfText(new Uint8Array(await file.arrayBuffer()))
    return { ok: true, value: { kind: 'pdf', fileName: file.name, sizeBytes: file.size, text } }
  }
  if (hasMagic(head, DOCX_MAGIC)) {
    const text = await extractDocxText(await file.arrayBuffer())
    return { ok: true, value: { kind: 'docx', fileName: file.name, sizeBytes: file.size, text } }
  }
  return { ok: false, code: 'UNSUPPORTED_FORMAT' }
}
