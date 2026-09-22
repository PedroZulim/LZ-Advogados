import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import {
  Scale,
  LogOut,
  Calendar,
  Plus,
  FolderPlus,
  UserPlus,
  Clock,
  Menu,
  X,
  Home,
  Users,
  Briefcase,
  Shield,
  UserCheck,
  History,
} from 'lucide-react'
import { AuthProvider, useAuth } from '@/features/auth/auth-provider'
import {
  AuthLayout,
  LoginPage,
  MfaPage,
  PasswordPage,
  RecoveryPage,
} from '@/features/auth/auth-pages'
import { Button } from '@/components/ui/button'
import { useState, useEffect, type ReactNode } from 'react'
import { UsersPage, SessionsPage, AuditPage } from '@/features/admin/admin-pages'
import { RecordList, RecordPage } from '@/features/records/record-pages'
import {
  CalendarPage,
  DeadlineList,
  DeadlinePage,
  DashboardPlanning,
  EventPage,
} from '@/features/planning/planning-pages'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function getFormattedDate() {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const formatted = formatter.format(new Date())
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  lawyer: 'Advogado(a)',
  assistant: 'Assistente',
}

function DashboardHome({ profile }: { profile: { full_name?: string; role?: string } | null }) {
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Colega'
  const roleLabel = (profile?.role && roleLabels[profile.role]) || 'Equipe'
  const greeting = getGreeting()
  const todayFormatted = getFormattedDate()

  return (
    <div className="dashboard-container">
      <section className="dashboard-hero">
        <div className="hero-content">
          <span className="hero-date">
            <Calendar size={14} />
            {todayFormatted}
          </span>
          <div className="hero-title-row">
            <h1 className="hero-title">
              {greeting}, {firstName}
            </h1>
            <span className="hero-badge">{roleLabel}</span>
          </div>
          <p className="hero-subtitle">
            Acompanhe os prazos prioritários, audiências e compromissos da sua pauta.
          </p>
        </div>
        <div className="quick-actions">
          <Button asChild variant="outline">
            <Link to="/cases/new">
              <FolderPlus size={15} /> Novo Processo
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/clients/new">
              <UserPlus size={15} /> Novo Cliente
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/deadlines/new">
              <Clock size={15} /> Novo Prazo
            </Link>
          </Button>
          <Button asChild>
            <Link to="/events/new">
              <Plus size={15} /> Novo Evento
            </Link>
          </Button>
        </div>
      </section>

      <DashboardPlanning />

      <section className="dashboard-calendar-section">
        <CalendarPage />
      </section>
    </div>
  )
}

function Workspace({ children }: { children?: ReactNode }) {
  const { state, profile, signOut, refresh } = useAuth()
  const [error, setError] = useState('')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isMobileMenuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMobileMenuOpen])

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
  const initial = profile?.full_name?.trim()
    ? profile.full_name.trim().charAt(0).toUpperCase()
    : 'L'
  const userFirstName = profile?.full_name?.split(' ')[0] ?? 'Usuário'
  const roleName = (profile?.role && roleLabels[profile.role]) || 'Equipe'

  return (
    <div className="workspace">
      <header className="workspace-header">
        <div className="header-left">
          <Link to="/dashboard" className="header-brand">
            <span className="header-symbol">
              <Scale size={20} />
            </span>
            <div className="header-brand-text">
              <span className="brand-name">LZ Advogados</span>
              <small className="brand-tagline">GESTÃO DO ESCRITÓRIO</small>
            </div>
          </Link>
          <nav className="header-nav desktop-only" aria-label="Navegação principal">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                isActive ? 'header-nav-link active' : 'header-nav-link'
              }
            >
              Início
            </NavLink>
            <NavLink
              to="/clients"
              className={({ isActive }) =>
                isActive ? 'header-nav-link active' : 'header-nav-link'
              }
            >
              Clientes
            </NavLink>
            <NavLink
              to="/cases"
              className={({ isActive }) =>
                isActive ? 'header-nav-link active' : 'header-nav-link'
              }
            >
              Processos
            </NavLink>
            <NavLink
              to="/deadlines"
              className={({ isActive }) =>
                isActive ? 'header-nav-link active' : 'header-nav-link'
              }
            >
              Prazos
            </NavLink>
            <NavLink
              to="/account/sessions"
              className={({ isActive }) =>
                isActive ? 'header-nav-link active' : 'header-nav-link'
              }
            >
              Minhas sessões
            </NavLink>
            {profile?.role === 'admin' && (
              <>
                <NavLink
                  to="/admin/users"
                  className={({ isActive }) =>
                    isActive ? 'header-nav-link active' : 'header-nav-link'
                  }
                >
                  Equipe
                </NavLink>
                <NavLink
                  to="/admin/audit"
                  className={({ isActive }) =>
                    isActive ? 'header-nav-link active' : 'header-nav-link'
                  }
                >
                  Auditoria
                </NavLink>
              </>
            )}
          </nav>
        </div>

        <div className="header-right desktop-only">
          <div className="user-profile-badge">
            <span className="user-avatar">{initial}</span>
            <div className="user-info">
              <span className="user-name">{userFirstName}</span>
              <span className="user-role">{roleName}</span>
            </div>
          </div>
          <button
            type="button"
            className="header-logout-btn"
            onClick={() => {
              void signOut().catch(() => setError('Não foi possível sair. Tente novamente.'))
            }}
            title="Sair da plataforma"
          >
            <LogOut size={16} />
            <span>Sair</span>
          </button>
        </div>

        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu de opções'}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {isMobileMenuOpen && (
        <div
          className="mobile-menu-overlay"
          role="presentation"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="mobile-menu-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-menu-user">
              <span className="user-avatar large">{initial}</span>
              <div className="user-info">
                <span className="user-name">{profile?.full_name ?? 'Usuário'}</span>
                <span className="user-role">{roleName}</span>
              </div>
            </div>

            <nav className="mobile-nav" aria-label="Menu móvel">
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  isActive ? 'mobile-nav-link active' : 'mobile-nav-link'
                }
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Home size={18} />
                <span>Início</span>
              </NavLink>
              <NavLink
                to="/clients"
                className={({ isActive }) =>
                  isActive ? 'mobile-nav-link active' : 'mobile-nav-link'
                }
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Users size={18} />
                <span>Clientes</span>
              </NavLink>
              <NavLink
                to="/cases"
                className={({ isActive }) =>
                  isActive ? 'mobile-nav-link active' : 'mobile-nav-link'
                }
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Briefcase size={18} />
                <span>Processos</span>
              </NavLink>
              <NavLink
                to="/deadlines"
                className={({ isActive }) =>
                  isActive ? 'mobile-nav-link active' : 'mobile-nav-link'
                }
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Clock size={18} />
                <span>Prazos</span>
              </NavLink>
              <NavLink
                to="/account/sessions"
                className={({ isActive }) =>
                  isActive ? 'mobile-nav-link active' : 'mobile-nav-link'
                }
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Shield size={18} />
                <span>Minhas sessões</span>
              </NavLink>
              {profile?.role === 'admin' && (
                <>
                  <NavLink
                    to="/admin/users"
                    className={({ isActive }) =>
                      isActive ? 'mobile-nav-link active' : 'mobile-nav-link'
                    }
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <UserCheck size={18} />
                    <span>Equipe</span>
                  </NavLink>
                  <NavLink
                    to="/admin/audit"
                    className={({ isActive }) =>
                      isActive ? 'mobile-nav-link active' : 'mobile-nav-link'
                    }
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <History size={18} />
                    <span>Auditoria</span>
                  </NavLink>
                </>
              )}
            </nav>

            <div className="mobile-menu-footer">
              <button
                type="button"
                className="mobile-logout-btn"
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  void signOut().catch(() => setError('Não foi possível sair. Tente novamente.'))
                }}
              >
                <LogOut size={17} />
                <span>Sair da conta</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <main>
        {children ?? (
          <>
            <DashboardHome profile={profile} />
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
