import { QueryClient } from '@tanstack/react-query'
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, gcTime: 300_000, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
})
