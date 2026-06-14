import { randomUUID } from 'node:crypto'
import { db } from '../../db.ts'
import type {
  CreateContactInput,
  ListContactsQuery,
  UpdateContactInput,
} from './schema.ts'

export interface ContactRow {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  type: string
  lifecycle_stage: string
  organization: string | null
  notes: string | null
  tags: string
  email_opt_in: number
  sms_opt_in: number
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
  phone: string | null
  type: string
  lifecycleStage: string
  organization: string | null
  notes: string | null
  tags: string[]
  emailOptIn: boolean
  smsOptIn: boolean
  createdAt: string
  updatedAt: string
}

const rowToContact = (row: ContactRow): Contact => ({
  id: row.id,
  firstName: row.first_name,
  lastName: row.last_name,
  email: row.email,
  phone: row.phone,
  type: row.type,
  lifecycleStage: row.lifecycle_stage,
  organization: row.organization,
  notes: row.notes,
  tags: JSON.parse(row.tags) as string[],
  emailOptIn: row.email_opt_in === 1,
  smsOptIn: row.sms_opt_in === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

interface ListResult {
  items: Contact[]
  nextCursor: string | null
}

const insertStmt = db.prepare(`
  INSERT INTO contacts (
    id, first_name, last_name, email, phone, type, lifecycle_stage,
    organization, notes, tags, email_opt_in, sms_opt_in
  ) VALUES (
    @id, @first_name, @last_name, @email, @phone, @type, @lifecycle_stage,
    @organization, @notes, @tags, @email_opt_in, @sms_opt_in
  )
`)

const getStmt = db.prepare<[string]>('SELECT * FROM contacts WHERE id = ?')

const deleteStmt = db.prepare<[string]>('DELETE FROM contacts WHERE id = ?')

const baseSelect = `
  SELECT * FROM contacts
`

export function createContact(input: CreateContactInput): Contact {
  const id = randomUUID()
  insertStmt.run({
    id,
    first_name: input.firstName,
    last_name: input.lastName ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    type: input.type,
    lifecycle_stage: input.lifecycleStage,
    organization: input.organization ?? null,
    notes: input.notes ?? null,
    tags: JSON.stringify(input.tags),
    email_opt_in: input.emailOptIn ? 1 : 0,
    sms_opt_in: input.smsOptIn ? 1 : 0,
  })
  const row = getStmt.get(id) as ContactRow | undefined
  if (!row) throw new Error('insert succeeded but row not found')
  return rowToContact(row)
}

export function getContact(id: string): Contact | null {
  const row = getStmt.get(id) as ContactRow | undefined
  return row ? rowToContact(row) : null
}

export function deleteContact(id: string): boolean {
  return deleteStmt.run(id).changes > 0
}

export function updateContact(id: string, input: UpdateContactInput): Contact | null {
  const existing = getContact(id)
  if (!existing) return null

  const next: CreateContactInput = {
    firstName: input.firstName ?? existing.firstName,
    lastName: input.lastName === undefined ? existing.lastName : input.lastName,
    email: input.email === undefined ? existing.email : input.email,
    phone: input.phone === undefined ? existing.phone : input.phone,
    type: input.type ?? (existing.type as CreateContactInput['type']),
    lifecycleStage:
      input.lifecycleStage ??
      (existing.lifecycleStage as CreateContactInput['lifecycleStage']),
    organization:
      input.organization === undefined ? existing.organization : input.organization,
    notes: input.notes === undefined ? existing.notes : input.notes,
    tags: input.tags ?? existing.tags,
    emailOptIn: input.emailOptIn ?? existing.emailOptIn,
    smsOptIn: input.smsOptIn ?? existing.smsOptIn,
  }

  db.prepare(`
    UPDATE contacts SET
      first_name = @first_name,
      last_name = @last_name,
      email = @email,
      phone = @phone,
      type = @type,
      lifecycle_stage = @lifecycle_stage,
      organization = @organization,
      notes = @notes,
      tags = @tags,
      email_opt_in = @email_opt_in,
      sms_opt_in = @sms_opt_in,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    first_name: next.firstName,
    last_name: next.lastName ?? null,
    email: next.email ?? null,
    phone: next.phone ?? null,
    type: next.type,
    lifecycle_stage: next.lifecycleStage,
    organization: next.organization ?? null,
    notes: next.notes ?? null,
    tags: JSON.stringify(next.tags),
    email_opt_in: next.emailOptIn ? 1 : 0,
    sms_opt_in: next.smsOptIn ? 1 : 0,
  })

  return getContact(id)
}

export function listContacts(query: ListContactsQuery): ListResult {
  const where: string[] = []
  const params: Record<string, unknown> = { limit: query.limit + 1 }

  if (query.type) {
    where.push('type = @type')
    params.type = query.type
  }
  if (query.lifecycleStage) {
    where.push('lifecycle_stage = @lifecycle_stage')
    params.lifecycle_stage = query.lifecycleStage
  }
  if (query.q) {
    where.push(
      `(first_name LIKE @q OR last_name LIKE @q OR email LIKE @q OR organization LIKE @q)`,
    )
    params.q = `%${query.q}%`
  }
  if (query.cursor) {
    where.push('id > @cursor')
    params.cursor = query.cursor
  }

  const sql =
    baseSelect +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY id ASC LIMIT @limit'

  const rows = db.prepare(sql).all(params) as ContactRow[]
  const hasMore = rows.length > query.limit
  const trimmed = hasMore ? rows.slice(0, query.limit) : rows
  const items = trimmed.map(rowToContact)
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null
  return { items, nextCursor }
}
