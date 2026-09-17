import { useEffect, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { LockKeyhole, ShieldCheck, ArrowRight, Scale } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { getSupabase, supabase, initialEmailLink, clearInitialEmailLink } from '@/lib/supabase'
import { recoveryFeedback } from './email-link'
import { APP_NAME } from '@/lib/config'
import { loginSchema, passwordSchema, totpSchema } from '@/schemas/auth'
import { useAuth } from './auth-provider'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <aside className="brand-panel">
        <Link to="/login" className="brand">
          <span className="brand-symbol">
            <Scale size={25} />
          </span>
          <span>
            {APP_NAME}
            <small>GESTÃO DO ESCRITÓRIO</small>
          </span>
        </Link>
        <div className="brand-message">
          <span className="eyebrow">SEU ESCRITÓRIO, CONECTADO</span>
          <h1>
            Clareza para cada
            <br />
            próximo passo.
          </h1>
          <p>
            Agenda, clientes e prazos.
            <br />
            Tudo começa com um acesso seguro.
          </p>
          <div className="brand-rule" />
        </div>
        <div className="brand-footer">
          <ShieldCheck size={19} /> Acesso exclusivo para a equipe
        </div>
      </aside>
      <section className="auth-main">
        <div className="auth-card">{children}</div>
        <footer>Ambiente restrito · America/Sao_Paulo</footer>
      </section>
    </main>
  )
}
function Feedback({ message }: { message: string }) {
  return message ? (
    <p className="feedback" role="status">
      {message}
    </p>
  ) : null
}

export function LoginPage() {
  const { state } = useAuth()
  const [message, setMessage] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) })
  if (state === 'ready') return <Navigate to="/dashboard" replace />
  if (state === 'denied') return <Navigate to="/dashboard" replace />
  if (state === 'mfa-required') return <Navigate to="/auth/mfa" replace />
  return (
    <AuthLayout>
      <span className="icon-tile">
        <LockKeyhole size={23} />
      </span>
      <span className="eyebrow form-eyebrow">BEM-VINDO DE VOLTA</span>
      <h2>Acesse seu escritório</h2>
      <p className="muted intro">Entre com o e-mail cadastrado pela administração.</p>
      {!supabase && (
        <p className="setup-notice" role="status">
          O ambiente está em preparação. O acesso será liberado após a configuração do serviço de
          autenticação.
        </p>
      )}
      <form
        onSubmit={handleSubmit(async (values) => {
          setMessage('')
          try {
            const { error } = await getSupabase().auth.signInWithPassword(values)
            if (error)
              setMessage('Não foi possível entrar. Confira suas credenciais e tente novamente.')
          } catch {
            setMessage('Não foi possível conectar. Tente novamente em instantes.')
          }
        })}
      >
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          placeholder="voce@escritorio.com.br"
          {...register('email')}
          aria-invalid={!!errors.email}
        />
        <Feedback message={errors.email?.message ?? ''} />
        <div className="label-row">
          <label htmlFor="password">Senha</label>
          <Link to="/auth/recovery">Esqueci minha senha</Link>
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Sua senha"
          {...register('password')}
          aria-invalid={!!errors.password}
        />
        <Feedback message={errors.password?.message ?? ''} />
        <Feedback message={message} />
        <Button
          className="full-width submit"
          disabled={!supabase || isSubmitting || state === 'loading'}
        >
          {isSubmitting ? 'Entrando…' : 'Entrar'}
          <ArrowRight size={18} />
        </Button>
      </form>
      <div className="auth-note">
        <ShieldCheck size={20} />
        <p>Após a senha, confirme seu acesso com o código do aplicativo autenticador.</p>
      </div>
      <p className="invite-note">Ainda não tem acesso? Fale com a administração do escritório.</p>
    </AuthLayout>
  )
}

export function MfaPage() {
  const { state, refresh, signOut } = useAuth()
  const [params] = useSearchParams()
  const [factorId, setFactorId] = useState('')
  const [qr, setQr] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!supabase) return
    let active = true
    getSupabase()
      .auth.mfa.listFactors()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setMessage('Não foi possível consultar o autenticador. Entre novamente.')
        else {
          setFactorId(data.totp.find((f) => f.status === 'verified')?.id ?? '')
          setLoaded(true)
        }
      })
      .catch(() => {
        if (active) setMessage('Não foi possível conectar. Entre novamente.')
      })
    return () => {
      active = false
    }
  }, [])
  if (state === 'signed-out') return <Navigate to="/login" replace />
  if (state === 'denied') return <Navigate to="/dashboard" replace />
  if (state === 'ready')
    return (
      <Navigate
        to={params.get('next') === 'password' ? '/auth/update-password' : '/dashboard'}
        replace
      />
    )
  return (
    <AuthLayout>
      <span className="icon-tile">
        <ShieldCheck />
      </span>
      <h2>Confirme seu acesso</h2>
      <p className="muted intro">Use seu aplicativo autenticador para proteger a conta.</p>
      {loaded && !factorId && (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setMessage('')
            try {
              const client = getSupabase()
              // Clear only abandoned enrollments; never remove a verified factor.
              const factors = await client.auth.mfa.listFactors()
              if (factors.error) throw factors.error
              for (const factor of factors.data.all.filter((f) => f.status === 'unverified')) {
                const result = await client.auth.mfa.unenroll({ factorId: factor.id })
                if (result.error) throw result.error
              }
              const { data, error } = await client.auth.mfa.enroll({
                factorType: 'totp',
                friendlyName: 'Autenticador do escritório',
              })
              if (error) throw error
              setFactorId(data.id)
              setQr(data.totp.qr_code)
            } catch {
              setMessage('Não foi possível configurar. Tente novamente.')
            } finally {
              setBusy(false)
            }
          }}
        >
          Configurar autenticador
        </Button>
      )}
      {qr && (
        <div className="qr-block">
          <img src={qr} alt="QR code para adicionar esta conta ao aplicativo autenticador" />
          <p>Leia este QR code no seu aplicativo.</p>
        </div>
      )}
      {factorId && (
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            setMessage('')
            const parsed = totpSchema.safeParse(code)
            if (!parsed.success) {
              setMessage(parsed.error.issues[0].message)
              return
            }
            setBusy(true)
            try {
              const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code })
              if (error) throw error
              await refresh()
            } catch {
              setMessage('Código inválido ou expirado. Tente novamente.')
              setCode('')
            } finally {
              setBusy(false)
            }
          }}
        >
          <label htmlFor="totp">Código de verificação</label>
          <input
            id="totp"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
          />
          <Button className="full-width submit" disabled={busy}>
            Verificar código
          </Button>
        </form>
      )}
      <Feedback message={message} />
      <Button
        variant="ghost"
        className="submit"
        onClick={() => {
          void signOut().catch(() => setMessage('Não foi possível sair. Tente novamente.'))
        }}
      >
        Voltar ao login
      </Button>
    </AuthLayout>
  )
}

export function RecoveryPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <AuthLayout>
      <h2>Recuperar acesso</h2>
      <p className="muted intro">
        Informe o e-mail do convite ou da sua conta para receber um novo link e definir a senha.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          try {
            const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
              redirectTo: `${window.location.origin}/auth/update-password`,
            })
            setMessage(recoveryFeedback(error))
          } catch {
            setMessage(
              'Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.',
            )
          }
          setBusy(false)
        }}
      >
        <label htmlFor="recovery-email">E-mail</label>
        <input
          id="recovery-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <Button className="full-width submit" disabled={busy || !supabase}>
          Enviar instruções
        </Button>
      </form>
      <Feedback message={message} />
      <Link className="back-link" to="/login">
        Voltar ao login
      </Link>
    </AuthLayout>
  )
}

export function PasswordPage() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const { state } = useAuth()
  const [link, setLink] = useState(initialEmailLink)
  const [verifying, setVerifying] = useState(false)
  // Keep the callback in this page only; returning from MFA must not reuse a consumed link.
  useEffect(() => {
    clearInitialEmailLink()
  }, [])
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) })
  return (
    <AuthLayout>
      <h2>Defina sua senha</h2>
      <p className="muted intro">Use uma senha exclusiva com pelo menos 12 caracteres.</p>
      {link.kind === 'error' ? (
        <>
          <Feedback message={link.message} />
          <Button asChild className="full-width">
            <Link to="/auth/recovery">Solicitar novo link</Link>
          </Button>
          <Link className="back-link" to="/login">
            Já defini minha senha — entrar
          </Link>
        </>
      ) : link.kind === 'verify' ? (
        <>
          <p>
            Confirme abaixo para validar seu link e continuar. O link será utilizado somente após
            esta confirmação.
          </p>
          <Button
            disabled={verifying || !supabase}
            onClick={async () => {
              setVerifying(true)
              setMessage('')
              try {
                const { error } = await getSupabase().auth.verifyOtp({
                  token_hash: link.tokenHash,
                  type: link.type,
                })
                if (error) {
                  setLink({
                    kind: 'error',
                    message:
                      'Este link expirou, já foi utilizado ou não é mais válido. Solicite um novo link.',
                  })
                  return
                }
                setLink({ kind: 'none' })
                navigate('/auth/update-password', { replace: true })
              } catch {
                setMessage('Não foi possível conectar. Tente novamente.')
              } finally {
                setVerifying(false)
              }
            }}
          >
            {verifying ? 'Validando…' : 'Continuar e definir senha'}
          </Button>
        </>
      ) : state === 'loading' ? (
        <p role="status">Validando seu acesso…</p>
      ) : state === 'signed-out' || state === 'denied' ? (
        <>
          <p className="feedback">
            Não há uma sessão válida para definir a senha. Abra o link mais recente do seu e-mail ou
            solicite um novo.
          </p>
          <Button asChild className="full-width">
            <Link to="/auth/recovery">Solicitar novo link</Link>
          </Button>
          <Link className="back-link" to="/login">
            Voltar ao login
          </Link>
        </>
      ) : (
        <form
          onSubmit={handleSubmit(async (values) => {
            try {
              const { error } = await getSupabase().auth.updateUser({ password: values.password })
              if (error) throw error
              navigate('/auth/mfa', { replace: true })
            } catch {
              setMessage(
                'Não foi possível atualizar a senha. Para uma conta com MFA, confirme o autenticador antes de tentar novamente.',
              )
            }
          })}
        >
          <label htmlFor="new-password">Nova senha</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
          />
          <Feedback message={errors.password?.message ?? ''} />
          <label htmlFor="confirmation">Repita a senha</label>
          <input
            id="confirmation"
            type="password"
            autoComplete="new-password"
            {...register('confirmation')}
          />
          <Feedback message={errors.confirmation?.message ?? ''} />
          <Button className="full-width submit" disabled={isSubmitting}>
            Salvar senha
          </Button>
        </form>
      )}
      <Feedback message={message} />
      {link.kind === 'none' && (state === 'ready' || state === 'mfa-required') && (
        <Link className="back-link" to="/auth/mfa?next=password">
          Confirmar autenticador
        </Link>
      )}
    </AuthLayout>
  )
}
