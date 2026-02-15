import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '../layout'
import { useAuth } from '@/features/auth'
import { LoginPage } from '@/pages/Login'
import { ProfilePage } from '@/pages/Profile'
import { GeneratorPage } from '@/pages/Generator'
import { HistoryPage } from '@/pages/History'
import { JobDetailPage } from '@/pages/JobDetail'
import { ScheduledPage } from '@/pages/Scheduled'
// Connected page merged into Brands page tabs
import { BrandsPage } from '@/pages/Brands'
import { PostsPage } from '@/pages/Posts'
import { AnalyticsPage } from '@/pages/Analytics'
import { AITeamPage } from '@/pages/AITeam'
import { AboutPage } from '@/pages/About'
import { LogsPage } from '@/pages/Logs'
import { Loader2 } from 'lucide-react'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

function LoginGuard() {
  const { isAuthenticated, isLoading } = useAuth()
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }
  
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }
  
  return <LoginPage />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginGuard />} />
      <Route path="/" element={<AuthGuard><AppLayout /></AuthGuard>}>
        <Route index element={<GeneratorPage />} />
        <Route path="jobs" element={<HistoryPage />} />
        <Route path="history" element={<Navigate to="/jobs" replace />} />
        <Route path="job/:jobId" element={<JobDetailPage />} />
        <Route path="scheduled" element={<ScheduledPage />} />
        <Route path="connected" element={<Navigate to="/brands?tab=connections" replace />} />
        <Route path="brands" element={<BrandsPage />} />
        <Route path="posts" element={<PostsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<Navigate to="/brands?tab=settings" replace />} />
        <Route path="toby" element={<Navigate to="/ai-team" replace />} />
        <Route path="maestro" element={<Navigate to="/ai-team?tab=orchestrator" replace />} />
        <Route path="ai-team" element={<AITeamPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  )
}
