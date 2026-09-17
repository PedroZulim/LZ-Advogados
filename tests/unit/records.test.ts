import { describe, expect, it } from 'vitest'
import { clientSchema, caseSchema } from '../../src/features/records/schema'

describe('Client and case form validation', () => {
  const client = {
    person_type: 'company',
    name: 'Empresa fictícia',
    cpf_cnpj: 'AB.CDE.FGH/0001-23',
    email: '',
    phone: '',
    address: '',
    responsible_user_id: '',
    notes: '',
  }
  it('allows optional contact fields and alphanumeric documents without coercion', () => {
    expect(clientSchema.parse(client).cpf_cnpj).toBe(client.cpf_cnpj)
    expect(clientSchema.safeParse({ ...client, name: ' ' }).success).toBe(false)
    expect(clientSchema.safeParse({ ...client, email: 'invalid' }).success).toBe(false)
  })
  it('requires client, responsible and area and keeps internal identifiers', () => {
    const data = {
      client_id: crypto.randomUUID(),
      responsible_user_id: crypto.randomUUID(),
      legal_area_id: crypto.randomUUID(),
      case_number: 'ADM-2026/15',
      client_side: 'other',
      status: 'suspended',
      tribunal: '',
      court_unit: '',
      opposing_party: '',
      notes: '',
    }
    expect(caseSchema.safeParse(data).success).toBe(true)
    expect(caseSchema.safeParse({ ...data, responsible_user_id: '' }).success).toBe(false)
    expect(caseSchema.safeParse({ ...data, status: 'archived' }).success).toBe(false)
    expect(caseSchema.safeParse({ ...data, case_number: '...' }).success).toBe(false)
  })
})
