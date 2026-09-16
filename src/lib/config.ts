import { z } from 'zod'

export const APP_TIMEZONE = 'America/Sao_Paulo'
export const APP_NAME = 'LZ Advogados'
const environmentSchema = z.object({
  url: z
    .url()
    .refine(
      (value) =>
        value.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(value),
    ),
  key: z
    .string()
    .min(20)
    .refine((value) => !value.startsWith('sb_secret_') && !value.includes('replace-with')),
})
export const environment = environmentSchema.safeParse({
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
})
