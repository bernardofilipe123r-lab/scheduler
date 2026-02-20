import { QueryProvider } from './QueryProvider'
import { RouterProvider } from './RouterProvider'
import { useRealtimeSync } from '@/shared/hooks/use-realtime-sync'

function RealtimeSync({ children }: { children: React.ReactNode }) {
  useRealtimeSync()
  return <>{children}</>
}

export function AppProviders() {
  return (
    <QueryProvider>
      <RealtimeSync>
        <RouterProvider />
      </RealtimeSync>
    </QueryProvider>
  )
}

export { QueryProvider } from './QueryProvider'
export { RouterProvider } from './RouterProvider'
