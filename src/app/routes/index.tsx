import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '../layout'
import { useAuth } from '@/features/auth'
import { LoginPage } from '@/pages/Login'
import { ProfilePage } from '@/pages/Profile'
import { HomePage } from '@/pages/Home'
import { GeneratorPage } from '@/pages/Generator'
import { HistoryPage } from '@/pages/History'
import { JobDetailPage } from '@/pages/JobDetail'
import { ScheduledPage } from '@/pages/Scheduled'
// Connected page merged into Brands page tabs
import { BrandsPage } from '@/pages/Brands'
import { PostsPage } from '@/pages/Posts'
import { AnalyticsPage } from '@/pages/Analytics'
import { AboutPage } from '@/pages/About'
import { LogsPage } from '@/pages/Logs'
import { AdminPage } from '@/pages/Admin'
import { AppLoader } from '@/shared/components'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  
  if (isLoading) return <AppLoader />
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

function LoginGuard() {
  const { isAuthenticated, isLoading } = useAuth()
  
  if (isLoading) return <AppLoader />
  
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }
  
  return <LoginPage />
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <AppLoader />

  if (!user?.isAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <AppLoader />

  if (!user?.isSuperAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginGuard />} />
        <Route path="/" element={<AuthGuard><AppLayout /></AuthGuard>}>
        <Route index element={<HomePage />} />
        <Route path="reels" element={<GeneratorPage />} />
        <Route path="jobs" element={<HistoryPage />} />
        <Route path="history" element={<Navigate to="/jobs" replace />} />
        <Route path="job/:jobId" element={<JobDetailPage />} />
        <Route path="calendar" element={<ScheduledPage />} />
        <Route path="scheduled" element={<Navigate to="/calendar" replace />} />
        <Route path="connected" element={<Navigate to="/brands?tab=connections" replace />} />
        <Route path="brands" element={<BrandsPage />} />
        <Route path="posts" element={<PostsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<Navigate to="/brands?tab=settings" replace />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="logs" element={<AdminGuard><LogsPage /></AdminGuard>} />
        <Route path="admin" element={<SuperAdminGuard><AdminPage /></SuperAdminGuard>} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
    </>
  )
}
