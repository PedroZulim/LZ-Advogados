import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { App } from '@/routes/app'
import { PwaUpdatePrompt } from './pwa-update'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <PwaUpdatePrompt />
    </QueryClientProvider>
  </StrictMode>,
)
