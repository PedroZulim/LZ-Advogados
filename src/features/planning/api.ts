import { getSupabase } from '@/lib/supabase'

export type PlanningKind = 'event' | 'deadline'
export type Person = { id: string; full_name: string; role: string; is_active: boolean }
export type ClientOption = { id: string; name: string; status: string }
export type CaseOption = { id: string; case_number: string; status: string; client_id: string }
export type EventRecord = {
  id: string
  organization_id: string
  title: string
  description: string | null
  event_type: string
  owner_user_id: string
  client_id: string | null
  case_id: string | null
  starts_at: string
  ends_at: string | null
  all_day: boolean
  recurrence_type: string
  recurrence_until: string | null
  status: string
  created_by: string
  created_at: string
  updated_at: string
  cancelled_at: string | null
}
export type DeadlineRecord = {
  id: string
  organization_id: string
  case_id: string
  title: string
  description: string | null
  start_date: string
  due_date: string
  due_time: string | null
  owner_user_id: string
  priority: string
  status: string
  completion_note: string | null
  completed_at: string | null
  completed_by: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  created_by: string
  created_at: string
  updated_at: string
}
const messages: Record<string, string> = {
  access_denied: 'Você não possui permissão para realizar esta ação.',
  invalid_case: 'Selecione um processo válido do escritório.',
  invalid_client: 'Selecione um cliente válido do escritório.',
  invalid_owner: 'Selecione um responsável ativo.',
  invalid_participant: 'Todos os participantes precisam estar ativos no escritório.',
  invalid_time: 'O término deve ser posterior ao início.',
  invalid_date: 'A data final não pode ser anterior à data inicial.',
  invalid_recurrence: 'Informe até quando o evento se repete.',
  date_reason_required: 'A alteração da data exige uma justificativa entre 3 e 500 caracteres.',
  invalid_reason: 'Informe uma justificativa entre 3 e 500 caracteres.',
  invalid_transition: 'Essa mudança de situação não é permitida.',
  invalid_status: 'Essa situação não pode ser definida diretamente.',
  record_conflict: 'O cadastro mudou. Recarregue a página e tente novamente.',
}
export function planningError(error: { message: string; code?: string }) {
  return new Error(
    messages[error.message] ?? 'Não foi possível concluir. Confira os campos e sua conexão.',
  )
}
export async function planningLookups() {
  const [people, clients, cases] = await Promise.all([
    getSupabase()
      .from('profiles')
      .select('id,full_name,role,is_active')
      .eq('is_active', true)
      .order('full_name'),
    getSupabase().from('clients').select('id,name,status').eq('status', 'active').order('name'),
    getSupabase()
      .from('cases')
      .select('id,case_number,status,client_id')
      .neq('status', 'archived')
      .order('case_number'),
  ])
  if (people.error) throw planningError(people.error)
  if (clients.error) throw planningError(clients.error)
  if (cases.error) throw planningError(cases.error)
  return {
    people: people.data as Person[],
    clients: clients.data as ClientOption[],
    cases: cases.data as CaseOption[],
  }
}
export async function listEvents(from: string, to: string) {
  const { data, error } = await getSupabase().from('events').select('*').order('starts_at')
  if (error) throw planningError(error)
  const rangeStart = new Date(from)
  const rangeEnd = new Date(to)
  const expanded: EventRecord[] = []
  for (const event of data as EventRecord[]) {
    const original = new Date(event.starts_at)
    if (original >= rangeStart && original < rangeEnd) expanded.push(event)
    if (event.recurrence_type === 'none' || !event.recurrence_until) continue
    const end = event.ends_at ? new Date(event.ends_at) : null
    const until = new Date(`${event.recurrence_until}T23:59:59`)
    const cursor = new Date(original)
    for (let count = 0; count < 400; count += 1) {
      if (event.recurrence_type === 'daily') cursor.setDate(cursor.getDate() + 1)
      else if (event.recurrence_type === 'weekly') cursor.setDate(cursor.getDate() + 7)
      else cursor.setMonth(cursor.getMonth() + 1)
      if (cursor > until) break
      if (cursor >= rangeStart && cursor < rangeEnd) {
        const offset = cursor.getTime() - original.getTime()
        expanded.push({
          ...event,
          starts_at: cursor.toISOString(),
          ends_at: end ? new Date(end.getTime() + offset).toISOString() : null,
        })
      }
    }
  }
  return expanded.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}
export async function getEvent(id: string) {
  const { data, error } = await getSupabase().from('events').select('*').eq('id', id).maybeSingle()
  if (error) throw planningError(error)
  return data as EventRecord | null
}
export async function getParticipantIds(kind: 'event' | 'deadline', id: string) {
  const table = kind === 'event' ? 'event_participants' : 'deadline_participants'
  const column = kind === 'event' ? 'event_id' : 'deadline_id'
  const { data, error } = await getSupabase().from(table).select('user_id').eq(column, id)
  if (error) throw planningError(error)
  return data.map((row) => row.user_id as string)
}
export async function listDeadlines(status = '') {
  const { error: overdueError } = await getSupabase().rpc('mark_overdue_deadlines')
  if (overdueError) throw planningError(overdueError)
  let query = getSupabase().from('deadlines').select('*').order('due_date').order('due_time')
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw planningError(error)
  return data as DeadlineRecord[]
}
export async function getDeadline(id: string) {
  const { data, error } = await getSupabase()
    .from('deadlines')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw planningError(error)
  return data as DeadlineRecord | null
}
export async function saveEvent(
  data: Record<string, unknown>,
  id?: string,
  updatedAt?: string,
  reason?: string,
) {
  const { data: result, error } = await getSupabase().rpc('save_event', {
    p_data: data,
    p_id: id ?? null,
    p_updated_at: updatedAt ?? null,
    p_reason: reason ?? null,
  })
  if (error) throw planningError(error)
  return result as string
}
export async function cancelEvent(record: EventRecord, reason: string) {
  const { error } = await getSupabase().rpc('cancel_event', {
    p_id: record.id,
    p_updated_at: record.updated_at,
    p_reason: reason,
  })
  if (error) throw planningError(error)
}
export async function saveDeadline(
  data: Record<string, unknown>,
  id?: string,
  updatedAt?: string,
  reason?: string,
) {
  const { data: result, error } = await getSupabase().rpc('save_deadline', {
    p_data: data,
    p_id: id ?? null,
    p_updated_at: updatedAt ?? null,
    p_reason: reason ?? null,
  })
  if (error) throw planningError(error)
  return result as string
}
export async function deadlineAction(
  record: DeadlineRecord,
  action: 'complete' | 'reopen' | 'cancel',
  reason?: string,
  note?: string,
) {
  const { error } = await getSupabase().rpc('deadline_action', {
    p_id: record.id,
    p_action: action,
    p_updated_at: record.updated_at,
    p_reason: reason ?? null,
    p_note: note ?? null,
  })
  if (error) throw planningError(error)
}
