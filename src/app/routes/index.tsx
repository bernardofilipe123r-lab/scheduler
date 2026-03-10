import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '../layout'
import { useAuth } from '@/features/auth'
import { useOnboardingStatus } from '@/features/onboarding/use-onboarding-status'
import { AppLoader, ErrorBoundary } from '@/shared/components'

// ── Eagerly loaded (always needed on first paint) ──────────────────────────
import { LoginPage } from '@/pages/Login'
import { WelcomePage } from '@/pages/Welcome'
import { OnboardingPage } from '@/pages/Onboarding'

// ── Lazy-loaded pages (split into separate chunks) ─────────────────────────
const HomePage = lazy(() => import('@/pages/Home').then(m => ({ default: m.HomePage })))
const CreationPage = lazy(() => import('@/pages/Creation').then(m => ({ default: m.CreationPage })))
const HistoryPage = lazy(() => import('@/pages/History').then(m => ({ default: m.HistoryPage })))
const JobDetailPage = lazy(() => import('@/pages/JobDetail').then(m => ({ default: m.JobDetailPage })))
const CalendarPage = lazy(() => import('@/pages/Calendar').then(m => ({ default: m.CalendarPage })))
const ScheduledPage = lazy(() => import('@/pages/Scheduled').then(m => ({ default: m.ScheduledPage })))
const BrandsPage = lazy(() => import('@/pages/Brands').then(m => ({ default: m.BrandsPage })))
const CreateBrandPage = lazy(() => import('@/pages/CreateBrand').then(m => ({ default: m.CreateBrandPage })))
const AnalyticsPage = lazy(() => import('@/pages/Analytics').then(m => ({ default: m.AnalyticsPage })))
const TobyPage = lazy(() => import('@/pages/Toby').then(m => ({ default: m.TobyPage })))
const BillingPage = lazy(() => import('@/pages/Billing').then(m => ({ default: m.BillingPage })))
const ProfilePage = lazy(() => import('@/pages/Profile').then(m => ({ default: m.ProfilePage })))
const ResetPasswordPage = lazy(() => import('@/pages/ResetPassword').then(m => ({ default: m.ResetPasswordPage })))
const AboutPage = lazy(() => import('@/pages/About').then(m => ({ default: m.AboutPage })))
const LogsPage = lazy(() => import('@/pages/Logs').then(m => ({ default: m.LogsPage })))
const AdminPage = lazy(() => import('@/pages/Admin').then(m => ({ default: m.AdminPage })))
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicyPage })))
const DataDeletionPage = lazy(() => import('@/pages/DataDeletion').then(m => ({ default: m.DataDeletionPage })))
const TermsPage = lazy(() => import('@/pages/Terms').then(m => ({ default: m.TermsPage })))

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <AppLoader />

  if (!isAuthenticated) {
    return <Navigate to="/welcome" replace />
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
    <Suspense fallback={<AppLoader />}>
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/data-deletion" element={<DataDeletionPage />} />
        <Route path="/login" element={<LoginGuard />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="/onboarding" element={<OnboardingPageGuard />} />
        <Route path="/" element={<AuthGuard><OnboardingGuard><AppLayout /></OnboardingGuard></AuthGuard>}>
        <Route index element={<HomePage />} />
        <Route path="creation" element={<CreationPage />} />
        <Route path="reels" element={<Navigate to="/creation" replace />} />
        <Route path="posts" element={<Navigate to="/creation" replace />} />
        <Route path="threads" element={<Navigate to="/creation" replace />} />
        <Route path="jobs" element={<HistoryPage />} />
        <Route path="history" element={<Navigate to="/jobs" replace />} />
        <Route path="job/:jobId" element={<JobDetailPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="scheduled" element={<ScheduledPage />} />
        <Route path="connected" element={<Navigate to="/brands" replace />} />
        <Route path="brands" element={<BrandsPage />} />
        <Route path="brands/new" element={<CreateBrandPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="toby" element={<TobyPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="settings" element={<Navigate to="/brands" replace />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="logs" element={<AdminGuard><LogsPage /></AdminGuard>} />
        <Route path="admin" element={<SuperAdminGuard><AdminPage /></SuperAdminGuard>} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}
