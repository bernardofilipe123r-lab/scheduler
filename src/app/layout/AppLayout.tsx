import { useState, useRef, useEffect, Suspense } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { PageLoader } from '@/shared/components'
import {
  Home, Sparkles, Briefcase, Calendar, BarChart3,
  Bot, Layers, User, LogOut,
  ChevronLeft, ChevronRight, ShieldCheck, CreditCard,
  X, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import { useJobs } from '@/features/jobs'
import { useBillingStatus } from '@/features/billing/useBillingStatus'
import { LockedBanner } from '@/features/billing/LockedBanner'
import { TobyMascot } from '@/shared/components/TobyMascot'
import vtLogo from '@/assets/icons/vt-logo.png'

/* ── Railway Status Banner ─────────────────────────────── */
function RailwayStatusBanner() {
  const [status, setStatus] = useState<{ message: string; url?: string } | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch('https://status.railway.com/summary.json')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const pageStatus: string = data?.page?.status ?? 'UP'
        if (pageStatus !== 'UP') {
          const incidents = data?.activeIncidents ?? []
          const name = incidents[0]?.name ?? 'Railway is experiencing issues'
          const url = incidents[0]?.url ?? 'https://status.railway.com'
          setStatus({ message: name, url })
        }
      } catch {
        /* silently ignore – don't bother users if status fetch fails */
      }
    }
    check()
    const id = setInterval(check, 5 * 60_000) // re-check every 5 min
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (!status || dismissed) return null

  return (
    <div className="bg-red-600 text-white text-sm px-4 py-2.5 flex items-center gap-3">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <p className="flex-1 min-w-0">
        <span className="font-semibold">Infrastructure issue:</span>{' '}
        {status.message}. Some features (scheduling, publishing) may be temporarily unavailable.{' '}
        {status.url && (
          <a href={status.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-red-100">
            View status&nbsp;&rarr;
          </a>
        )}
      </p>
      <button onClick={() => setDismissed(true)} className="shrink-0 p-0.5 hover:bg-red-700 rounded transition-colors" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

/* ── AI Service Health Banner ──────────────────────────── */
interface AIService { name: string; status: string; detail: string }

function AIServiceBanner() {
  const [services, setServices] = useState<AIService[]>([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch('/api/system/ai-health')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setServices(data.services ?? [])
      } catch {
        /* silently ignore */
      }
    }
    check()
    const id = setInterval(check, 5 * 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (services.length === 0 || dismissed) return null

  return (
    <div className="bg-amber-500 text-white text-sm px-4 py-2.5 flex items-center gap-3">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <p className="flex-1 min-w-0">
        <span className="font-semibold">Service degradation:</span>{' '}
        {services.map(s => s.detail).join(' ')}
        {' '}Content will resume automatically once services recover.
      </p>
      <button onClick={() => setDismissed(true)} className="shrink-0 p-0.5 hover:bg-amber-600 rounded transition-colors" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

/* ── Social Platform Health Banner ─────────────────────── */
interface SocialIssue { platform: string; name: string; status: string; detail: string }

function SocialHealthBanner() {
  const [issues, setIssues] = useState<SocialIssue[]>([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch('/api/system/social-health')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setIssues(data.ok ? [] : (data.issues ?? []))
      } catch {
        /* silently ignore */
      }
    }
    check()
    const id = setInterval(check, 5 * 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (issues.length === 0 || dismissed) return null

  const names = [...new Set(issues.map(i => i.name))].join(', ')

  return (
    <div className="bg-orange-500 text-white text-sm px-4 py-2.5 flex items-center gap-3">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <p className="flex-1 min-w-0">
        <span className="font-semibold">Social platform issues:</span>{' '}
        {names} — {issues.map(i => i.detail).join(' ')}
        {' '}Publishing may be affected until resolved.
      </p>
      <button onClick={() => setDismissed(true)} className="shrink-0 p-0.5 hover:bg-orange-600 rounded transition-colors" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home', end: true },
  { to: '/creation', icon: Sparkles, label: 'Creation', end: false },
  { to: '/jobs', icon: Briefcase, label: 'Jobs', end: false },
  { to: '/calendar', icon: Calendar, label: 'Calendar', end: false },
  { to: '/analytics', icon: BarChart3, label: 'Analytics', end: false },
  { to: '/toby', icon: Bot, label: 'Toby', end: false },
]

// ── Route chunk prefetch map ──────────────────────────────
const PREFETCH_MAP: Record<string, () => Promise<unknown>> = {
  '/': () => import('@/pages/Home'),
  '/creation': () => import('@/pages/Creation'),
  '/jobs': () => import('@/pages/History'),
  '/calendar': () => import('@/pages/Calendar'),
  '/analytics': () => import('@/pages/Analytics'),
  '/toby': () => import('@/pages/Toby'),
  '/brands': () => import('@/pages/Brands'),
  '/billing': () => import('@/pages/Billing'),
  '/admin': () => import('@/pages/Admin'),
  '/profile': () => import('@/pages/Profile'),
}
const _prefetched = new Set<string>()
function prefetchRoute(to: string) {
  if (_prefetched.has(to)) return
  _prefetched.add(to)
  PREFETCH_MAP[to]?.()
}

const SETTINGS_ITEMS = [
  { to: '/brands', icon: Layers, label: 'Brands' },
  { to: '/billing', icon: CreditCard, label: 'Billing', billingOnly: true },
  { to: '/admin', icon: ShieldCheck, label: 'Admin', superAdminOnly: true },
]

export function AppLayout() {
  const [expanded, setExpanded] = useState(() => {
    const saved = localStorage.getItem('sidebar-expanded')
    return saved !== null ? saved === 'true' : true
  })
  const toggleExpanded = () => {
    setExpanded(prev => {
      const next = !prev
      localStorage.setItem('sidebar-expanded', String(next))
      return next
    })
  }
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { data: jobs = [] } = useJobs()
  const { data: billingData } = useBillingStatus()
  const isLocked = billingData?.billing_status === 'locked'
  const activeJobCount = (Array.isArray(jobs) ? jobs : []).filter(
    (j: any) => j.status === 'generating' || j.status === 'pending'
  ).length

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const settingsItems = SETTINGS_ITEMS.filter(item => {
    if ((item as { superAdminOnly?: boolean }).superAdminOnly) return user?.isSuperAdmin
    if ((item as { adminOnly?: boolean }).adminOnly) return user?.isAdmin
    if ((item as { billingOnly?: boolean }).billingOnly) return billingData && !billingData.is_exempt
    return true
  })

  const userInitial = user?.name?.charAt(0)?.toUpperCase() || 'U'

  const sidebarWidth = expanded ? 'w-52' : 'w-16'

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={`${sidebarWidth} fixed top-0 left-0 bottom-0 z-50 flex flex-col transition-all duration-200 ease-in-out bg-gradient-to-b from-neutral-950 via-stone-900 to-stone-800 overflow-visible`}
      >
        {/* Logo */}
        <div className="relative shrink-0">
          <NavLink
            to="/"
            className="toby-sidebar-logo flex items-center gap-2 h-16 px-2 shrink-0 transition-colors group"
          >
            <div className="w-10 h-10 shrink-0 flex items-center justify-center">
              <img src={vtLogo} alt="Viral Toby" className="w-9 h-9 rounded-lg" />
            </div>
            {expanded && (
              <span className="font-extrabold text-base text-stone-100 whitespace-nowrap tracking-tight">
                Viral Toby
              </span>
            )}
          </NavLink>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-3 px-2 flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onMouseEnter={() => prefetchRoute(to)}
              onFocus={() => prefetchRoute(to)}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors relative ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-stone-400 hover:bg-white/[0.07] hover:text-stone-100'
                }`
              }
            >
              <div className="relative shrink-0">
                <Icon className="w-[22px] h-[22px]" />
                {to === '/jobs' && activeJobCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold leading-none px-1">
                    {activeJobCount}
                  </span>
                )}
              </div>
              {expanded && <span className="text-sm whitespace-nowrap">{label}</span>}
              {!expanded && (
                <span className="absolute left-14 bg-stone-700 text-stone-100 text-xs font-medium px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[60]">
                  {label}
                </span>
              )}
            </NavLink>
          ))}

          <div className="my-1" />

          {settingsItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onMouseEnter={() => prefetchRoute(to)}
              onFocus={() => prefetchRoute(to)}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors relative ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-stone-400 hover:bg-white/[0.07] hover:text-stone-100'
                }`
              }
            >
              <Icon className="w-[22px] h-[22px] shrink-0" />
              {expanded && <span className="text-sm whitespace-nowrap">{label}</span>}
              {!expanded && (
                <span className="absolute left-14 bg-stone-700 text-stone-100 text-xs font-medium px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[60]">
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: Expand toggle + User */}
        <div className="p-2 flex flex-col gap-1">
          <button
            onClick={toggleExpanded}
            className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-stone-500 hover:bg-white/[0.07] hover:text-stone-200 transition-colors w-full"
          >
            {expanded ? <ChevronLeft className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
            {expanded && <span className="text-sm font-medium whitespace-nowrap">Collapse</span>}
          </button>

          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`flex items-center gap-3 px-3 py-1.5 rounded-lg transition-colors w-full ${
                userMenuOpen ? 'bg-white/10 text-white' : 'text-stone-400 hover:bg-white/[0.07]'
              }`}
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user?.name || 'User avatar'}
                  className="w-7 h-7 rounded-full object-cover shrink-0 border border-stone-600"
                />
              ) : (
                <div className="w-7 h-7 bg-stone-700 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-stone-200">{userInitial}</span>
                </div>
              )}
              {expanded && (
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-stone-200 truncate">{user?.name || 'User'}</p>
                </div>
              )}
            </button>
            {userMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[60]">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">{user?.name || 'User'}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email || ''}</p>
                </div>
                <NavLink
                  to="/profile"
                  onClick={() => setUserMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                      isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-700 hover:bg-gray-50'
                    }`
                  }
                >
                  <User className="w-4 h-4" />
                  Profile
                </NavLink>
                <button
                  onClick={() => { setUserMenuOpen(false); handleLogout() }}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Toby peeking from BEHIND the sidebar — z-index lower than sidebar so it's clipped */}
      <div
        className="fixed top-3 pointer-events-none transition-all duration-200 ease-in-out"
        style={{
          zIndex: 49, // behind sidebar (z-50)
          left: expanded ? '196px' : '52px', // sidebar edge minus some overlap
        }}
        title="👀 Toby is watching..."
      >
        <TobyMascot size={56} />
      </div>

      {/* Main area */}
      <div className={`flex-1 min-w-0 flex flex-col min-h-screen transition-all duration-200 ease-in-out ${expanded ? 'ml-52' : 'ml-16'}`}>
        <RailwayStatusBanner />
        <AIServiceBanner />
        <SocialHealthBanner />
        {isLocked && <LockedBanner />}
        {/* Page content */}
        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex-1 min-w-0">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
