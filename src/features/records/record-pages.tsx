import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-provider'
import { getSupabase } from '@/lib/supabase'
import {
  archiveRecord,
  deleteRecord,
  reactivateClient,
  getRecord,
  lookups,
  recordError,
  saveRecord,
  searchRecords,
  tableFor,
  type ClientRecord,
  type Kind,
  type LegalRecord,
} from './api'
import { ClientPicker } from './client-picker'
import { clientSchema, caseSchema, statusLabels, sideLabels } from './schema'

const title = (record: LegalRecord) => ('name' in record ? record.name : record.case_number)
const date = (value: string) => new Date(value).toLocaleString('pt-BR')
const labels = (kind: Kind) =>
  kind === 'client'
    ? { plural: 'Clientes', single: 'cliente', new: 'Novo cliente' }
    : { plural: 'Processos', single: 'processo', new: 'Novo processo' }
function Feedback({ message }: { message?: string }) {
  return message ? (
    <p className="feedback" role="alert">
      {message}
    </p>
  ) : null
}

export function RecordList({ kind }: { kind: Kind }) {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const status = params.get('status') ?? 'active'
  const page = Math.max(0, Math.floor(Number(params.get('page')) || 0))
  const client = params.get('client') ?? undefined
  const list = useQuery({
    queryKey: ['records', kind, query, status, page, client],
    queryFn: () => searchRecords(kind, query, status, page, client),
  })
  const text = labels(kind)
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setParams({
      q: String(values.get('q')).trim(),
      status: String(values.get('status')),
      ...(client ? { client } : {}),
    })
  }
  return (
    <>
      <span className="eyebrow">ESCRITÓRIO</span>
      <div className="section-heading">
        <h1>{text.plural}</h1>
        <Button asChild>
          <Link to={`/${tableFor(kind)}/new${client ? `?client=${client}` : ''}`}>{text.new}</Link>
        </Button>
      </div>
      <p className="muted">
        {kind === 'client'
          ? 'Pessoas e empresas atendidas pelo escritório.'
          : 'Acompanhe os processos, responsáveis e partes envolvidas.'}
      </p>
      <form key={`${query}-${status}`} onSubmit={search} className="admin-form record-search">
        <label>
          Buscar
          <input
            name="q"
            defaultValue={query}
            maxLength={160}
            placeholder={
              kind === 'client'
                ? 'Nome, e-mail ou CPF/CNPJ'
                : 'Número, identificador ou parte contrária'
            }
          />
        </label>
        <label>
          Situação
          <select name="status" defaultValue={status}>
            <option value="">Todas</option>
            {Object.entries(statusLabels)
              .filter(([key]) => kind === 'case' || ['active', 'archived'].includes(key))
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      {client && (
        <p>
          Exibindo processos do cliente selecionado. <Link to="/cases">Ver todos</Link>
        </p>
      )}
      {list.isPending && <p role="status">Carregando…</p>}
      <Feedback message={list.error?.message} />
      {list.data?.length === 0 && (
        <section className="admin-card">
          <h2>Nenhum {text.single} encontrado</h2>
          <p>Cadastre um novo registro ou ajuste a busca e a situação.</p>
        </section>
      )}
      <div className="record-grid">
        {list.data?.slice(0, 20).map((record) => (
          <article className="admin-card" key={record.id}>
            <span className={`status-tag status-${record.status}`}>
              {statusLabels[record.status]}
            </span>
            <h2>
              <Link to={`/${tableFor(kind)}/${record.id}`}>{title(record)}</Link>
            </h2>
            {'name' in record ? (
              <p className="muted">
                {record.person_type === 'company' ? 'Pessoa jurídica' : 'Pessoa física'}
                {record.email ? ` · ${record.email}` : ''}
              </p>
            ) : (
              <p className="muted">Parte contrária: {record.opposing_party || 'Não informada'}</p>
            )}
            <small>Atualizado em {date(record.updated_at)}</small>
          </article>
        ))}
      </div>
      <div className="action-row">
        <Button
          variant="outline"
          disabled={page === 0 || list.isFetching}
          onClick={() => {
            params.set('page', String(page - 1))
            setParams(params)
          }}
        >
          Anterior
        </Button>
        <span className="page-count">Página {page + 1}</span>
        <Button
          variant="outline"
          disabled={!list.data || list.data.length <= 20 || list.isFetching}
          onClick={() => {
            params.set('page', String(page + 1))
            setParams(params)
          }}
        >
          Próxima
        </Button>
      </div>
    </>
  )
}

export function RecordPage({ kind, creating = false }: { kind: Kind; creating?: boolean }) {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { profile } = useAuth()
  const cache = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(creating)
  const [action, setAction] = useState<'archive' | 'delete' | 'reactivate' | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const record = useQuery({
    queryKey: ['record', kind, id],
    queryFn: () => getRecord(kind, id),
    enabled: !creating,
    refetchOnWindowFocus: false,
  })
  const refs = useQuery({ queryKey: ['record-lookups'], queryFn: lookups })
  const current = record.data ?? undefined
  const linkedClientId =
    current && 'client_id' in current ? current.client_id : (params.get('client') ?? '')
  const linked = useQuery({
    queryKey: ['record', 'client', linkedClientId],
    queryFn: () => getRecord('client', linkedClientId),
    enabled: kind === 'case' && Boolean(linkedClientId),
  })
  async function invalidate() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['records'] }),
      cache.invalidateQueries({ queryKey: ['record'] }),
      cache.invalidateQueries({ queryKey: ['audit'] }),
    ])
  }
  if (!creating && record.isPending) return <p role="status">Carregando…</p>
  if (creating && kind === 'case' && linkedClientId && linked.isPending)
    return <p role="status">Carregando cliente…</p>
  if (!creating && (record.error || !current))
    return (
      <>
        <Feedback
          message={record.error?.message ?? 'Cadastro não encontrado ou acesso indisponível.'}
        />
        <Link to={`/${tableFor(kind)}`}>Voltar</Link>
      </>
    )
  const text = labels(kind)
  const area =
    current && 'legal_area_id' in current
      ? refs.data?.areas.find((a) => a.id === current.legal_area_id)?.name
      : undefined
  const responsible = refs.data?.people.find(
    (p) => p.id === current?.responsible_user_id,
  )?.full_name
  return (
    <>
      <Link to={`/${tableFor(kind)}`}>← {text.plural}</Link>
      <h1>{creating ? text.new : title(current!)}</h1>
      {current && (
        <span className={`status-tag status-${current.status}`}>
          {statusLabels[current.status]}
        </span>
      )}
      <Feedback message={message || record.error?.message || refs.error?.message} />
      {editing ? (
        <RecordForm
          key={current?.id ?? `new-${kind}`}
          kind={kind}
          record={current}
          refs={refs.data}
          initialClient={linked.data as ClientRecord | undefined}
          onCancel={() => (creating ? navigate(`/${tableFor(kind)}`) : setEditing(false))}
          onSaved={async (savedId) => {
            setEditing(false)
            setMessage('Cadastro salvo.')
            await invalidate()
            navigate(`/${tableFor(kind)}/${savedId}`, { replace: creating })
          }}
        />
      ) : (
        <>
          <section className="admin-card record-details">
            <dl>
              {current && 'name' in current ? (
                <>
                  <div>
                    <dt>Tipo</dt>
                    <dd>
                      {current.person_type === 'company' ? 'Pessoa jurídica' : 'Pessoa física'}
                    </dd>
                  </div>
                  <div>
                    <dt>CPF/CNPJ</dt>
                    <dd>{current.cpf_cnpj || 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt>E-mail</dt>
                    <dd>{current.email || 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt>Telefone</dt>
                    <dd>{current.phone || 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt>Endereço</dt>
                    <dd>{current.address || 'Não informado'}</dd>
                  </div>
                </>
              ) : current && 'client_id' in current ? (
                <>
                  <div>
                    <dt>Cliente</dt>
                    <dd>
                      <Link to={`/clients/${current.client_id}`}>
                        {linked.data && 'name' in linked.data ? linked.data.name : 'Abrir cliente'}
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt>Área jurídica</dt>
                    <dd>{area ?? 'Carregando…'}</dd>
                  </div>
                  <div>
                    <dt>Tribunal</dt>
                    <dd>{current.tribunal || 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt>Vara / unidade</dt>
                    <dd>{current.court_unit || 'Não informada'}</dd>
                  </div>
                  <div>
                    <dt>Posição do cliente</dt>
                    <dd>{sideLabels[current.client_side as keyof typeof sideLabels]}</dd>
                  </div>
                  <div>
                    <dt>Parte contrária</dt>
                    <dd>{current.opposing_party || 'Não informada'}</dd>
                  </div>
                </>
              ) : null}
              <div>
                <dt>Responsável</dt>
                <dd>
                  {responsible ??
                    (current?.responsible_user_id ? 'Integrante indisponível' : 'Não definido')}
                </dd>
              </div>
              <div>
                <dt>Observações</dt>
                <dd className="preserve-lines">{current?.notes || 'Nenhuma'}</dd>
              </div>
              <div>
                <dt>Atualizado</dt>
                <dd>{current && date(current.updated_at)}</dd>
              </div>
              {current?.archived_at && (
                <div>
                  <dt>Arquivado</dt>
                  <dd>{date(current.archived_at)}</dd>
                </div>
              )}
            </dl>
          </section>
          <div className="action-row">
            {current?.status !== 'archived' && (
              <Button
                onClick={() => {
                  setEditing(true)
                  setMessage('')
                }}
              >
                Editar {text.single}
              </Button>
            )}
            {kind === 'client' && (
              <Button asChild variant="outline">
                <Link to={`/cases?client=${id}&status=`}>Ver processos</Link>
              </Button>
            )}
            {current?.status !== 'archived' && profile?.role !== 'assistant' && (
              <Button
                variant="outline"
                onClick={() => {
                  setAction('archive')
                  setMessage('')
                }}
              >
                Arquivar {text.single}
              </Button>
            )}
            {profile?.role === 'admin' && kind === 'client' && current?.status === 'archived' && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setAction('reactivate')
                  setMessage('')
                }}
              >
                Reativar cliente
              </Button>
            )}
            {profile?.role === 'admin' && (
              <Button
                variant="dangerOutline"
                disabled={busy}
                onClick={() => {
                  setAction('delete')
                  setMessage('')
                }}
              >
                Excluir {text.single}
              </Button>
            )}
          </div>
          {action && current && (
            <section className="admin-card">
              <h2>
                {action === 'delete'
                  ? 'Excluir definitivamente'
                  : action === 'reactivate'
                    ? 'Reativar'
                    : 'Arquivar'}{' '}
                {text.single}
              </h2>
              <p>
                {action === 'delete'
                  ? `O cadastro de ${title(current)} será apagado definitivamente do banco. Esta ação não pode ser desfeita. O histórico de auditoria permanece. ${kind === 'client' ? 'Exclua ou transfira os processos vinculados antes de excluir este cliente.' : 'O cadastro do cliente será mantido.'}`
                  : action === 'reactivate'
                    ? 'O cliente voltará à lista de ativos e poderá ser editado e vinculado a novos processos. Os processos existentes mantêm suas situações.'
                    : 'O cadastro ficará disponível para consulta no histórico, sem edição. Os processos vinculados manterão suas situações.'}
              </p>
              <form
                key={action}
                onSubmit={async (event) => {
                  event.preventDefault()
                  const reason = String(new FormData(event.currentTarget).get('reason'))
                  setBusy(true)
                  setMessage('')
                  try {
                    if (action === 'delete') await deleteRecord(kind, current, reason)
                    else if (action === 'reactivate') await reactivateClient(current, reason)
                    else await archiveRecord(kind, current, reason)
                    const completed = action
                    setAction(null)
                    await invalidate()
                    if (completed === 'delete') navigate('/' + tableFor(kind), { replace: true })
                    else
                      setMessage(
                        completed === 'reactivate' ? 'Cliente reativado.' : 'Cadastro arquivado.',
                      )
                  } catch (error) {
                    setMessage((error as Error).message)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <label>
                  Justificativa
                  <textarea name="reason" required minLength={3} maxLength={500} />
                </label>
                {action === 'delete' && (
                  <label className="confirmation-check">
                    <input type="checkbox" required /> Entendo que esta exclusão é definitiva.
                  </label>
                )}
                <div className="action-row">
                  <Button
                    disabled={busy}
                    variant={action === 'delete' ? 'dangerOutline' : 'default'}
                  >
                    {action === 'delete'
                      ? 'Excluir definitivamente'
                      : action === 'reactivate'
                        ? 'Confirmar reativação'
                        : 'Confirmar arquivamento'}
                  </Button>
                  <Button
                    disabled={busy}
                    type="button"
                    variant="ghost"
                    onClick={() => setAction(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </>
  )
}

function RecordForm({
  kind,
  record,
  refs,
  initialClient,
  onSaved,
  onCancel,
}: {
  kind: Kind
  record?: LegalRecord
  refs?: Awaited<ReturnType<typeof lookups>>
  initialClient?: ClientRecord
  onSaved: (id: string) => Promise<void>
  onCancel: () => void
}) {
  const { profile } = useAuth()
  const cache = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [selectedClient, setSelectedClient] = useState(
    record && 'client_id' in record ? record.client_id : (initialClient?.id ?? ''),
  )
  function value(name: string, fallback = '') {
    return String((record as unknown as Record<string, unknown> | undefined)?.[name] ?? fallback)
  }
  function input(name: string, label: string, max: number, required = false, type = 'text') {
    return (
      <label key={name}>
        {label}
        <input
          name={name}
          defaultValue={value(name)}
          maxLength={max}
          required={required}
          type={type}
          aria-invalid={Boolean(fieldErrors[name])}
          aria-describedby={fieldErrors[name] ? `error-${name}` : undefined}
        />
        {fieldErrors[name] && (
          <span id={`error-${name}`} className="field-error">
            {fieldErrors[name]}
          </span>
        )}
      </label>
    )
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setFieldErrors({})
    const raw = Object.fromEntries(new FormData(event.currentTarget))
    const parsed = (kind === 'client' ? clientSchema : caseSchema).safeParse(raw)
    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      )
      setMessage('Confira os campos indicados.')
      return
    }
    setBusy(true)
    try {
      const id = await saveRecord(kind, parsed.data, record)
      await onSaved(id)
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="admin-card">
      <form onSubmit={submit}>
        <fieldset disabled={busy || !refs} className="record-fields">
          <legend>Dados do {labels(kind).single}</legend>
          {kind === 'client' ? (
            <>
              <label>
                Tipo de pessoa
                <select name="person_type" defaultValue={value('person_type', 'individual')}>
                  <option value="individual">Pessoa física</option>
                  <option value="company">Pessoa jurídica</option>
                </select>
              </label>
              {input('name', 'Nome / razão social', 160, true)}
              {input('cpf_cnpj', 'CPF/CNPJ (opcional)', 30)}
              {input('email', 'E-mail', 254, false, 'email')}
              {input('phone', 'Telefone', 40, false, 'tel')}
              {input('address', 'Endereço', 500)}
            </>
          ) : (
            <>
              <ClientPicker
                value={selectedClient}
                onChange={setSelectedClient}
                error={fieldErrors.client_id}
              />
              <div>
                {input('case_number', 'Número / identificador do processo', 100, true)}
                <p className="field-hint">
                  Aceita números CNJ e identificadores administrativos ou internos.
                </p>
              </div>
              {input('tribunal', 'Tribunal', 160)}
              {input('court_unit', 'Vara / unidade', 160)}
              <label>
                Área jurídica
                <select name="legal_area_id" required defaultValue={value('legal_area_id')}>
                  <option value="">Selecione</option>
                  {refs?.areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
                <span className="field-error">{fieldErrors.legal_area_id}</span>
              </label>
              <label>
                Posição do cliente
                <select name="client_side" defaultValue={value('client_side', 'claimant')}>
                  {Object.entries(sideLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {input('opposing_party', 'Parte contrária', 200)}
              <label>
                Situação
                <select name="status" defaultValue={value('status', 'active')}>
                  {Object.entries(statusLabels)
                    .filter(([key]) => key !== 'archived')
                    .map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          <label>
            {kind === 'case' ? 'Advogado responsável' : 'Responsável'}
            <select
              name="responsible_user_id"
              defaultValue={value('responsible_user_id')}
              required={kind === 'case'}
            >
              <option value="">{kind === 'case' ? 'Selecione' : 'Não definido'}</option>
              {refs?.people
                .filter(
                  (p) =>
                    p.id === record?.responsible_user_id ||
                    (p.is_active && (kind === 'client' || p.role !== 'assistant')),
                )
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name}
                    {!person.is_active ? ' (desativado)' : ''}
                  </option>
                ))}
              {record?.responsible_user_id &&
                !refs?.people.some((p) => p.id === record.responsible_user_id) && (
                  <option value={record.responsible_user_id}>
                    Responsável anterior (removido)
                  </option>
                )}
            </select>
            <span className="field-error">{fieldErrors.responsible_user_id}</span>
          </label>
          <label className="full-row">
            Observações
            <textarea name="notes" defaultValue={value('notes')} maxLength={10000} />
          </label>
        </fieldset>
        <Feedback message={message} />
        <div className="action-row">
          <Button disabled={busy || !refs}>{busy ? 'Salvando…' : 'Salvar'}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
      {kind === 'case' && profile?.role === 'admin' && (
        <details className="new-area">
          <summary>Cadastrar área jurídica</summary>
          <form
            className="admin-form"
            onSubmit={async (event) => {
              event.preventDefault()
              const form = event.currentTarget
              const name = String(new FormData(form).get('area'))
              setBusy(true)
              setMessage('')
              try {
                const { error } = await getSupabase().rpc('create_legal_area', { p_name: name })
                if (error) throw recordError(error)
                await cache.invalidateQueries({ queryKey: ['record-lookups'] })
                form.reset()
                setMessage('Área cadastrada. Selecione-a no formulário.')
              } catch (error) {
                setMessage((error as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            <label>
              Nome da área
              <input name="area" required minLength={2} maxLength={80} />
            </label>
            <Button disabled={busy}>Adicionar área</Button>
          </form>
        </details>
      )}
    </section>
  )
}
