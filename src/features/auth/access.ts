export type AccessState = 'signed-out' | 'mfa-required' | 'ready' | 'denied'
export type Profile = {
  id: string
  organization_id: string
  full_name: string
  role: 'admin' | 'lawyer' | 'assistant'
  is_active: boolean
}
export function resolveAccess(
  hasSession: boolean,
  assurance: string | null,
  profile: Profile | null,
): AccessState {
  if (!hasSession) return 'signed-out'
  if (assurance !== 'aal2') return 'mfa-required'
  return profile?.is_active ? 'ready' : 'denied'
}
