/**
 * Reusable password gate component.
 * 
 * Wraps any page that requires password access.
 * Uses the settings verify-access endpoint and shares session tokens.
 */
import { useState, type ReactNode } from 'react'
import { Shield, Lock, Key, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { 
  useVerifyAccess, 
  getSettingsToken, 
  clearSettingsToken 
} from '@/features/settings/api/use-settings'

interface PasswordGateProps {
  /** The page title shown on the lock screen */
  title: string
  /** Description shown below the title */
  description?: string
  /** The button label */
  buttonLabel?: string
  /** Children rendered after authentication */
  children: ReactNode | ((onLogout: () => void) => ReactNode)
}

export function PasswordGate({ 
  title, 
  description = 'Enter the password to continue',
  buttonLabel = 'Unlock',
  children 
}: PasswordGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getSettingsToken())
  const [password, setPassword] = useState('')
  const verifyAccess = useVerifyAccess()
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await verifyAccess.mutateAsync(password)
      setIsAuthenticated(true)
      setPassword('')
      toast.success('Access granted')
    } catch {
      toast.error('Invalid password')
      setPassword('')
    }
  }
  
  const handleLogout = () => {
    clearSettingsToken()
    setIsAuthenticated(false)
  }
  
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8">
            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-primary-500" />
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                <p className="text-gray-500 mt-1">{description}</p>
              </div>
            </div>
            
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password..."
                  autoFocus
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg"
                />
              </div>
              <button
                type="submit"
                disabled={!password || verifyAccess.isPending}
                className="w-full flex items-center justify-center gap-2 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg transition-colors"
              >
                {verifyAccess.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Key className="w-5 h-5" />
                )}
                {buttonLabel}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }
  
  // Support both render prop and regular children
  if (typeof children === 'function') {
    return <>{children(handleLogout)}</>
  }
  
  return <>{children}</>
}
