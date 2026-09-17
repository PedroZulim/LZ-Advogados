import { z } from 'zod'

const uuidOrEmpty = z.union([z.uuid('Selecione uma opção válida.'), z.literal('')])
export const clientSchema = z
  .object({
    person_type: z.enum(['individual', 'company']),
    name: z.string().trim().min(2, 'Informe pelo menos 2 caracteres.').max(160),
    cpf_cnpj: z.string().trim().max(30),
    email: z.union([z.email('Informe um e-mail válido.'), z.literal('')]),
    phone: z.string().trim().max(40),
    address: z.string().trim().max(500),
    responsible_user_id: uuidOrEmpty,
    notes: z.string().trim().max(10000),
  })
  .strict()
export const caseSchema = z
  .object({
    client_id: z.uuid('Selecione o cliente.'),
    responsible_user_id: z.uuid('Selecione o advogado responsável.'),
    case_number: z
      .string()
      .trim()
      .min(1, 'Informe o número ou identificador.')
      .max(100)
      .refine((value) => /[\p{L}\p{N}]/u.test(value), 'Informe um identificador válido.'),
    tribunal: z.string().trim().max(160),
    court_unit: z.string().trim().max(160),
    legal_area_id: z.uuid('Selecione a área jurídica.'),
    client_side: z.enum(['claimant', 'defendant', 'other']),
    opposing_party: z.string().trim().max(200),
    status: z.enum(['active', 'suspended', 'closed']),
    notes: z.string().trim().max(10000),
  })
  .strict()

export const statusLabels: Record<string, string> = {
  active: 'Ativo',
  suspended: 'Suspenso',
  closed: 'Encerrado',
  archived: 'Arquivado',
}
export const sideLabels = { claimant: 'Polo ativo', defendant: 'Polo passivo', other: 'Outro' }
