/**
 * Login Page — email + password via Supabase Auth.
 */
import { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowRight, Zap, BarChart3, Globe } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '@/features/auth'
import vaLogo from '@/assets/icons/va-logo.svg'

const FEATURES = [
  { icon: Zap, label: 'AI-Powered Generation', desc: 'Create high-converting reels, carousels & posts in seconds' },
  { icon: Globe, label: 'Multi-Platform Publishing', desc: 'Instagram, Facebook & YouTube — all from one dashboard' },
  { icon: BarChart3, label: 'Performance Analytics', desc: 'Track engagement, reach & growth across all your brands' },
]

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

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
    <div className="min-h-screen bg-[#060a10] flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient background */}
      <div className="login-bg-grid" />
      <div className="login-glow login-glow--primary" />
      <div className="login-glow login-glow--secondary" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[1080px] grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] rounded-2xl overflow-hidden relative z-10"
        style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 32px 80px -12px rgba(0,0,0,0.6)' }}
      >
        {/* ── Left panel ── */}
        <aside className="hidden lg:flex flex-col justify-between relative bg-[#0a0f18] p-10 xl:p-12 overflow-hidden">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500/[0.07] via-transparent to-blue-600/[0.04]" />
          <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-primary-500/[0.06] blur-[100px]" />
          <div className="absolute -bottom-24 -right-24 w-64 h-64 rounded-full bg-blue-500/[0.04] blur-[80px]" />

          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="inline-flex items-center gap-3"
            >
              <div className="p-1.5 rounded-xl bg-white/[0.06] border border-white/[0.08]">
                <img src={vaLogo} alt="Viral App logo" className="w-9 h-9" />
              </div>
              <span className="text-[15px] font-semibold tracking-tight text-white/90">Viral App</span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="mt-12 text-[28px] xl:text-[32px] font-bold leading-[1.2] tracking-tight text-white"
            >
              Your content
              <br />
              command center.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.5 }}
              className="mt-4 text-[14px] text-white/40 leading-relaxed max-w-[320px]"
            >
              Create, schedule, and publish across every brand — all from a single, focused dashboard.
            </motion.p>
          </div>

          <div className="relative z-10 space-y-3 mt-12">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.55 + i * 0.1, duration: 0.5 }}
                className="group flex items-start gap-3.5 p-3 -mx-3 rounded-xl hover:bg-white/[0.03] transition-colors duration-300"
              >
                <div className="flex-shrink-0 mt-0.5 w-9 h-9 rounded-lg bg-white/[0.06] border border-white/[0.06] flex items-center justify-center group-hover:bg-primary-500/10 group-hover:border-primary-500/20 transition-colors duration-300">
                  <f.icon className="w-4 h-4 text-white/50 group-hover:text-primary-300 transition-colors duration-300" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-white/80">{f.label}</p>
                  <p className="text-[12px] text-white/30 mt-0.5 leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.6 }}
            className="relative z-10 mt-10 pt-6 border-t border-white/[0.06]"
          >
            <p className="text-[11px] text-white/20 tracking-wide">
              Trusted by content teams managing multiple brands daily.
            </p>
          </motion.div>
        </aside>

        {/* ── Right panel — form ── */}
        <section className="bg-[#fafafa] p-7 sm:p-10 lg:p-12 xl:p-14 flex flex-col justify-center">
          {/* Mobile logo */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="lg:hidden flex items-center gap-3 mb-10"
          >
            <div className="p-1.5 rounded-xl bg-gray-100 border border-gray-200">
              <img src={vaLogo} alt="Viral App logo" className="w-9 h-9" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-gray-900 tracking-tight">Viral App</p>
              <p className="text-[11px] text-gray-400">Content operations platform</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="mb-8"
          >
            <h1 className="text-[26px] sm:text-[30px] font-bold text-gray-900 tracking-tight">
              Welcome back
            </h1>
            <p className="mt-2 text-[14px] text-gray-400">
              Sign in to your account to continue.
            </p>
          </motion.div>

          <motion.form
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            onSubmit={handleLogin}
            className="space-y-5"
          >
            {/* Email */}
            <div>
              <label className="block text-[13px] font-medium text-gray-600 mb-1.5">Email</label>
              <div className={`relative rounded-xl transition-all duration-200 ${focusedField === 'email' ? 'ring-2 ring-primary-500/25 ring-offset-1 ring-offset-[#fafafa]' : ''}`}>
                <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-[16px] h-[16px] transition-colors duration-200 ${focusedField === 'email' ? 'text-primary-500' : 'text-gray-300'}`} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="you@example.com"
                  autoFocus
                  autoComplete="email"
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none text-[14px] bg-white placeholder:text-gray-300 text-gray-800"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[13px] font-medium text-gray-600 mb-1.5">Password</label>
              <div className={`relative rounded-xl transition-all duration-200 ${focusedField === 'password' ? 'ring-2 ring-primary-500/25 ring-offset-1 ring-offset-[#fafafa]' : ''}`}>
                <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-[16px] h-[16px] transition-colors duration-200 ${focusedField === 'password' ? 'text-primary-500' : 'text-gray-300'}`} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full pl-11 pr-12 py-3 border border-gray-200 rounded-xl focus:outline-none text-[14px] bg-white placeholder:text-gray-300 text-gray-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors duration-150"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <div className="pt-1">
              <motion.button
                type="submit"
                disabled={!email || !password || isLoading}
                whileTap={{ scale: 0.985 }}
                className="login-btn group w-full h-12 flex items-center justify-center gap-2.5 rounded-xl font-medium text-[14px] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
              >
                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    >
                      <Loader2 className="w-[18px] h-[18px] animate-spin" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="label"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      Sign In
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </motion.form>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="mt-8 text-center text-[12px] text-gray-300"
          >
            Protected by Supabase Auth
          </motion.p>
        </section>
      </motion.div>
    </div>
  )
}
