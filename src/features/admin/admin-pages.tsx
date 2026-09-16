import { useState, useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-provider'
import { administration, roleNames, type TeamUser } from './api'
import type { AdminRequest } from '../../../supabase/functions/_shared/admin-contract'

const date = (value: string | null) => (value ? new Date(value).toLocaleString('pt-BR') : '—')
function ActionDialog({
  children,
  close,
  busy,
}: {
  children: ReactNode
  close: () => void
  busy: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="admin-card action-dialog"
      aria-labelledby="action-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) close()
      }}
    >
      {children}
    </dialog>
  )
}
function Status({ error, loading }: { error: Error | null; loading: boolean }) {
  return (
    <>
      {loading && <p role="status">Carregando…</p>}
      {error && (
        <p className="feedback" role="alert">
          {error.message}
        </p>
      )}
    </>
  )
}
export function UsersPage() {
  const { profile, refresh } = useAuth()
  const cache = useQueryClient()
  const allowed = profile?.role === 'admin'
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => administration<{ users: TeamUser[] }>({ action: 'list' }),
    enabled: allowed,
    retry: false,
  })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState<{
    user: TeamUser
    action: 'change_role' | 'set_active' | 'revoke_sessions'
  } | null>(null)
  const [role, setRole] = useState<TeamUser['role']>('assistant')
  const [reason, setReason] = useState('')
  async function run(request: AdminRequest) {
    setBusy(true)
    setMessage('')
    try {
      await administration(request)
      setMessage(
        request.action === 'invite'
          ? 'Convite enviado. A pessoa deverá definir a senha e configurar o autenticador.'
          : 'Alteração concluída.',
      )
      setSelection(null)
      setReason('')
      await cache.invalidateQueries({ queryKey: ['admin-users'] })
      await cache.invalidateQueries({ queryKey: ['audit'] })
      if ('user_id' in request && request.user_id === profile?.id) await refresh()
      return true
    } catch (error) {
      setMessage((error as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    if (
      await run({
        action: 'invite',
        full_name: String(values.get('name')).trim(),
        email: String(values.get('email')).trim(),
        role: String(values.get('role')) as TeamUser['role'],
      })
    )
      form.reset()
  }
  if (!allowed) return <p role="alert">Esta área é exclusiva para administradores.</p>
  return (
    <>
      <span className="eyebrow">ADMINISTRAÇÃO</span>
      <h1>Equipe do escritório</h1>
      <p className="muted">
        Convide pessoas e controle suas permissões. Todos os acessos exigem autenticação em duas
        etapas.
      </p>
      <section className="admin-card">
        <h2>Convidar integrante</h2>
        <form onSubmit={invite} className="admin-form">
          <label>
            Nome completo
            <input name="name" required minLength={2} maxLength={160} autoComplete="name" />
          </label>
          <label>
            E-mail
            <input name="email" type="email" required maxLength={254} autoComplete="email" />
          </label>
          <label>
            Perfil
            <select name="role" defaultValue="assistant">
              {Object.entries(roleNames).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy}>Enviar convite</Button>
        </form>
      </section>
      {message && (
        <p className="feedback" role="status">
          {message}
        </p>
      )}
      <Status error={users.error} loading={users.isPending} />
      <div className="section-heading">
        <h2>Integrantes</h2>
        <Button
          variant="outline"
          disabled={busy || users.isFetching}
          onClick={() => void users.refetch()}
        >
          Atualizar
        </Button>
      </div>
      <div className="team-list">
        {users.data?.users.map((user) => (
          <article className="admin-card member-card" key={user.id}>
            <div>
              <h3>
                {user.full_name} {user.id === profile?.id && <small>(você)</small>}
              </h3>
              <p>{user.email}</p>
              <p className="muted">
                {roleNames[user.role]} ·{' '}
                {user.is_active
                  ? user.email_confirmed_at
                    ? 'Ativo'
                    : 'Convite pendente'
                  : 'Desativado'}
              </p>
              <small>Último acesso: {date(user.last_sign_in_at)}</small>
            </div>
            <div className="action-row">
              {(['change_role', 'set_active', 'revoke_sessions'] as const).map((action) => (
                <Button
                  variant="outline"
                  key={action}
                  disabled={busy}
                  onClick={() => {
                    setSelection({ user, action })
                    setRole(user.role)
                    setReason('')
                    setMessage('')
                  }}
                >
                  {action === 'change_role'
                    ? 'Alterar perfil'
                    : action === 'set_active'
                      ? user.is_active
                        ? 'Desativar'
                        : 'Reativar'
                      : 'Encerrar sessões'}
                </Button>
              ))}
            </div>
          </article>
        ))}
      </div>
      {selection && (
        <ActionDialog busy={busy} close={() => setSelection(null)}>
          <h2 id="action-title">
            {selection.action === 'change_role'
              ? 'Alterar perfil'
              : selection.action === 'set_active'
                ? selection.user.is_active
                  ? 'Desativar acesso'
                  : 'Reativar acesso'
                : 'Encerrar sessões'}
          </h2>
          <p>
            {selection.user.full_name} — {selection.user.email}
          </p>
          <p className="muted">
            Alterar o perfil, desativar o acesso ou encerrar sessões exige que a pessoa entre
            novamente. Desativar bloqueia o acesso aos dados até a reativação.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const common = { user_id: selection.user.id, reason }
              void run(
                selection.action === 'change_role'
                  ? { action: 'change_role', ...common, role }
                  : selection.action === 'set_active'
                    ? { action: 'set_active', ...common, is_active: !selection.user.is_active }
                    : { action: 'revoke_sessions', ...common },
              )
            }}
          >
            {selection.action === 'change_role' && (
              <label>
                Novo perfil
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as TeamUser['role'])}
                >
                  {Object.entries(roleNames).map(([key, name]) => (
                    <option value={key} key={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Justificativa
              <textarea
                autoFocus
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                minLength={3}
                maxLength={500}
              />
            </label>
            {message && (
              <p className="feedback" role="alert">
                {message}
              </p>
            )}
            <div className="action-row">
              <Button disabled={busy}>Confirmar</Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setSelection(null)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </ActionDialog>
      )}
    </>
  )
}

type Session = { id: string; created_at: string; updated_at: string; is_current: boolean }
export function SessionsPage() {
  const { signOut, refresh } = useAuth()
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => administration<{ sessions: Session[] }>({ action: 'sessions' }),
    retry: false,
  })
  const [scope, setScope] = useState<'current' | 'others' | 'all' | ''>('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function revoke() {
    if (!scope) return
    setBusy(true)
    setMessage('')
    try {
      await administration({ action: 'revoke_own_sessions', scope })
      if (scope !== 'others') {
        await signOut().catch(() => refresh())
        return
      }
      setScope('')
      setMessage('Outras sessões encerradas.')
      await sessions.refetch()
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <span className="eyebrow">SEGURANÇA</span>
      <h1>Minhas sessões</h1>
      <p className="muted">
        Confira os acessos da sua conta e encerre as sessões que não deseja manter.
      </p>
      <Status error={sessions.error} loading={sessions.isPending} />
      {sessions.data?.sessions.map((session) => (
        <article className="admin-card" key={session.id}>
          <h2>{session.is_current ? 'Esta sessão' : 'Outra sessão'}</h2>
          <p>Iniciada em {date(session.created_at)}</p>
          <p className="muted">Atualizada em {date(session.updated_at)}</p>
        </article>
      ))}
      <div className="action-row">
        <Button disabled={busy} onClick={() => setScope('others')}>
          Encerrar outras sessões
        </Button>
        <Button disabled={busy} variant="outline" onClick={() => setScope('current')}>
          Encerrar esta sessão
        </Button>
        <Button disabled={busy} variant="outline" onClick={() => setScope('all')}>
          Encerrar todas
        </Button>
      </div>
      {scope && (
        <div className="feedback">
          <p>
            {scope === 'others'
              ? 'Manter esta sessão e encerrar todas as outras?'
              : 'Você precisará entrar novamente. Confirmar encerramento?'}
          </p>
          <div className="action-row">
            <Button disabled={busy} onClick={() => void revoke()}>
              Confirmar
            </Button>
            <Button disabled={busy} variant="ghost" onClick={() => setScope('')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {message && (
        <p className="feedback" role="status">
          {message}
        </p>
      )}
    </>
  )
}

type AuditEvent = {
  id: string
  created_at: string
  actor_name: string
  action: string
  entity_id: string
  reason: string | null
  before_data: unknown
  after_data: unknown
  request_id: string
}
const eventNames: Record<string, string> = {
  'user.invited': 'Convite enviado',
  'user.invite_failed': 'Falha no convite',
  'user.role_changed': 'Perfil alterado',
  'user.deactivated': 'Usuário desativado',
  'user.reactivated': 'Usuário reativado',
  'user.sessions_revoked': 'Sessões encerradas',
}
export function AuditPage() {
  const { profile } = useAuth()
  const [filter, setFilter] = useState('')
  const [actor, setActor] = useState('')
  const [before, setBefore] = useState<string | undefined>()
  const allowed = profile?.role === 'admin'
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => administration<{ users: TeamUser[] }>({ action: 'list' }),
    enabled: allowed,
    retry: false,
  })
  const events = useQuery({
    queryKey: ['audit', filter, actor, before],
    queryFn: () =>
      administration<{ events: AuditEvent[] }>({
        action: 'audit',
        action_filter: filter,
        actor,
        before,
      }),
    enabled: allowed,
    retry: false,
  })
  if (!allowed) return <p role="alert">Esta área é exclusiva para administradores.</p>
  return (
    <>
      <span className="eyebrow">ADMINISTRAÇÃO</span>
      <h1>Auditoria de acessos</h1>
      <p className="muted">Histórico das operações sobre usuários e sessões do escritório.</p>
      <div className="admin-form">
        <label>
          Ação
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value)
              setBefore(undefined)
            }}
          >
            <option value="">Todas</option>
            {Object.entries(eventNames).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Responsável
          <select
            value={actor}
            onChange={(event) => {
              setActor(event.target.value)
              setBefore(undefined)
            }}
          >
            <option value="">Todos</option>
            {users.data?.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => {
            setBefore(undefined)
            void events.refetch()
          }}
        >
          Mais recentes
        </Button>
      </div>
      <Status error={events.error} loading={events.isPending} />
      {events.data?.events.length === 0 && <p>Nenhum evento encontrado.</p>}
      {events.data?.events.map((event) => (
        <article className="admin-card" key={event.id}>
          <h2>{eventNames[event.action] ?? event.action}</h2>
          <p>
            {date(event.created_at)} · {event.actor_name}
          </p>
          {event.reason && <p>{event.reason}</p>}
          <details>
            <summary>Detalhes da alteração</summary>
            <p>Usuário ou convite: {event.entity_id}</p>
            <pre>
              {JSON.stringify({ antes: event.before_data, depois: event.after_data }, null, 2)}
            </pre>
            <small>Protocolo: {event.request_id}</small>
          </details>
        </article>
      ))}
      {events.data?.events.length === 100 && (
        <Button variant="outline" onClick={() => setBefore(events.data?.events.at(-1)?.created_at)}>
          Eventos anteriores
        </Button>
      )}
    </>
  )
}
