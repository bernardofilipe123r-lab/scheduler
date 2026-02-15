import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Film, Briefcase, Calendar, Sparkles, Settings, Layers, LayoutGrid, BarChart3, ScrollText, User, LogOut, Info, Dna } from 'lucide-react'
import { NotificationBell } from './NotificationBell'
import { useAuth } from '@/features/auth'

export function AppLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  
  // Check if current route is a settings page
  const isSettingsRoute = ['/brands', '/about', '/logs'].includes(location.pathname)
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false)
      }
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
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <span className="font-bold text-lg text-gray-900">Reels Automation</span>
            </div>
            
            {/* Navigation */}
            <nav className="flex items-center gap-1">
              <NavLink
                to="/"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <Film className="w-4 h-4" />
                Videos
              </NavLink>
              
              <NavLink
                to="/posts"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <LayoutGrid className="w-4 h-4" />
                Posts
              </NavLink>
              
              <NavLink
                to="/jobs"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <Briefcase className="w-4 h-4" />
                Jobs
              </NavLink>
              
              <NavLink
                to="/scheduled"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <Calendar className="w-4 h-4" />
                Scheduled
              </NavLink>
              
              <NavLink
                to="/analytics"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <BarChart3 className="w-4 h-4" />
                Analytics
              </NavLink>
              
              <NavLink
                to="/ai-team"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <Dna className="w-4 h-4" />
                AI Team
              </NavLink>
              
              {/* Settings Dropdown */}
              <div className="relative" ref={settingsRef}>
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors ${
                    isSettingsRoute || settingsOpen
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Settings className={`w-4 h-4 transition-transform duration-200 ${settingsOpen ? 'rotate-90' : ''}`} />
                </button>
                
                {/* Dropdown Menu */}
                {settingsOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <NavLink
                      to="/brands"
                      onClick={() => setSettingsOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-600'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`
                      }
                    >
                      <Layers className="w-4 h-4" />
                      Brands
                    </NavLink>

                    <NavLink
                      to="/about"
                      onClick={() => setSettingsOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-600'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`
                      }
                    >
                      <Info className="w-4 h-4" />
                      About
                    </NavLink>
                    <NavLink
                      to="/logs"
                      onClick={() => setSettingsOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-600'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`
                      }
                    >
                      <ScrollText className="w-4 h-4" />
                      System Logs
                    </NavLink>
                  </div>
                )}
              </div>
              
            </nav>
            
            {/* Notification Bell */}
            <NotificationBell />
            
            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors ${
                  userMenuOpen ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-primary-600">
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
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
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
