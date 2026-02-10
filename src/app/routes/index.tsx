import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '../layout'
import { useAuth } from '@/features/auth'
import { LoginPage } from '@/pages/Login'
import { ProfilePage } from '@/pages/Profile'
import { GeneratorPage } from '@/pages/Generator'
import { HistoryPage } from '@/pages/History'
import { JobDetailPage } from '@/pages/JobDetail'
import { ScheduledPage } from '@/pages/Scheduled'
import { ConnectedPage } from '@/pages/Connected'
import { BrandsPage } from '@/pages/Brands'
import { PostsPage } from '@/pages/Posts'
import { AnalyticsPage } from '@/pages/Analytics'
import { SettingsPage } from '@/pages/Settings'
import { PromptsPage } from '@/pages/Prompts'
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
        <Route path="history" element={<HistoryPage />} />
        <Route path="job/:jobId" element={<JobDetailPage />} />
        <Route path="scheduled" element={<ScheduledPage />} />
        <Route path="connected" element={<ConnectedPage />} />
        <Route path="brands" element={<BrandsPage />} />
        <Route path="posts" element={<PostsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="prompts" element={<PromptsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  )
}
