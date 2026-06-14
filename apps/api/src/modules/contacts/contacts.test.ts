import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { contactsRouter } from './routes.ts'
import { db } from '../../db.ts'

// Build a minimal app that mounts the contacts router at the same path as production
const app = new Hono()
app.route('/api/contacts', contactsRouter)

const json = (body: unknown) =>
  new Request('https://test.local', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const req = (method: string, path: string, body?: unknown) =>
  new Request(`https://test.local${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

beforeEach(() => {
  // Wipe contacts between tests (in-memory DB is shared within a worker)
  db.exec('DELETE FROM contacts')
})

// ---------------------------------------------------------------------------
// POST /api/contacts
// ---------------------------------------------------------------------------
describe('POST /api/contacts', () => {
  it('creates a contact with defaults', async () => {
    const res = await app.request(req('POST', '/api/contacts', { firstName: 'Alice' }))
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const contact = body.contact as Record<string, unknown>
    expect(contact.firstName).toBe('Alice')
    expect(contact.type).toBe('donor')
    expect(contact.lifecycleStage).toBe('lead')
    expect(contact.tags).toEqual([])
    expect(contact.emailOptIn).toBe(true)
    expect(contact.smsOptIn).toBe(false)
    expect(typeof contact.id).toBe('string')
    expect(typeof contact.createdAt).toBe('string')
  })

  it('creates a contact with all fields', async () => {
    const payload = {
      firstName: 'Bob',
      lastName: 'Smith',
      email: 'bob@example.com',
      phone: '+1-555-0100',
      type: 'volunteer',
      lifecycleStage: 'active',
      organization: 'Helping Hands',
      notes: 'Great volunteer',
      tags: ['weekly', 'driver'],
      emailOptIn: false,
      smsOptIn: true,
    }
    const res = await app.request(req('POST', '/api/contacts', payload))
    expect(res.status).toBe(201)
    const { contact } = (await res.json()) as { contact: Record<string, unknown> }
    expect(contact.firstName).toBe('Bob')
    expect(contact.lastName).toBe('Smith')
    expect(contact.email).toBe('bob@example.com')
    expect(contact.type).toBe('volunteer')
    expect(contact.lifecycleStage).toBe('active')
    expect(contact.organization).toBe('Helping Hands')
    expect(contact.tags).toEqual(['weekly', 'driver'])
    expect(contact.emailOptIn).toBe(false)
    expect(contact.smsOptIn).toBe(true)
  })

  it('normalises email to lowercase', async () => {
    const res = await app.request(
      req('POST', '/api/contacts', { firstName: 'Carol', email: 'CAROL@EXAMPLE.COM' }),
    )
    const { contact } = (await res.json()) as { contact: Record<string, unknown> }
    expect(contact.email).toBe('carol@example.com')
  })

  it('returns 400 on missing firstName', async () => {
    const res = await app.request(req('POST', '/api/contacts', { email: 'x@y.com' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(false)
  })

  it('returns 400 on invalid email', async () => {
    const res = await app.request(
      req('POST', '/api/contacts', { firstName: 'Dave', email: 'not-an-email' }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(false)
    expect(Array.isArray((body as Record<string, unknown[]>).issues)).toBe(true)
  })

  it('returns 400 on invalid type', async () => {
    const res = await app.request(
      req('POST', '/api/contacts', { firstName: 'Eve', type: 'alien' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 on invalid JSON', async () => {
    const res = await app.request(
      new Request('https://test.local/api/contacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{bad json',
      }),
    )
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// GET /api/contacts/:id
// ---------------------------------------------------------------------------
describe('GET /api/contacts/:id', () => {
  it('returns a contact by id', async () => {
    const createRes = await app.request(
      req('POST', '/api/contacts', { firstName: 'Alice' }),
    )
    const { contact: created } = (await createRes.json()) as {
      contact: Record<string, unknown>
    }
    const id = created.id as string

    const res = await app.request(req('GET', `/api/contacts/${id}`))
    expect(res.status).toBe(200)
    const { contact } = (await res.json()) as { contact: Record<string, unknown> }
    expect(contact.id).toBe(id)
    expect(contact.firstName).toBe('Alice')
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.request(
      req('GET', '/api/contacts/00000000-0000-0000-0000-000000000000'),
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 for non-uuid id', async () => {
    const res = await app.request(req('GET', '/api/contacts/not-a-uuid'))
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/contacts/:id
// ---------------------------------------------------------------------------
describe('PATCH /api/contacts/:id', () => {
  it('updates only provided fields, preserving the rest', async () => {
    const createRes = await app.request(
      req('POST', '/api/contacts', {
        firstName: 'Grace',
        type: 'volunteer',
        lifecycleStage: 'active',
        tags: ['tag1', 'tag2'],
        emailOptIn: false,
      }),
    )
    const { contact: created } = (await createRes.json()) as {
      contact: Record<string, unknown>
    }
    const id = created.id as string

    const res = await app.request(req('PATCH', `/api/contacts/${id}`, { notes: 'Updated' }))
    expect(res.status).toBe(200)
    const { contact } = (await res.json()) as { contact: Record<string, unknown> }

    // Updated field
    expect(contact.notes).toBe('Updated')
    // Preserved fields
    expect(contact.firstName).toBe('Grace')
    expect(contact.type).toBe('volunteer')
    expect(contact.lifecycleStage).toBe('active')
    expect(contact.tags).toEqual(['tag1', 'tag2'])
    expect(contact.emailOptIn).toBe(false)
  })

  it('can clear nullable fields by setting null', async () => {
    const createRes = await app.request(
      req('POST', '/api/contacts', {
        firstName: 'Henry',
        email: 'henry@example.com',
        tags: ['foo'],
      }),
    )
    const { contact: created } = (await createRes.json()) as {
      contact: Record<string, unknown>
    }
    const id = created.id as string

    const res = await app.request(
      req('PATCH', `/api/contacts/${id}`, { email: null, tags: [] }),
    )
    expect(res.status).toBe(200)
    const { contact } = (await res.json()) as { contact: Record<string, unknown> }
    expect(contact.email).toBeNull()
    expect(contact.tags).toEqual([])
  })

  it('sets updatedAt later than createdAt after a patch', async () => {
    const createRes = await app.request(
      req('POST', '/api/contacts', { firstName: 'Ivy' }),
    )
    const { contact: created } = (await createRes.json()) as {
      contact: Record<string, unknown>
    }
    const id = created.id as string

    const res = await app.request(req('PATCH', `/api/contacts/${id}`, { notes: 'hi' }))
    const { contact } = (await res.json()) as { contact: { updatedAt: string; createdAt: string } }
    expect(contact.updatedAt >= contact.createdAt).toBe(true)
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.request(
      req('PATCH', '/api/contacts/00000000-0000-0000-0000-000000000000', {
        notes: 'x',
      }),
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 on invalid type value', async () => {
    const createRes = await app.request(
      req('POST', '/api/contacts', { firstName: 'Jack' }),
    )
    const { contact } = (await createRes.json()) as { contact: Record<string, unknown> }
    const res = await app.request(
      req('PATCH', `/api/contacts/${contact.id as string}`, { type: 'ghost' }),
    )
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/contacts/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/contacts/:id', () => {
  it('deletes an existing contact', async () => {
    const createRes = await app.request(
      req('POST', '/api/contacts', { firstName: 'Kate' }),
    )
    const { contact } = (await createRes.json()) as { contact: Record<string, unknown> }
    const id = contact.id as string

    const delRes = await app.request(req('DELETE', `/api/contacts/${id}`))
    expect(delRes.status).toBe(200)
    const body = (await delRes.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)

    const getRes = await app.request(req('GET', `/api/contacts/${id}`))
    expect(getRes.status).toBe(404)
  })

  it('returns 404 when contact does not exist', async () => {
    const res = await app.request(
      req('DELETE', '/api/contacts/00000000-0000-0000-0000-000000000000'),
    )
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// GET /api/contacts  (list + filters + pagination)
// ---------------------------------------------------------------------------
describe('GET /api/contacts', () => {
  const seed = async () => {
    await app.request(
      req('POST', '/api/contacts', {
        firstName: 'Leo',
        email: 'leo@example.com',
        type: 'donor',
        lifecycleStage: 'active',
      }),
    )
    await app.request(
      req('POST', '/api/contacts', {
        firstName: 'Mia',
        type: 'volunteer',
        lifecycleStage: 'lead',
      }),
    )
    await app.request(
      req('POST', '/api/contacts', {
        firstName: 'Nina',
        type: 'donor',
        lifecycleStage: 'lapsed',
      }),
    )
  }

  it('returns all contacts unfiltered', async () => {
    await seed()
    const res = await app.request(req('GET', '/api/contacts'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; items: unknown[]; nextCursor: unknown }
    expect(body.ok).toBe(true)
    expect(body.items).toHaveLength(3)
    expect(body.nextCursor).toBeNull()
  })

  it('filters by type', async () => {
    await seed()
    const res = await app.request(req('GET', '/api/contacts?type=donor'))
    const body = (await res.json()) as { items: Array<Record<string, unknown>> }
    expect(body.items).toHaveLength(2)
    expect(body.items.every((c) => c.type === 'donor')).toBe(true)
  })

  it('filters by lifecycleStage', async () => {
    await seed()
    const res = await app.request(req('GET', '/api/contacts?lifecycleStage=lead'))
    const body = (await res.json()) as { items: Array<Record<string, unknown>> }
    expect(body.items).toHaveLength(1)
    expect((body.items[0] as Record<string, unknown>).firstName).toBe('Mia')
  })

  it('filters by search query (firstName)', async () => {
    await seed()
    const res = await app.request(req('GET', '/api/contacts?q=Leo'))
    const body = (await res.json()) as { items: Array<Record<string, unknown>> }
    expect(body.items).toHaveLength(1)
    expect((body.items[0] as Record<string, unknown>).firstName).toBe('Leo')
  })

  it('filters by search query (email)', async () => {
    await seed()
    const res = await app.request(req('GET', '/api/contacts?q=leo%40example.com'))
    const body = (await res.json()) as { items: Array<Record<string, unknown>> }
    expect(body.items).toHaveLength(1)
  })

  it('paginates with limit and cursor', async () => {
    await seed()
    const first = await app.request(req('GET', '/api/contacts?limit=2'))
    const firstBody = (await first.json()) as {
      items: Array<Record<string, unknown>>
      nextCursor: string
    }
    expect(firstBody.items).toHaveLength(2)
    expect(typeof firstBody.nextCursor).toBe('string')

    const second = await app.request(
      req('GET', `/api/contacts?limit=2&cursor=${firstBody.nextCursor}`),
    )
    const secondBody = (await second.json()) as {
      items: Array<Record<string, unknown>>
      nextCursor: unknown
    }
    expect(secondBody.items).toHaveLength(1)
    expect(secondBody.nextCursor).toBeNull()
  })

  it('returns 400 for invalid limit', async () => {
    const res = await app.request(req('GET', '/api/contacts?limit=999'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid type param', async () => {
    const res = await app.request(req('GET', '/api/contacts?type=alien'))
    expect(res.status).toBe(400)
  })

  it('returns empty list when no contacts exist', async () => {
    const res = await app.request(req('GET', '/api/contacts'))
    const body = (await res.json()) as { items: unknown[]; nextCursor: unknown }
    expect(body.items).toHaveLength(0)
    expect(body.nextCursor).toBeNull()
  })
})
