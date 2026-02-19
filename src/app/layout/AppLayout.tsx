import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  Home, Film, Briefcase, Calendar, LayoutGrid, BarChart3,
  Layers, ScrollText, User, LogOut, Info,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import vaLogo from '@/assets/icons/va-logo.svg'

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home', end: true },
  { to: '/reels', icon: Film, label: 'Videos', end: false },
  { to: '/posts', icon: LayoutGrid, label: 'Posts', end: false },
  { to: '/jobs', icon: Briefcase, label: 'Jobs', end: false },
  { to: '/calendar', icon: Calendar, label: 'Calendar', end: false },
  { to: '/analytics', icon: BarChart3, label: 'Analytics', end: false },
]

const SETTINGS_ITEMS = [
  { to: '/brands', icon: Layers, label: 'Brands' },
  { to: '/about', icon: Info, label: 'About' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
]

export function AppLayout() {
  const [expanded, setExpanded] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  
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

  const sidebarWidth = expanded ? 'w-52' : 'w-16'
  
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={`${sidebarWidth} bg-white border-r border-gray-200 fixed top-0 left-0 bottom-0 z-50 flex flex-col transition-all duration-200 ease-in-out`}
      >
        {/* Logo */}
        <NavLink
          to="/"
          className="flex items-center gap-2.5 h-16 px-3 border-b border-gray-200 shrink-0 hover:bg-gray-50 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-0.5 shadow-md shadow-violet-200 shrink-0">
            <div className="w-full h-full rounded-[10px] bg-white/95 flex items-center justify-center">
              <img src={vaLogo} alt="Viral App logo" className="w-6 h-6" />
            </div>
          </div>
          {expanded && (
            <span className="font-extrabold text-base bg-gradient-to-r from-violet-700 to-fuchsia-600 text-transparent bg-clip-text whitespace-nowrap">
              Viral App
            </span>
          )}
        </NavLink>

        {/* Nav Items */}
        <nav className="flex-1 py-3 px-2 flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
          {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors relative ${
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {expanded && <span className="text-sm whitespace-nowrap">{label}</span>}
              {!expanded && (
                <span className="absolute left-14 bg-gray-800 text-white text-xs font-medium px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[60]">
                  {label}
                </span>
              )}
            </NavLink>
          ))}

          {/* Divider */}
          <div className="border-t border-gray-200 my-2" />

          {SETTINGS_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors relative ${
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {expanded && <span className="text-sm whitespace-nowrap">{label}</span>}
              {!expanded && (
                <span className="absolute left-14 bg-gray-800 text-white text-xs font-medium px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[60]">
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: Expand toggle + User */}
        <div className="border-t border-gray-200 p-2 flex flex-col gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors w-full"
          >
            {expanded ? <ChevronLeft className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
            {expanded && <span className="text-sm font-medium whitespace-nowrap">Collapse</span>}
          </button>

          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full ${
                userMenuOpen ? 'bg-primary-50 text-primary-600' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary-600">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
              {expanded && (
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{user?.name || 'User'}</p>
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

      {/* Main area */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-200 ease-in-out ${expanded ? 'ml-52' : 'ml-16'}`}>
        {/* Page content */}
        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
