import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/features/auth'
import { AppRoutes } from '@/app/routes'

export function RouterProvider() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
