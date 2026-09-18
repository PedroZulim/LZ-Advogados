import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { Scale, LogOut } from 'lucide-react'
import { AuthProvider, useAuth } from '@/features/auth/auth-provider'
import {
  AuthLayout,
  LoginPage,
  MfaPage,
  PasswordPage,
  RecoveryPage,
} from '@/features/auth/auth-pages'
import { Button } from '@/components/ui/button'
import { useState, type ReactNode } from 'react'
import { UsersPage, SessionsPage, AuditPage } from '@/features/admin/admin-pages'
import { RecordList, RecordPage } from '@/features/records/record-pages'
import {
  CalendarPage,
  DeadlineList,
  DeadlinePage,
  DashboardPlanning,
  EventPage,
} from '@/features/planning/planning-pages'

function Workspace({ children }: { children?: ReactNode }) {
  const { state, profile, signOut, refresh } = useAuth()
  const [error, setError] = useState('')
  if (state === 'loading')
    return (
      <main className="center-state" role="status">
        Verificando acesso…
      </main>
    )
  if (state === 'signed-out') return <Navigate to="/login" replace />
  if (state === 'mfa-required') return <Navigate to="/auth/mfa" replace />
  if (state === 'denied')
    return (
      <AuthLayout>
        <h2>Acesso indisponível</h2>
        <p>
          Não foi possível confirmar seu vínculo ativo com o escritório. Tente novamente ou entre em
          contato com a administração.
        </p>
        <Button
          onClick={() => {
            void refresh()
          }}
        >
          Tentar novamente
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            void signOut().catch(() => setError('Não foi possível sair.'))
          }}
        >
          Sair
        </Button>
        <p role="status">{error}</p>
      </AuthLayout>
    )
  return (
    <div className="workspace">
      <header>
        <span className="brand workspace-brand">
          <Scale /> LZ Advogados
        </span>
        <Button
          variant="ghost"
          onClick={() => {
            void signOut().catch(() => setError('Não foi possível sair. Tente novamente.'))
          }}
        >
          <LogOut size={17} /> Sair
        </Button>
      </header>
      <nav className="workspace-nav" aria-label="Navegação principal">
        <Link to="/dashboard">Início</Link>
        <Link to="/clients">Clientes</Link>
        <Link to="/cases">Processos</Link>
        <Link to="/deadlines">Prazos</Link>
        <Link to="/account/sessions">Minhas sessões</Link>
        {profile?.role === 'admin' && (
          <>
            <Link to="/admin/users">Equipe</Link>
            <Link to="/admin/audit">Auditoria</Link>
          </>
        )}
      </nav>
      <main>
        {children ?? (
          <>
            <span className="eyebrow">ESPAÇO DO ESCRITÓRIO</span>
            <h1>Olá, {profile?.full_name.split(' ')[0]}.</h1>
            <p className="muted">Seu acesso foi confirmado.</p>
            <CalendarPage />
            <DashboardPlanning />
            <p role="status">{error}</p>
          </>
        )}
      </main>
    </div>
  )
}
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/mfa" element={<MfaPage />} />
          <Route path="/auth/recovery" element={<RecoveryPage />} />
          <Route path="/auth/update-password" element={<PasswordPage />} />
          <Route path="/dashboard" element={<Workspace />} />
          <Route
            path="/clients"
            element={
              <Workspace>
                <RecordList kind="client" />
              </Workspace>
            }
          />
          <Route
            path="/clients/new"
            element={
              <Workspace>
                <RecordPage key="new-client" kind="client" creating />
              </Workspace>
            }
          />
          <Route
            path="/clients/:id"
            element={
              <Workspace>
                <RecordPage kind="client" />
              </Workspace>
            }
          />
          <Route
            path="/cases"
            element={
              <Workspace>
                <RecordList kind="case" />
              </Workspace>
            }
          />
          <Route
            path="/cases/new"
            element={
              <Workspace>
                <RecordPage key="new-case" kind="case" creating />
              </Workspace>
            }
          />
          <Route
            path="/cases/:id"
            element={
              <Workspace>
                <RecordPage kind="case" />
              </Workspace>
            }
          />
          <Route path="/calendar" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/events/new"
            element={
              <Workspace>
                <EventPage creating />
              </Workspace>
            }
          />
          <Route
            path="/events/:id"
            element={
              <Workspace>
                <EventPage />
              </Workspace>
            }
          />
          <Route
            path="/deadlines"
            element={
              <Workspace>
                <DeadlineList />
              </Workspace>
            }
          />
          <Route
            path="/deadlines/new"
            element={
              <Workspace>
                <DeadlinePage creating />
              </Workspace>
            }
          />
          <Route
            path="/deadlines/:id"
            element={
              <Workspace>
                <DeadlinePage />
              </Workspace>
            }
          />
          <Route
            path="/admin/users"
            element={
              <Workspace>
                <UsersPage />
              </Workspace>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <Workspace>
                <AuditPage />
              </Workspace>
            }
          />
          <Route
            path="/account/sessions"
            element={
              <Workspace>
                <SessionsPage />
              </Workspace>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="*"
            element={
              <AuthLayout>
                <h2>Página não encontrada</h2>
                <Link to="/">Voltar ao início</Link>
              </AuthLayout>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
