import { getSupabase } from '@/lib/supabase'

export type Kind = 'client' | 'case'
type Base = {
  id: string
  organization_id: string
  responsible_user_id: string | null
  notes: string | null
  status: string
  created_at: string
  updated_at: string
  archived_at: string | null
}
export type ClientRecord = Base & {
  person_type: string
  name: string
  cpf_cnpj: string | null
  email: string | null
  phone: string | null
  address: string | null
}
export type CaseRecord = Base & {
  client_id: string
  case_number: string
  case_number_normalized: string
  tribunal: string | null
  court_unit: string | null
  legal_area_id: string
  client_side: string
  opposing_party: string | null
}
export type LegalRecord = ClientRecord | CaseRecord
export const tableFor = (kind: Kind) => (kind === 'client' ? 'clients' : 'cases')
const errors: Record<string, string> = {
  client_has_cases:
    'Este cliente possui processos vinculados. Exclua ou transfira esses processos antes de excluir o cliente.',
  client_not_archived: 'Este cliente já está ativo. Atualize o cadastro.',
  access_denied: 'Você não possui permissão para realizar esta ação.',
  record_conflict:
    'Este cadastro foi alterado por outra pessoa. Recarregue a página e confira os dados antes de salvar.',
  record_archived: 'Este cadastro está arquivado e permanece disponível apenas para consulta.',
  invalid_responsible:
    'Selecione um responsável ativo do escritório. Processos exigem administrador ou advogado.',
  invalid_client: 'Selecione um cliente ativo do seu escritório.',
  invalid_area: 'Selecione uma área jurídica do seu escritório.',
  invalid_status: 'Selecione uma situação válida.',
  invalid_reason: 'Informe uma justificativa entre 3 e 500 caracteres.',
}
export function recordError(error: { message: string; code?: string }) {
  return new Error(
    errors[error.message] ??
      (error.code === '23505'
        ? 'Já existe um cadastro com esse nome.'
        : 'Não foi possível concluir. Confira os campos e sua conexão.'),
  )
}
export async function searchRecords(
  kind: Kind,
  query: string,
  status: string,
  page: number,
  client?: string,
) {
  const { data, error } = await getSupabase().rpc(`search_${tableFor(kind)}`, {
    p_query: query,
    p_status: status,
    p_offset: page * 20,
    ...(kind === 'case' ? { p_client: client ?? null } : {}),
  })
  if (error) throw recordError(error)
  return data as LegalRecord[]
}
export async function getRecord(kind: Kind, id: string) {
  const { data, error } = await getSupabase()
    .from(tableFor(kind))
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw recordError(error)
  return data as LegalRecord | null
}
export async function saveRecord(kind: Kind, values: Record<string, string>, record?: LegalRecord) {
  const { data, error } = await getSupabase().rpc(`save_${kind}`, {
    p_data: values,
    p_id: record?.id ?? null,
    p_updated_at: record?.updated_at ?? null,
  })
  if (error) throw recordError(error)
  return data as string
}
export async function archiveRecord(kind: Kind, record: LegalRecord, reason: string) {
  const { error } = await getSupabase().rpc('archive_record', {
    p_kind: kind,
    p_id: record.id,
    p_updated_at: record.updated_at,
    p_reason: reason,
  })
  if (error) throw recordError(error)
}
export async function deleteRecord(kind: Kind, record: LegalRecord, reason: string) {
  const { error } = await getSupabase().rpc('delete_record', {
    p_kind: kind,
    p_id: record.id,
    p_updated_at: record.updated_at,
    p_reason: reason,
  })
  if (error) throw recordError(error)
}
export async function reactivateClient(record: LegalRecord, reason: string) {
  const { error } = await getSupabase().rpc('reactivate_client', {
    p_id: record.id,
    p_updated_at: record.updated_at,
    p_reason: reason,
  })
  if (error) throw recordError(error)
}
export async function lookups() {
  const [people, areas] = await Promise.all([
    getSupabase().from('profiles').select('id, full_name, role, is_active').order('full_name'),
    getSupabase().from('legal_areas').select('id, name').order('name'),
  ])
  if (people.error) throw recordError(people.error)
  if (areas.error) throw recordError(areas.error)
  return {
    people: people.data as { id: string; full_name: string; role: string; is_active: boolean }[],
    areas: areas.data as { id: string; name: string }[],
  }
}
