import { cpSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const wasmDir = join(dirname(require.resolve('pdfjs-dist/package.json')), 'wasm')
const dest = join(dirname(fileURLToPath(import.meta.url)), '../public/pdfjs/wasm')
rmSync(dest, { recursive: true, force: true })
cpSync(wasmDir, dest, { recursive: true })
console.log('pdfjs wasm copied to public/pdfjs/wasm')
