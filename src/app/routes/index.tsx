import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '../layout'
import { useAuth } from '@/features/auth'
import { useOnboardingStatus } from '@/features/onboarding/use-onboarding-status'
import { LoginPage } from '@/pages/Login'
import { OnboardingPage } from '@/pages/Onboarding'
import { ProfilePage } from '@/pages/Profile'
import { HomePage } from '@/pages/Home'
import { GeneratorPage } from '@/pages/Generator'
import { HistoryPage } from '@/pages/History'
import { JobDetailPage } from '@/pages/JobDetail'
import { ScheduledPage } from '@/pages/Scheduled'
import { CalendarPage } from '@/pages/Calendar'
// Connected page merged into Brands page tabs
import { BrandsPage } from '@/pages/Brands'
import { PostsPage } from '@/pages/Posts'
import { AnalyticsPage } from '@/pages/Analytics'
import { AboutPage } from '@/pages/About'
import { LogsPage } from '@/pages/Logs'
import { AdminPage } from '@/pages/Admin'
import { CreateBrandPage } from '@/pages/CreateBrand'
import { TobyPage } from '@/pages/Toby'
import { PrivacyPolicyPage } from '@/pages/PrivacyPolicy'
import { DataDeletionPage } from '@/pages/DataDeletion'
import { TermsPage } from '@/pages/Terms'
import { AppLoader, ErrorBoundary } from '@/shared/components'

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

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { needsOnboarding, isLoading } = useOnboardingStatus()
  if (isLoading) return <AppLoader />
  if (needsOnboarding) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function OnboardingPageGuard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { isLoading: onboardingLoading, needsOnboarding } = useOnboardingStatus()

  if (authLoading || onboardingLoading) return <AppLoader />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  // If onboarding is not needed, redirect to main app
  if (!needsOnboarding) return <Navigate to="/" replace />
  return <OnboardingPage />
}

export function AppRoutes() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/data-deletion" element={<DataDeletionPage />} />
        <Route path="/login" element={<LoginGuard />} />
        <Route path="/onboarding" element={<OnboardingPageGuard />} />
        <Route path="/" element={<AuthGuard><OnboardingGuard><AppLayout /></OnboardingGuard></AuthGuard>}>
        <Route index element={<HomePage />} />
        <Route path="reels" element={<GeneratorPage />} />
        <Route path="jobs" element={<HistoryPage />} />
        <Route path="history" element={<Navigate to="/jobs" replace />} />
        <Route path="job/:jobId" element={<JobDetailPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="scheduled" element={<ScheduledPage />} />
        <Route path="connected" element={<Navigate to="/brands?tab=connections" replace />} />
        <Route path="brands" element={<BrandsPage />} />
        <Route path="brands/new" element={<CreateBrandPage />} />
        <Route path="posts" element={<PostsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="toby" element={<TobyPage />} />
        <Route path="settings" element={<Navigate to="/brands?tab=connections" replace />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="logs" element={<AdminGuard><LogsPage /></AdminGuard>} />
        <Route path="admin" element={<SuperAdminGuard><AdminPage /></SuperAdminGuard>} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
    </ErrorBoundary>
  )
}
