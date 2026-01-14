import { QueryProvider } from './QueryProvider'
import { RouterProvider } from './RouterProvider'

export function AppProviders() {
  return (
    <QueryProvider>
      <RouterProvider />
    </QueryProvider>
  )
}

export { QueryProvider } from './QueryProvider'
export { RouterProvider } from './RouterProvider'
