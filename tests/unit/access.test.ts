import { describe, expect, it } from 'vitest'
import { resolveAccess, type Profile } from '../../src/features/auth/access'
import { loginSchema, passwordSchema, totpSchema } from '../../src/schemas/auth'

const profile: Profile = {
  id: 'a',
  organization_id: 'alpha',
  full_name: 'Ana Teste',
  role: 'admin',
  is_active: true,
}
describe('access boundary', () => {
  it('never grants access without a session or MFA', () => {
    expect(resolveAccess(false, 'aal2', profile)).toBe('signed-out')
    expect(resolveAccess(true, 'aal1', profile)).toBe('mfa-required')
    expect(resolveAccess(true, null, profile)).toBe('mfa-required')
  })
  it('requires an active profile even at aal2', () => {
    expect(resolveAccess(true, 'aal2', null)).toBe('denied')
    expect(resolveAccess(true, 'aal2', { ...profile, is_active: false })).toBe('denied')
    expect(resolveAccess(true, 'aal2', profile)).toBe('ready')
  })
})
describe('auth input validation', () => {
  it('rejects invalid e-mail and empty password', () => {
    expect(loginSchema.safeParse({ email: 'invalid', password: '' }).success).toBe(false)
  })
  it('requires matching strong passwords', () => {
    expect(
      passwordSchema.safeParse({ password: 'long-test-password', confirmation: 'different' })
        .success,
    ).toBe(false)
    expect(passwordSchema.safeParse({ password: 'short', confirmation: 'short' }).success).toBe(
      false,
    )
  })
  it('requires exactly six numeric TOTP digits', () => {
    expect(totpSchema.safeParse('012345').success).toBe(true)
    for (const value of ['12345', '1234567', 'abcdef', ' 123456'])
      expect(totpSchema.safeParse(value).success).toBe(false)
  })
})
