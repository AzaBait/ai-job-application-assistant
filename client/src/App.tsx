import { useState } from 'react'
import Dropzone from './components/Dropzone'
import type { ParseOk } from './lib/parsers'

export default function App() {
  const [, setResume] = useState<ParseOk | null>(null)

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
        <Dropzone onAccepted={setResume} onCleared={() => setResume(null)} />
      </main>
    </>
  )
}
