import { describe, expect, it } from 'vitest'
import { parseEmailLink, recoveryFeedback } from '../../src/features/auth/email-link'

describe('Email callback handling', () => {
  it('explains expired links from hash or query without reflecting provider descriptions', () => {
    for (const separator of ['#', '?']) {
      const result = parseEmailLink(
        `https://app.test/auth/update-password${separator}error=access_denied&error_code=otp_expired&error_description=SECRET`,
      )
      expect(result.kind).toBe('error')
      expect(JSON.stringify(result)).toContain('expirou')
      expect(JSON.stringify(result)).not.toContain('SECRET')
    }
  })
  it('accepts only invite/recovery hashes for explicit confirmation', () => {
    expect(
      parseEmailLink('https://app.test/auth/update-password#token_hash=hash&type=invite'),
    ).toEqual({ kind: 'verify', tokenHash: 'hash', type: 'invite' })
    expect(
      parseEmailLink('https://app.test/auth/update-password?token_hash=hash&type=recovery').kind,
    ).toBe('verify')
    expect(
      parseEmailLink('https://app.test/auth/update-password?token_hash=hash&type=signup').kind,
    ).toBe('error')
    expect(
      parseEmailLink('https://app.test/auth/update-password#access_token=jwt&type=invite').kind,
    ).toBe('none')
    expect(parseEmailLink('https://app.test/auth/update-password').kind).toBe('none')
  })
  it('keeps account existence private while explaining delivery/network failures', () => {
    expect(recoveryFeedback({ code: 'user_not_found', status: 400 })).toBe(recoveryFeedback(null))
    expect(recoveryFeedback({ code: 'email_provider_disabled', status: 400 })).toContain(
      'indisponível',
    )
    expect(recoveryFeedback({ status: 429 })).toContain('Aguarde')
    expect(recoveryFeedback({ status: 503 })).toContain('indisponível')
    expect(recoveryFeedback({})).toContain('conexão')
  })
})
