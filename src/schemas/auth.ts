import { z } from 'zod'
export const loginSchema = z.object({
  email: z.email('Informe um e-mail válido.').trim(),
  password: z.string().min(1, 'Informe sua senha.'),
})
export const passwordSchema = z
  .object({
    password: z.string().min(12, 'Use pelo menos 12 caracteres.'),
    confirmation: z.string(),
  })
  .refine((values) => values.password === values.confirmation, {
    path: ['confirmation'],
    message: 'As senhas precisam ser iguais.',
  })
export const totpSchema = z
  .string()
  .regex(/^\d{6}$/, 'Informe os 6 dígitos do aplicativo autenticador.')
