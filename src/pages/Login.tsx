/**
 * Login Page — email + password via Supabase Auth.
 */
import { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/features/auth'
import vaLogo from '@/assets/icons/va-logo.svg'

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    setIsLoading(true)
    try {
      await login(email.trim(), password)
      toast.success('Welcome back!')
    } catch {
      toast.error('Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 rounded-2xl overflow-hidden shadow-2xl">
        <aside className="hidden lg:flex flex-col justify-between bg-gradient-to-b from-neutral-950 via-stone-900 to-stone-800 text-white p-10">
          <div>
            <div className="inline-flex items-center gap-3">
              <img src={vaLogo} alt="Viral App logo" className="w-10 h-10" />
              <span className="text-lg font-bold tracking-tight text-stone-100">Viral App</span>
            </div>
            <h2 className="mt-10 text-3xl font-bold leading-tight text-stone-50">Manage your content operations in one place.</h2>
            <p className="mt-4 text-sm text-stone-400 leading-relaxed">
              Create, schedule, and publish across brands with a focused dashboard built for daily execution.
            </p>
          </div>
          <div className="space-y-3 text-sm text-stone-500">
            <p className="uppercase tracking-widest text-xs text-stone-600 font-medium">Platform capabilities</p>
            <p className="text-stone-400">Multi-brand content generation & scheduling</p>
            <p className="text-stone-400">Instagram, Facebook & YouTube publishing</p>
            <p className="text-stone-400">Analytics, job tracking & system logs</p>
          </div>
        </aside>

        <section className="bg-white p-7 sm:p-10 lg:p-12">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <img src={vaLogo} alt="Viral App logo" className="w-10 h-10" />
            <div>
              <p className="text-lg font-bold text-gray-900 tracking-tight">Viral App</p>
              <p className="text-xs text-gray-500">Content operations platform</p>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">Sign in</h1>
            <p className="mt-2 text-sm text-gray-500">Use your account credentials to access the dashboard.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent text-sm bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-11 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent text-sm bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!email || !password || isLoading}
              className="w-full h-11 flex items-center justify-center gap-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
