import { useEffect, useState } from 'react'
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '@/shared/api/supabase'

function hasRecoveryParams() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const searchParams = new URLSearchParams(window.location.search)

  return (
    hashParams.get('type') === 'recovery' ||
    searchParams.get('type') === 'recovery' ||
    searchParams.has('code')
  )
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [canReset, setCanReset] = useState(false)

  useEffect(() => {
    let active = true

    const checkRecoveryState = async () => {
      // PKCE flow: exchange the code for a session first
      const searchParams = new URLSearchParams(window.location.search)
      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!active) return
        if (!error) {
          setCanReset(true)
          setIsReady(true)
          return
        }
      }

      // Implicit flow: check hash params + existing session
      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return

      setCanReset(Boolean(session) && hasRecoveryParams())
      setIsReady(true)
    }

    checkRecoveryState()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return

      if (event === 'PASSWORD_RECOVERY') {
        setCanReset(Boolean(session))
        setIsReady(true)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canReset) {
      toast.error('This reset link is invalid or expired')
      return
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      toast.success('Password updated successfully')
      navigate('/profile', { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update password'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_30px_120px_rgba(15,23,42,0.14)] lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
          <div className="flex flex-col justify-between bg-slate-950 px-8 py-10 text-white">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300/80">Account Security</p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight">Choose a new password</h1>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                This page finalizes the password recovery email flow. Set the new password here after opening the link from your inbox.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-start gap-3 text-sm text-slate-200">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-300" />
                <p>
                  Recovery links are time-limited. If this page says the link is invalid, request a fresh reset email from your profile page.
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <Link to="/login" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900">
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>

            <div className="mt-8 max-w-xl">
              <h2 className="text-2xl font-semibold text-gray-900">Reset password</h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                Enter your new password below. Once saved, your account will continue using the same email address.
              </p>

              {!isReady ? (
                <div className="mt-8 flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Validating your recovery session...
                </div>
              ) : canReset ? (
                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">New Password</label>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        className="w-full rounded-xl border border-gray-200 py-3 pl-11 pr-12 text-sm text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
                        placeholder="At least 6 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirm Password</label>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        className="w-full rounded-xl border border-gray-200 py-3 pl-11 pr-12 text-sm text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
                        placeholder="Re-enter the new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((value) => !value)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!password || !confirmPassword || isLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Update Password
                  </button>
                </form>
              ) : (
                <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-5 text-sm text-amber-800">
                  This recovery link is invalid, expired, or already used. Open your profile page and request a fresh password reset email.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
