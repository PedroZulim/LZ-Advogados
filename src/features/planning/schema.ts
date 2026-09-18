import { z } from 'zod'

const optionalUuid = z.union([z.uuid(), z.literal('')])
export const eventSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(10000),
    event_type: z.enum(['hearing', 'meeting', 'call', 'task', 'appointment', 'other']),
    owner_user_id: z.uuid(),
    client_id: optionalUuid,
    case_id: optionalUuid,
    starts_at: z.string().min(1),
    ends_at: z.string(),
    all_day: z.string(),
    recurrence_type: z.enum(['none', 'daily', 'weekly', 'monthly']),
    recurrence_until: z.string(),
    participant_ids: z.string(),
  })
  .strict()
export const deadlineSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(10000),
    case_id: z.uuid(),
    start_date: z.string().min(1),
    due_date: z.string().min(1),
    due_time: z.string(),
    owner_user_id: z.uuid(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
    status: z.enum(['pending', 'in_progress', 'overdue']),
    participant_ids: z.string(),
    reason: z.string(),
  })
  .strict()
export const eventTypes = {
  hearing: 'Audiência',
  meeting: 'Reunião',
  call: 'Ligação',
  task: 'Tarefa',
  appointment: 'Compromisso',
  other: 'Outro',
}
export const priorities = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' }
export const deadlineStatuses = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  overdue: 'Vencido',
}
