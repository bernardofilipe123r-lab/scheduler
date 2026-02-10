import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/features/auth'
import { AppRoutes } from '@/app/routes'

export function RouterProvider() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
