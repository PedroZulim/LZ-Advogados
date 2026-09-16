import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { Scale, ShieldCheck, LogOut } from 'lucide-react'
import { AuthProvider, useAuth } from '@/features/auth/auth-provider'
import {
  AuthLayout,
  LoginPage,
  MfaPage,
  PasswordPage,
  RecoveryPage,
} from '@/features/auth/auth-pages'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

function Workspace() {
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
      <main>
        <span className="eyebrow">ESPAÇO DO ESCRITÓRIO</span>
        <h1>Olá, {profile?.full_name.split(' ')[0]}.</h1>
        <p className="muted">Seu acesso foi confirmado.</p>
        <section className="foundation-card">
          <ShieldCheck size={28} />
          <h2>Conta protegida</h2>
          <p>
            Você está conectado com verificação em duas etapas e vínculo ativo com seu escritório.
          </p>
          <dl>
            <div>
              <dt>Nome</dt>
              <dd>{profile?.full_name}</dd>
            </div>
            <div>
              <dt>Perfil</dt>
              <dd>
                {
                  { admin: 'Administrador', lawyer: 'Advogado', assistant: 'Assistente' }[
                    profile!.role
                  ]
                }
              </dd>
            </div>
          </dl>
        </section>
        <p className="muted">
          Agenda, clientes, processos e prazos serão disponibilizados nas próximas etapas de
          implantação.
        </p>
        <p role="status">{error}</p>
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
