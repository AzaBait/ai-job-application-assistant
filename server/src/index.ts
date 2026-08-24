import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { Server } from 'node:http'
import { join } from 'node:path'
import { generateRoute } from './routes/generate.ts'
import { validateRoute } from './routes/validate.ts'

const app = new Hono()

app.get('/api/health', (c) => c.json({ ok: true, data: { status: 'up' } }))
app.route('/', generateRoute)
app.route('/', validateRoute)

const staticRoot = join(import.meta.dirname, '../../client/dist')
app.use('*', serveStatic({ root: staticRoot }))

const port = Number(process.env.PORT) || 3000

const server = serve(
  { fetch: app.fetch, hostname: '0.0.0.0', port },
  (info) => {
    console.log(`listening on http://${info.address}:${info.port}`)
  },
) as Server

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Порт занят: ${port}`)
  } else {
    console.error(err.message)
  }
  process.exit(1)
})
