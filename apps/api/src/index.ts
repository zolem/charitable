import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { pino } from 'pino'
import { contactsRouter } from './modules/contacts/routes.ts'

const log = pino({ name: 'api' })

const app = new Hono()

app.onError((err, c) => {
  log.error({ err, path: c.req.path, method: c.req.method }, 'unhandled error')
  return c.json({ ok: false, error: 'Internal Server Error' }, 500)
})

app.get('/', (c) => c.json({ ok: true, message: 'Charitable API' }))

app.get('/healthz', (c) => c.json({ ok: true, status: 'live' }))

app.get('/readyz', (c) => c.json({ ok: true, status: 'ready' }))

app.route('/api/contacts', contactsRouter)

const rawPort = process.env.PORT
const parsedPort = rawPort !== undefined ? Number(rawPort) : NaN
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3001

const server = serve({ fetch: app.fetch, port }, (info) => {
  log.info({ address: info.address, port: info.port }, 'api listening')
})

const shutdown = (signal: string) => {
  log.info({ signal }, 'shutting down')
  server.close(() => {
    log.info('server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
