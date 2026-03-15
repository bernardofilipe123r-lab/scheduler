import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale-while-revalidate: serve cached data instantly, refetch in background.
      // 5 min staleTime = data is "fresh" for 5 min → no background refetch on mount.
      // Realtime subscriptions + adaptive polling handle live updates separately.
      staleTime: 5 * 60_000,
      // Keep unused cache for 30 min so page navigations are always instant.
      gcTime: 30 * 60_000,
      retry: 1,
      // Don't re-fetch on window focus by default — realtime handles it.
      // Individual hooks can override for specific cases (e.g. OAuth return).
      refetchOnWindowFocus: false,
    },
  },
})

interface QueryProviderProps {
  children: ReactNode
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
