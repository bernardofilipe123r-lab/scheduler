/**
 * Login / Register / Verify-Email Page
 */
import { useState, useEffect } from 'react'
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowRight, ArrowLeft, Zap, BarChart3, Globe, User, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '@/features/auth'
import vaLogo from '@/assets/icons/va-logo.svg'

type Mode = 'login' | 'register' | 'verify-email'

const FEATURES = [
  { icon: Zap, label: 'AI-Powered Generation', desc: 'Create high-converting reels, carousels & posts in seconds' },
  { icon: Globe, label: 'Multi-Platform Publishing', desc: 'Instagram, Facebook & YouTube — all from one dashboard' },
  { icon: BarChart3, label: 'Performance Analytics', desc: 'Track engagement, reach & growth across all your brands' },
]

function InputField({
  icon: Icon,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  focusedField,
  fieldName,
  onFocus,
  onBlur,
  rightElement,
}: {
  icon: typeof Mail
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoComplete?: string
  autoFocus?: boolean
  focusedField: string | null
  fieldName: string
  onFocus: (f: string) => void
  onBlur: () => void
  rightElement?: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-gray-600 mb-1.5">{label}</label>
      <div className={`relative rounded-xl transition-all duration-200 ${focusedField === fieldName ? 'ring-2 ring-primary-500/25 ring-offset-1 ring-offset-[#fafafa]' : ''}`}>
        <Icon className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 z-10 pointer-events-none transition-colors duration-200 ${focusedField === fieldName ? 'text-primary-500' : 'text-gray-300'}`} />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onFocus(fieldName)}
          onBlur={onBlur}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          className={`w-full pl-11 ${rightElement ? 'pr-12' : 'pr-4'} py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:shadow-none text-[14px] bg-white placeholder:text-gray-300 text-gray-800`}
        />
        {rightElement}
      </div>
    </div>
  )
}

export function LoginPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')

  // Set dark overscroll background while on login page
  useEffect(() => {
    const prev = document.documentElement.style.backgroundColor
    document.documentElement.style.backgroundColor = '#060a10'
    return () => { document.documentElement.style.backgroundColor = prev }
  }, [])

  // Shared
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  // Register-only
  const [name, setName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const switchMode = (m: Mode) => {
    setMode(m)
    setShowPassword(false)
    setShowConfirmPassword(false)
  }

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email || !password || !confirmPassword) return
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setIsLoading(true)
    try {
      const { needsEmailConfirmation } = await register(email.trim(), password, name.trim())
      if (needsEmailConfirmation) {
        setMode('verify-email')
      }
      // If no confirmation needed, onAuthStateChange handles redirect
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed'
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const passwordToggle = (show: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      tabIndex={-1}
      className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors duration-150"
    >
      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  )

  const submitButton = (label: string, disabled: boolean) => (
    <div className="pt-1">
      <motion.button
        type="submit"
        disabled={disabled || isLoading}
        whileTap={{ scale: 0.985 }}
        className="login-btn group w-full h-12 flex items-center justify-center gap-2.5 rounded-xl font-medium text-[14px] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
      >
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.span key="loading" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
              <Loader2 className="w-[18px] h-[18px] animate-spin" />
            </motion.span>
          ) : (
            <motion.span key="label" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
              {label}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )

  const fieldProps = { focusedField, onFocus: setFocusedField, onBlur: () => setFocusedField(null) }

  // ── Right panel content per mode ──
  const renderRightPanel = () => {
    if (mode === 'verify-email') {
      return (
        <motion.div key="verify" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col items-center text-center py-6">
          <div className="w-16 h-16 rounded-2xl bg-primary-500/10 flex items-center justify-center mb-6">
            <CheckCircle2 className="w-8 h-8 text-primary-500" />
          </div>
          <h1 className="text-[26px] sm:text-[30px] font-bold text-gray-900 tracking-tight">Check your inbox</h1>
          <p className="mt-3 text-[14px] text-gray-400 max-w-[320px]">
            We sent a verification link to:
          </p>
          <div className="mt-3 px-5 py-2.5 bg-gray-100 rounded-xl border border-gray-200">
            <p className="text-[14px] font-medium text-gray-700">{email}</p>
          </div>
          <p className="mt-5 text-[13px] text-gray-400 max-w-[300px] leading-relaxed">
            Click the link in the email to activate your account and start setting up.
          </p>
          <button
            onClick={() => switchMode('login')}
            className="mt-8 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-500 hover:text-primary-600 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </button>
        </motion.div>
      )
    }

    if (mode === 'register') {
      return (
        <motion.div key="register" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <div className="mb-8">
            <h1 className="text-[26px] sm:text-[30px] font-bold text-gray-900 tracking-tight">Create account</h1>
            <p className="mt-2 text-[14px] text-gray-400">Get started with your content operations.</p>
          </div>
          <form onSubmit={handleRegister} className="space-y-4">
            <InputField icon={User} label="Full Name" value={name} onChange={setName} placeholder="Jane Doe" autoComplete="name" autoFocus fieldName="name" {...fieldProps} />
            <InputField icon={Mail} label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" fieldName="email" {...fieldProps} />
            <InputField
              icon={Lock} label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={setPassword}
              placeholder="Min. 6 characters" autoComplete="new-password" fieldName="password" {...fieldProps}
              rightElement={passwordToggle(showPassword, () => setShowPassword(!showPassword))}
            />
            <InputField
              icon={Lock} label="Confirm Password" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={setConfirmPassword}
              placeholder="Re-enter your password" autoComplete="new-password" fieldName="confirm" {...fieldProps}
              rightElement={passwordToggle(showConfirmPassword, () => setShowConfirmPassword(!showConfirmPassword))}
            />
            {submitButton('Create Account', !name.trim() || !email || !password || !confirmPassword)}
          </form>
          <p className="mt-6 text-center text-[13px] text-gray-400">
            Already have an account?{' '}
            <button onClick={() => switchMode('login')} className="font-medium text-primary-500 hover:text-primary-600 transition-colors">
              Sign in
            </button>
          </p>
        </motion.div>
      )
    }

    // Login (default)
    return (
      <motion.div key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
        <div className="mb-8">
          <h1 className="text-[26px] sm:text-[30px] font-bold text-gray-900 tracking-tight">Welcome back</h1>
          <p className="mt-2 text-[14px] text-gray-400">Sign in to your account to continue.</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-5">
          <InputField icon={Mail} label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" autoFocus fieldName="email" {...fieldProps} />
          <InputField
            icon={Lock} label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={setPassword}
            placeholder="Enter your password" autoComplete="current-password" fieldName="password" {...fieldProps}
            rightElement={passwordToggle(showPassword, () => setShowPassword(!showPassword))}
          />
          {submitButton('Sign In', !email || !password)}
        </form>
        <p className="mt-6 text-center text-[13px] text-gray-400">
          Don't have an account?{' '}
          <button onClick={() => switchMode('register')} className="font-medium text-primary-500 hover:text-primary-600 transition-colors">
            Create one
          </button>
        </p>
      </motion.div>
    )
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
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500/[0.07] via-transparent to-blue-600/[0.04]" />
          <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-primary-500/[0.06] blur-[100px]" />
          <div className="absolute -bottom-24 -right-24 w-64 h-64 rounded-full bg-blue-500/[0.04] blur-[80px]" />

          <div className="relative z-10">
            <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="inline-flex items-center gap-3">
              <div className="p-1.5 rounded-xl bg-white/[0.06] border border-white/[0.08]">
                <img src={vaLogo} alt="Viral App logo" className="w-9 h-9" />
              </div>
              <span className="text-[15px] font-semibold tracking-tight text-white/90">Viral App</span>
            </motion.div>

            <motion.h2 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="mt-12 text-[28px] xl:text-[32px] font-bold leading-[1.2] tracking-tight text-white">
              Your content
              <br />
              command center.
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5 }} className="mt-4 text-[14px] text-white/40 leading-relaxed max-w-[320px]">
              Create, schedule, and publish across every brand — all from a single, focused dashboard.
            </motion.p>
          </div>

          <div className="relative z-10 space-y-3 mt-12">
            {FEATURES.map((f, i) => (
              <motion.div key={f.label} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.55 + i * 0.1, duration: 0.5 }} className="group flex items-start gap-3.5 p-3 -mx-3 rounded-xl hover:bg-white/[0.03] transition-colors duration-300">
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

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.6 }} className="relative z-10 mt-10 pt-6 border-t border-white/[0.06]">
            <p className="text-[11px] text-white/20 tracking-wide">
              Trusted by content teams managing multiple brands daily.
            </p>
          </motion.div>
        </aside>

        {/* ── Right panel ── */}
        <section className="bg-[#fafafa] p-7 sm:p-8 lg:p-10 xl:p-12 flex flex-col justify-center">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="p-1.5 rounded-xl bg-gray-100 border border-gray-200">
              <img src={vaLogo} alt="Viral App logo" className="w-9 h-9" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-gray-900 tracking-tight">Viral App</p>
              <p className="text-[11px] text-gray-400">Content operations platform</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {renderRightPanel()}
          </AnimatePresence>

          <p className="mt-8 text-center text-[12px] text-gray-300">
            Protected by Supabase Auth
          </p>
        </section>
      </motion.div>
    </div>
  )
}
