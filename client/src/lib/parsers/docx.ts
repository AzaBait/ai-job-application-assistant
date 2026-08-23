import mammoth from 'mammoth'

export async function extractDocxText(data: ArrayBuffer): Promise<string> {
  const { value, messages } = await mammoth.extractRawText({ arrayBuffer: data })
  for (const warning of messages) console.warn('[mammoth]', warning.message)
  return value
}
