import { z } from 'zod'

export const contactType = z.enum([
  'donor',
  'volunteer',
  'beneficiary',
  'partner',
  'staff',
  'other',
])
export type ContactType = z.infer<typeof contactType>

export const lifecycleStage = z.enum(['lead', 'active', 'lapsed', 'archived'])
export type LifecycleStage = z.infer<typeof lifecycleStage>

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional()

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email()
  .nullable()
  .optional()

export const createContactSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: optionalText(120),
  email,
  phone: optionalText(40),
  type: contactType.default('donor'),
  lifecycleStage: lifecycleStage.default('lead'),
  organization: optionalText(160),
  notes: optionalText(2000),
  tags: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  emailOptIn: z.boolean().default(true),
  smsOptIn: z.boolean().default(false),
})
export type CreateContactInput = z.infer<typeof createContactSchema>

export const updateContactSchema = z.object({
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: optionalText(120).optional(),
  email: email.optional(),
  phone: optionalText(40).optional(),
  type: contactType.optional(),
  lifecycleStage: lifecycleStage.optional(),
  organization: optionalText(160).optional(),
  notes: optionalText(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
  emailOptIn: z.boolean().optional(),
  smsOptIn: z.boolean().optional(),
})
export type UpdateContactInput = z.infer<typeof updateContactSchema>

export const listContactsQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  type: contactType.optional(),
  lifecycleStage: lifecycleStage.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().min(1).max(64).optional(),
})
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>
