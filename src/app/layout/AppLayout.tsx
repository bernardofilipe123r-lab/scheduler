import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Film, History, Calendar, Sparkles, Settings, Link2, Layers, LayoutGrid } from 'lucide-react'
import { NotificationBell } from './NotificationBell'

export function AppLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  
  // Check if current route is a settings page
  const isSettingsRoute = location.pathname === '/connected' || location.pathname === '/brands'
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
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
                to="/history"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <History className="w-4 h-4" />
                History
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
                      to="/connected"
                      onClick={() => setSettingsOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-600'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`
                      }
                    >
                      <Link2 className="w-4 h-4" />
                      Connected Pages
                    </NavLink>
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
                      Brand Settings
                    </NavLink>
                  </div>
                )}
              </div>
              
            </nav>
            
            {/* Notification Bell */}
            <NotificationBell />
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
