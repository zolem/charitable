import { Hono } from 'hono'
import { z } from 'zod'
import {
  createContactSchema,
  listContactsQuerySchema,
  updateContactSchema,
} from './schema.ts'
import {
  createContact,
  deleteContact,
  getContact,
  listContacts,
  updateContact,
} from './repository.ts'

const idParam = z.object({ id: z.string().uuid() })

export const contactsRouter = new Hono()

contactsRouter.get('/', (c) => {
  const raw = {
    q: c.req.query('q'),
    type: c.req.query('type'),
    lifecycleStage: c.req.query('lifecycleStage'),
    limit: c.req.query('limit'),
    cursor: c.req.query('cursor'),
  }
  const parsed = listContactsQuerySchema.safeParse(raw)
  if (!parsed.success) {
    return c.json(
      { ok: false, error: 'Invalid query', issues: parsed.error.issues },
      400,
    )
  }
  const result = listContacts(parsed.data)
  return c.json({ ok: true, ...result })
})

contactsRouter.post('/', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON body' }, 400)
  }
  const parsed = createContactSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { ok: false, error: 'Invalid contact', issues: parsed.error.issues },
      400,
    )
  }
  const contact = createContact(parsed.data)
  return c.json({ ok: true, contact }, 201)
})

contactsRouter.get('/:id', (c) => {
  const parsed = idParam.safeParse(c.req.param())
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Invalid id' }, 400)
  }
  const contact = getContact(parsed.data.id)
  if (!contact) return c.json({ ok: false, error: 'Not found' }, 404)
  return c.json({ ok: true, contact })
})

contactsRouter.patch('/:id', async (c) => {
  const idParsed = idParam.safeParse(c.req.param())
  if (!idParsed.success) {
    return c.json({ ok: false, error: 'Invalid id' }, 400)
  }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON body' }, 400)
  }
  const parsed = updateContactSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { ok: false, error: 'Invalid contact', issues: parsed.error.issues },
      400,
    )
  }
  const contact = updateContact(idParsed.data.id, parsed.data)
  if (!contact) return c.json({ ok: false, error: 'Not found' }, 404)
  return c.json({ ok: true, contact })
})

contactsRouter.delete('/:id', (c) => {
  const parsed = idParam.safeParse(c.req.param())
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Invalid id' }, 400)
  }
  const deleted = deleteContact(parsed.data.id)
  if (!deleted) return c.json({ ok: false, error: 'Not found' }, 404)
  return c.json({ ok: true })
})
