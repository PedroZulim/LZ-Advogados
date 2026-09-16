import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/query-client'
import { resolveAccess, type AccessState, type Profile } from './access'

type AuthContextValue = {
  state: AccessState | 'loading'
  profile: Profile | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthContextValue['state']>('loading')
  const [profile, setProfile] = useState<Profile | null>(null)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++generation.current
    setState('loading')
    setProfile(null)
    queryClient.clear()
    if (!supabase) {
      setState('signed-out')
      return
    }
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()
      if (error) throw error
      let nextProfile: Profile | null = null
      let level: string | null = null
      if (session) {
        const { data, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (mfaError) throw mfaError
        level = data.currentLevel
        if (level === 'aal2') {
          const result = await supabase
            .from('profiles')
            .select('id, organization_id, full_name, role, is_active')
            .eq('id', session.user.id)
            .maybeSingle()
          if (result.error) throw result.error
          nextProfile = result.data as Profile | null
        }
      }
      if (current !== generation.current) return
      setProfile(nextProfile)
      setState(resolveAccess(Boolean(session), level, nextProfile))
    } catch {
      if (current === generation.current) {
        setProfile(null)
        setState('denied')
      }
    }
  }, [])
  const signOut = useCallback(async () => {
    generation.current++
    setState('signed-out')
    setProfile(null)
    queryClient.clear()
    const result = await supabase?.auth.signOut({ scope: 'local' })
    if (result?.error) throw new Error('Não foi possível encerrar a sessão. Tente novamente.')
  }, [])
  useEffect(() => {
    void refresh()
    // Never await Supabase calls inside its auth event callback.
    let deferred: ReturnType<typeof setTimeout> | undefined
    const subscription = supabase?.auth.onAuthStateChange(() => {
      generation.current++
      setState('loading')
      setProfile(null)
      queryClient.clear()
      clearTimeout(deferred)
      deferred = setTimeout(() => {
        void refresh()
      }, 0)
    })
    const recheck = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', recheck)
    return () => {
      // This is a request generation counter, not a captured DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++
      clearTimeout(deferred)
      subscription?.data.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [refresh])
  useEffect(() => {
    if (state !== 'ready') return
    // Visual lock only; server revocation is checked independently by RLS.
    let timer = window.setTimeout(() => {
      void signOut().catch(() => undefined)
    }, 15 * 60_000)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void signOut().catch(() => undefined)
      }, 15 * 60_000)
    }
    window.addEventListener('pointerdown', reset)
    window.addEventListener('keydown', reset)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', reset)
      window.removeEventListener('keydown', reset)
    }
  }, [state, signOut])
  return (
    <AuthContext.Provider value={{ state, profile, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider ausente.')
  return context
}
