import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  cancelEvent,
  deadlineAction,
  getDeadline,
  getEvent,
  getParticipantIds,
  listDeadlines,
  listEvents,
  planningLookups,
  saveDeadline,
  saveEvent,
  type DeadlineRecord,
  type EventRecord,
} from './api'
import { deadlineSchema, deadlineStatuses, eventSchema, eventTypes, priorities } from './schema'

const iso = (date: Date) => date.toISOString()
const dateOnly = (date: Date) => date.toISOString().slice(0, 10)
const displayDate = (value: string) =>
  new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`).toLocaleDateString('pt-BR')
const displayDateTime = (value: string) => new Date(value).toLocaleString('pt-BR')
const today = dateOnly(new Date())
const localInput = (value: string) => {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const utcValue = (value: string) => new Date(value).toISOString()
function Feedback({ message }: { message?: string }) {
  return message ? (
    <p className="feedback" role="alert">
      {message}
    </p>
  ) : null
}
function rangeFor(view: string, selected: string) {
  const date = new Date(`${selected}T12:00:00`)
  if (view === 'day')
    return [new Date(`${selected}T00:00:00`), new Date(`${selected}T23:59:59`)] as const
  if (view === 'week') {
    const day = date.getDay() || 7
    const from = new Date(date)
    from.setDate(date.getDate() - day + 1)
    from.setHours(0, 0, 0, 0)
    const to = new Date(from)
    to.setDate(from.getDate() + 7)
    return [from, to] as const
  }
  const from = new Date(date.getFullYear(), date.getMonth(), 1)
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return [from, to] as const
}
function eventLabel(event: EventRecord) {
  return `${event.all_day ? '' : new Date(event.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ${event.title}`.trim()
}
function Participants({
  people,
  selected,
  setSelected,
}: {
  people: Awaited<ReturnType<typeof planningLookups>>['people']
  selected: string[]
  setSelected: (value: string[]) => void
}) {
  return (
    <fieldset className="participant-picker">
      <legend>Participantes</legend>
      <div className="participant-grid">
        {people.map((person) => (
          <label key={person.id}>
            <input
              type="checkbox"
              checked={selected.includes(person.id)}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, person.id]
                    : selected.filter((id) => id !== person.id),
                )
              }
            />{' '}
            {person.full_name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function CalendarPage() {
  const [view, setView] = useState('month')
  const [selected, setSelected] = useState(today)
  const [from, to] = rangeFor(view, selected)
  const events = useQuery({
    queryKey: ['events', view, selected],
    queryFn: () => listEvents(iso(from), iso(to)),
  })
  const deadlines = useQuery({
    queryKey: ['deadlines', 'calendar', view, selected],
    queryFn: () => listDeadlines(),
  })
  const visibleDeadlines = (deadlines.data ?? []).filter(
    (item) => item.due_date >= dateOnly(from) && item.due_date < dateOnly(to),
  )
  const days = useMemo(() => {
    const result: Date[] = []
    const cursor = new Date(from)
    while (cursor < to) {
      result.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    return result
  }, [from, to])
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">ORGANIZAÇÃO</span>
          <h1>Agenda</h1>
        </div>
        <Button asChild>
          <Link to="/events/new">Novo evento</Link>
        </Button>
      </div>
      <p className="muted">Compromissos, audiências, reuniões e tarefas do escritório.</p>
      <div className="calendar-toolbar">
        <label>
          Data
          <input
            type="date"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          />
        </label>
        <div className="action-row">
          <Button
            variant={view === 'month' ? 'default' : 'outline'}
            onClick={() => setView('month')}
          >
            Mês
          </Button>
          <Button variant={view === 'week' ? 'default' : 'outline'} onClick={() => setView('week')}>
            Semana
          </Button>
          <Button variant={view === 'day' ? 'default' : 'outline'} onClick={() => setView('day')}>
            Dia
          </Button>
          <Button variant="outline" onClick={() => setView('list')}>
            Lista
          </Button>
        </div>
      </div>
      <Feedback message={events.error?.message || deadlines.error?.message} />
      {view === 'month' ? (
        <div className="calendar-grid">
          {days.map((day) => {
            const key = dateOnly(day)
            const dayEvents = (events.data ?? []).filter(
              (event) => dateOnly(new Date(event.starts_at)) === key,
            )
            const dayDeadlines = visibleDeadlines.filter((item) => item.due_date === key)
            return (
              <article className={`calendar-day ${key === today ? 'today' : ''}`} key={key}>
                <strong>
                  {day.getDate()} {day.toLocaleDateString('pt-BR', { month: 'short' })}
                </strong>
                {dayEvents.map((event) => (
                  <Link
                    className="calendar-item event-item"
                    key={`${event.id}-${event.starts_at}`}
                    to={`/events/${event.id}`}
                  >
                    {eventLabel(event)}
                  </Link>
                ))}
                {dayDeadlines.map((item) => (
                  <Link
                    className={`calendar-item deadline-item priority-${item.priority}`}
                    key={item.id}
                    to={`/deadlines/${item.id}`}
                  >
                    Prazo: {item.title}
                  </Link>
                ))}
              </article>
            )
          })}
        </div>
      ) : (
        <section className="admin-card planning-list">
          {(events.data ?? []).map((event) => (
            <Link
              className="planning-row"
              key={`${event.id}-${event.starts_at}`}
              to={`/events/${event.id}`}
            >
              <span>{displayDateTime(event.starts_at)}</span>
              <strong>{event.title}</strong>
              <small>{eventTypes[event.event_type as keyof typeof eventTypes]}</small>
            </Link>
          ))}
          {visibleDeadlines.map((item) => (
            <Link className="planning-row" key={item.id} to={`/deadlines/${item.id}`}>
              <span>{displayDate(item.due_date)}</span>
              <strong>{item.title}</strong>
              <small>
                Prazo · {deadlineStatuses[item.status as keyof typeof deadlineStatuses]}
              </small>
            </Link>
          ))}
          {!events.data?.length && !visibleDeadlines.length && (
            <p>Nenhum compromisso ou prazo neste período.</p>
          )}
        </section>
      )}
    </>
  )
}

export function DeadlineList() {
  const [status, setStatus] = useState('')
  const deadlines = useQuery({
    queryKey: ['deadlines', status],
    queryFn: () => listDeadlines(status),
  })
  const now = Date.now()
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">CONTROLE OPERACIONAL</span>
          <h1>Prazos</h1>
        </div>
        <Button asChild>
          <Link to="/deadlines/new">Novo prazo</Link>
        </Button>
      </div>
      <p className="muted">Acompanhe datas limite, responsáveis, prioridades e conclusões.</p>
      <div className="record-search">
        <label>
          Situação
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todas</option>
            {Object.entries(deadlineStatuses).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Feedback message={deadlines.error?.message} />
      <div className="record-grid">
        {deadlines.data?.map((item) => {
          const overdue =
            !['completed', 'cancelled'].includes(item.status) &&
            new Date(`${item.due_date}T${item.due_time || '23:59:59'}`).getTime() < now
          const label = overdue ? 'overdue' : item.status
          return (
            <article className="admin-card" key={item.id}>
              <span className={`status-tag status-${label}`}>
                {deadlineStatuses[label as keyof typeof deadlineStatuses]}
              </span>
              <h2>
                <Link to={`/deadlines/${item.id}`}>{item.title}</Link>
              </h2>
              <p className={`priority priority-${item.priority}`}>
                {priorities[item.priority as keyof typeof priorities]}
              </p>
              <p className="muted">
                Vencimento: {displayDate(item.due_date)}
                {item.due_time ? ` às ${item.due_time.slice(0, 5)}` : ''}
              </p>
              <small>Atualizado em {displayDateTime(item.updated_at)}</small>
            </article>
          )
        })}
      </div>
      {deadlines.data?.length === 0 && (
        <section className="admin-card">
          <p>Nenhum prazo encontrado.</p>
        </section>
      )}
    </>
  )
}

export function DashboardPlanning() {
  const deadlines = useQuery({
    queryKey: ['deadlines', 'dashboard'],
    queryFn: () => listDeadlines(),
  })
  const events = useQuery({
    queryKey: ['events', 'dashboard'],
    queryFn: () => listEvents(new Date().toISOString(), iso(new Date(Date.now() + 30 * 86400000))),
  })
  const upcoming = (deadlines.data ?? [])
    .filter((item) => !['completed', 'cancelled'].includes(item.status))
    .slice(0, 5)
  return (
    <section className="planning-dashboard">
      <div className="section-heading">
        <h2>Próximos compromissos e prazos</h2>
        <div className="action-row">
          <Button asChild variant="outline">
            <Link to="/calendar">Abrir agenda</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/deadlines">Ver prazos</Link>
          </Button>
        </div>
      </div>
      <div className="planning-summary">
        <div>
          <strong>{events.data?.length ?? 0}</strong>
          <span>eventos nos próximos 30 dias</span>
        </div>
        <div>
          <strong>{upcoming.length}</strong>
          <span>prazos em aberto próximos</span>
        </div>
      </div>
      <div className="planning-list">
        {upcoming.map((item) => (
          <Link className="planning-row" key={item.id} to={`/deadlines/${item.id}`}>
            <span>{displayDate(item.due_date)}</span>
            <strong>{item.title}</strong>
            <small>{priorities[item.priority as keyof typeof priorities]}</small>
          </Link>
        ))}
        {!upcoming.length && <p className="muted">Nenhum prazo em aberto próximo.</p>}
      </div>
    </section>
  )
}

export function EventPage({ creating = false }: { creating?: boolean }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const cache = useQueryClient()
  const current = useQuery({
    queryKey: ['event', id],
    queryFn: () => getEvent(id),
    enabled: !creating,
  })
  const refs = useQuery({ queryKey: ['planning-lookups'], queryFn: planningLookups })
  const participants = useQuery({
    queryKey: ['event-participants', id],
    queryFn: () => getParticipantIds('event', id),
    enabled: !creating,
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  if (!creating && current.isPending) return <p role="status">Carregando…</p>
  if (!creating && participants.isPending) return <p role="status">Carregando participantes…</p>
  if (!creating && (!current.data || current.error))
    return (
      <>
        <Feedback message={current.error?.message || 'Evento não encontrado.'} />
        <Link to="/calendar">Voltar à agenda</Link>
      </>
    )
  const event = current.data ?? undefined
  return (
    <>
      <Link to="/calendar">← Agenda</Link>
      <h1>{creating ? 'Novo evento' : event?.title}</h1>
      <Feedback message={message || refs.error?.message} />
      <EventForm
        key={event?.id ?? 'new'}
        current={event}
        refs={refs.data}
        initialParticipants={participants.data}
        busy={busy}
        setBusy={setBusy}
        setMessage={setMessage}
        onSaved={async (saved) => {
          await cache.invalidateQueries({ queryKey: ['events'] })
          navigate(`/events/${saved}`, { replace: creating })
        }}
        onCancel={() => navigate('/calendar')}
      />
      {event && event.status !== 'cancelled' && (
        <>
          <Button variant="dangerOutline" onClick={() => setCancelOpen(true)}>
            Cancelar evento
          </Button>
          {cancelOpen && (
            <ReasonBox
              title="Cancelar evento"
              busy={busy}
              setBusy={setBusy}
              onCancel={() => setCancelOpen(false)}
              onConfirm={async (reason) => {
                try {
                  await cancelEvent(event, reason)
                  await cache.invalidateQueries({ queryKey: ['event', id] })
                  setCancelOpen(false)
                  setMessage('Evento cancelado.')
                } catch (error) {
                  setMessage((error as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
            />
          )}
        </>
      )}
    </>
  )
}

function EventForm({
  current,
  refs,
  initialParticipants,
  busy,
  setBusy,
  setMessage,
  onSaved,
  onCancel,
}: {
  current?: EventRecord
  refs?: Awaited<ReturnType<typeof planningLookups>>
  initialParticipants?: string[]
  busy: boolean
  setBusy: (value: boolean) => void
  setMessage: (value: string) => void
  onSaved: (id: string) => Promise<void>
  onCancel: () => void
}) {
  const [participantIds, setParticipantIds] = useState<string[]>(initialParticipants ?? [])
  const initial = current
    ? {
        ...current,
        starts_at: localInput(current.starts_at),
        ends_at: current.ends_at ? localInput(current.ends_at) : '',
        all_day: current.all_day ? 'true' : '',
        participant_ids: '[]',
      }
    : null
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    const raw = Object.fromEntries(new FormData(event.currentTarget))
    if (!raw.all_day) raw.all_day = ''
    const parsed = eventSchema.safeParse(raw)
    if (!parsed.success) {
      setMessage('Confira os campos obrigatórios.')
      return
    }
    setBusy(true)
    try {
      const value = parsed.data
      const id = await saveEvent(
        {
          ...value,
          all_day: value.all_day === 'true',
          starts_at: utcValue(value.starts_at),
          ends_at: value.ends_at ? utcValue(value.ends_at) : null,
          client_id: value.client_id,
          case_id: value.case_id,
          participant_ids: JSON.parse(value.participant_ids),
          recurrence_until: value.recurrence_until || null,
        },
        current?.id,
        current?.updated_at,
      )
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
          <legend>Dados do evento</legend>
          <label>
            Título
            <input name="title" defaultValue={initial?.title} required maxLength={160} />
          </label>
          <label>
            Tipo
            <select name="event_type" defaultValue={initial?.event_type || 'appointment'}>
              {Object.entries(eventTypes).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsável
            <select name="owner_user_id" defaultValue={initial?.owner_user_id || ''} required>
              <option value="">Selecione</option>
              {refs?.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cliente (opcional)
            <select name="client_id" defaultValue={initial?.client_id || ''}>
              <option value="">Nenhum</option>
              {refs?.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Processo (opcional)
            <select name="case_id" defaultValue={initial?.case_id || ''}>
              <option value="">Nenhum</option>
              {refs?.cases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.case_number}
                </option>
              ))}
            </select>
          </label>
          <label>
            Início
            <input
              type="datetime-local"
              name="starts_at"
              defaultValue={initial?.starts_at}
              required
            />
          </label>
          <label>
            Término
            <input type="datetime-local" name="ends_at" defaultValue={initial?.ends_at} />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" name="all_day" value="true" defaultChecked={current?.all_day} />{' '}
            Dia inteiro
          </label>
          <label>
            Recorrência
            <select name="recurrence_type" defaultValue={initial?.recurrence_type || 'none'}>
              {Object.entries({
                none: 'Não se repete',
                daily: 'Diária',
                weekly: 'Semanal',
                monthly: 'Mensal',
              }).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Repetir até
            <input
              type="date"
              name="recurrence_until"
              defaultValue={current?.recurrence_until || ''}
            />
          </label>
          <label className="full-row">
            Descrição
            <textarea
              name="description"
              defaultValue={current?.description || ''}
              maxLength={10000}
            />
          </label>
          <div className="full-row">
            <Participants
              people={refs?.people ?? []}
              selected={participantIds}
              setSelected={setParticipantIds}
            />
          </div>
          <input type="hidden" name="participant_ids" value={JSON.stringify(participantIds)} />
        </fieldset>
        <div className="action-row">
          <Button disabled={busy || !refs}>{busy ? 'Salvando…' : 'Salvar evento'}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </section>
  )
}

export function DeadlinePage({ creating = false }: { creating?: boolean }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const cache = useQueryClient()
  const current = useQuery({
    queryKey: ['deadline', id],
    queryFn: () => getDeadline(id),
    enabled: !creating,
  })
  const refs = useQuery({ queryKey: ['planning-lookups'], queryFn: planningLookups })
  const participants = useQuery({
    queryKey: ['deadline-participants', id],
    queryFn: () => getParticipantIds('deadline', id),
    enabled: !creating,
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [action, setAction] = useState<'complete' | 'reopen' | 'cancel' | null>(null)
  if (!creating && current.isPending) return <p role="status">Carregando…</p>
  if (!creating && participants.isPending) return <p role="status">Carregando participantes…</p>
  if (!creating && (!current.data || current.error))
    return (
      <>
        <Feedback message={current.error?.message || 'Prazo não encontrado.'} />
        <Link to="/deadlines">Voltar aos prazos</Link>
      </>
    )
  const deadline = current.data ?? undefined
  return (
    <>
      <Link to="/deadlines">← Prazos</Link>
      <h1>{creating ? 'Novo prazo' : deadline?.title}</h1>
      <Feedback message={message || refs.error?.message} />
      <DeadlineForm
        key={deadline?.id ?? 'new'}
        current={deadline}
        refs={refs.data}
        initialParticipants={participants.data}
        busy={busy}
        setBusy={setBusy}
        setMessage={setMessage}
        onSaved={async (saved) => {
          await cache.invalidateQueries({ queryKey: ['deadlines'] })
          navigate(`/deadlines/${saved}`, { replace: creating })
        }}
        onCancel={() => navigate('/deadlines')}
      />
      {deadline && !['completed', 'cancelled'].includes(deadline.status) && (
        <div className="action-row">
          <Button onClick={() => setAction('complete')}>Concluir prazo</Button>
          <Button variant="dangerOutline" onClick={() => setAction('cancel')}>
            Cancelar prazo
          </Button>
        </div>
      )}
      {deadline?.status === 'completed' && (
        <Button variant="outline" onClick={() => setAction('reopen')}>
          Reabrir prazo
        </Button>
      )}
      {action && deadline && (
        <ReasonBox
          title={
            action === 'complete'
              ? 'Concluir prazo'
              : action === 'reopen'
                ? 'Reabrir prazo'
                : 'Cancelar prazo'
          }
          busy={busy}
          setBusy={setBusy}
          requireReason={action !== 'complete'}
          onCancel={() => setAction(null)}
          onConfirm={async (reason, note) => {
            try {
              await deadlineAction(deadline, action, reason, note)
              await cache.invalidateQueries({ queryKey: ['deadline', id] })
              await cache.invalidateQueries({ queryKey: ['deadlines'] })
              setAction(null)
              setMessage('Alteração concluída.')
            } catch (error) {
              setMessage((error as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        />
      )}
    </>
  )
}

function DeadlineForm({
  current,
  refs,
  initialParticipants,
  busy,
  setBusy,
  setMessage,
  onSaved,
  onCancel,
}: {
  current?: DeadlineRecord
  refs?: Awaited<ReturnType<typeof planningLookups>>
  initialParticipants?: string[]
  busy: boolean
  setBusy: (value: boolean) => void
  setMessage: (value: string) => void
  onSaved: (id: string) => Promise<void>
  onCancel: () => void
}) {
  const [participantIds, setParticipantIds] = useState<string[]>(initialParticipants ?? [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    const raw = Object.fromEntries(new FormData(event.currentTarget))
    const parsed = deadlineSchema.safeParse(raw)
    if (!parsed.success) {
      setMessage('Confira os campos obrigatórios.')
      return
    }
    setBusy(true)
    try {
      const value = parsed.data
      const id = await saveDeadline(
        { ...value, participant_ids: JSON.parse(value.participant_ids) },
        current?.id,
        current?.updated_at,
        String(raw.reason || ''),
      )
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
          <legend>Dados do prazo</legend>
          <label>
            Título
            <input name="title" defaultValue={current?.title} required maxLength={160} />
          </label>
          <label>
            Processo
            <select name="case_id" defaultValue={current?.case_id || ''} required>
              <option value="">Selecione</option>
              {refs?.cases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.case_number}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsável
            <select name="owner_user_id" defaultValue={current?.owner_user_id || ''} required>
              <option value="">Selecione</option>
              {refs?.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prioridade
            <select name="priority" defaultValue={current?.priority || 'normal'}>
              {Object.entries(priorities).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data inicial
            <input
              type="date"
              name="start_date"
              defaultValue={current?.start_date || today}
              required
            />
          </label>
          <label>
            Data limite
            <input type="date" name="due_date" defaultValue={current?.due_date} required />
          </label>
          <label>
            Hora limite
            <input
              type="time"
              name="due_time"
              defaultValue={current?.due_time?.slice(0, 5) || ''}
            />
          </label>
          <label>
            Situação
            <select name="status" defaultValue={current?.status || 'pending'}>
              {Object.entries(deadlineStatuses)
                .filter(([key]) => ['pending', 'in_progress', 'overdue'].includes(key))
                .map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
            </select>
          </label>
          <label className="full-row">
            Descrição
            <textarea
              name="description"
              defaultValue={current?.description || ''}
              maxLength={10000}
            />
          </label>
          <label className="full-row">
            Justificativa para mudança de data (obrigatória ao alterar)
            <textarea name="reason" maxLength={500} />
          </label>
          <div className="full-row">
            <Participants
              people={refs?.people ?? []}
              selected={participantIds}
              setSelected={setParticipantIds}
            />
          </div>
          <input type="hidden" name="participant_ids" value={JSON.stringify(participantIds)} />
        </fieldset>
        <div className="action-row">
          <Button disabled={busy || !refs}>{busy ? 'Salvando…' : 'Salvar prazo'}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </section>
  )
}

function ReasonBox({
  title,
  busy,
  setBusy,
  requireReason = true,
  onCancel,
  onConfirm,
}: {
  title: string
  busy: boolean
  setBusy: (value: boolean) => void
  requireReason?: boolean
  onCancel: () => void
  onConfirm: (reason: string, note?: string) => Promise<void>
}) {
  return (
    <section className="admin-card action-panel">
      <h2>{title}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          setBusy(true)
          void onConfirm(String(data.get('reason') || ''), String(data.get('note') || ''))
        }}
      >
        <label>
          Justificativa{requireReason ? ' (obrigatória)' : ' (opcional)'}
          <textarea
            name="reason"
            required={requireReason}
            minLength={requireReason ? 3 : undefined}
            maxLength={500}
          />
        </label>
        {title === 'Concluir prazo' && (
          <label>
            Observação de conclusão
            <textarea name="note" maxLength={5000} />
          </label>
        )}
        <div className="action-row">
          <Button disabled={busy}>{busy ? 'Salvando…' : 'Confirmar'}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </section>
  )
}
