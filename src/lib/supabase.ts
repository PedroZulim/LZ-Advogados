import { createClient } from '@supabase/supabase-js'
import { environment } from './config'

// Authentication stays in memory. No legal data or token is persisted by this slice.
export const supabase = environment.success
  ? createClient(environment.data.url, environment.data.key, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export function getSupabase() {
  if (!supabase) throw new Error('A conexão com o serviço ainda não foi configurada.')
  return supabase
}
