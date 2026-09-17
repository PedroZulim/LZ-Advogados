import { z } from 'zod'

const role = z.enum(['admin', 'lawyer', 'assistant'])
const userId = z.uuid()
const reason = z.string().trim().min(3).max(500)
export const adminRequest = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z.object({ action: z.literal('list_removed') }).strict(),
  z.object({ action: z.literal('readmit_member'), user_id: userId, role, reason }).strict(),
  z.object({ action: z.literal('sessions') }).strict(),
  z
    .object({
      action: z.literal('audit'),
      actor: z.union([z.uuid(), z.literal('')]).optional(),
      before: z.iso.datetime({ offset: true }).optional(),
      action_filter: z.string().max(80).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('invite'),
      email: z.email().trim().toLowerCase().max(254),
      full_name: z.string().trim().min(2).max(160),
      role,
    })
    .strict(),
  z.object({ action: z.literal('change_role'), user_id: userId, role, reason }).strict(),
  z
    .object({ action: z.literal('set_active'), user_id: userId, is_active: z.boolean(), reason })
    .strict(),
  z.object({ action: z.literal('revoke_sessions'), user_id: userId, reason }).strict(),
  z.object({ action: z.literal('remove_member'), user_id: userId, reason }).strict(),
  z
    .object({
      action: z.literal('revoke_own_sessions'),
      scope: z.enum(['all', 'others', 'current']),
    })
    .strict(),
])
export type AdminRequest = z.infer<typeof adminRequest>
