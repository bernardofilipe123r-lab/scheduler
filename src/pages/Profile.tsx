/**
 * Profile Page — view/edit profile info, change password & email via Supabase.
 */
import { useState, useEffect } from 'react'
import { User, Mail, KeyRound, Loader2, ArrowLeft, Pencil, Send, ShieldCheck, Camera } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/features/auth'
import { buildAppUrl, supabase } from '@/shared/api/supabase'

export function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  // Display name editing
  const [displayName, setDisplayName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)

  // Password reset
  const [resetSending, setResetSending] = useState(false)

  // Email change
  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarSaving, setAvatarSaving] = useState(false)

  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  useEffect(() => {
    if (user?.name) setDisplayName(user.name)
    setAvatarUrl(user?.avatarUrl || '')
  }, [user?.name, user?.avatarUrl])

  const trimmedDisplayName = displayName.trim()
  const userInitial = (displayName || user?.name || 'U').charAt(0).toUpperCase()
  const currentName = (user?.name || '').trim()
  const currentEmail = user?.email || ''
  const sanitizedNewEmail = newEmail.trim()
  const nameChanged = trimmedDisplayName !== currentName

  const handleSaveName = async () => {
    if (!nameChanged || !trimmedDisplayName) return
    setNameSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ data: { name: trimmedDisplayName } })
      if (error) throw new Error(error.message)
      await refreshUser()
      toast.success('Display name updated')
    } catch {
      toast.error('Failed to update display name')
    } finally {
      setNameSaving(false)
    }
  }

  const handlePasswordReset = async () => {
    if (!user?.email) {
      toast.error('No email address found')
      return
    }
    setResetSending(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: buildAppUrl('/reset-password'),
      })
      if (error) throw new Error(error.message)
      toast.success('Password reset email sent — check your inbox')
    } catch {
      toast.error('Failed to send password reset email')
    } finally {
      setResetSending(false)
    }
  }

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sanitizedNewEmail) return
    setEmailSaving(true)
    try {
      const { error } = await supabase.auth.updateUser(
        { email: sanitizedNewEmail },
        { emailRedirectTo: buildAppUrl('/profile') },
      )
      if (error) throw new Error(error.message)
      toast.success('A confirmation email has been sent to your new email address. The change will take effect once confirmed.')
      setNewEmail('')
    } catch {
      toast.error('Failed to initiate email change')
    } finally {
      setEmailSaving(false)
    }
  }

  const imageFileToDataUrl = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Failed to read image file'))
      reader.onload = () => {
        const image = new Image()
        image.onerror = () => reject(new Error('Invalid image file'))
        image.onload = () => {
          const targetSize = 256
          const smallestSide = Math.min(image.width, image.height)
          const sourceX = (image.width - smallestSide) / 2
          const sourceY = (image.height - smallestSide) / 2

          const canvas = document.createElement('canvas')
          canvas.width = targetSize
          canvas.height = targetSize
          const context = canvas.getContext('2d')
          if (!context) {
            reject(new Error('Failed to process image'))
            return
          }

          context.drawImage(
            image,
            sourceX,
            sourceY,
            smallestSide,
            smallestSide,
            0,
            0,
            targetSize,
            targetSize,
          )

          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        image.src = String(reader.result)
      }
      reader.readAsDataURL(file)
    })
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      e.target.value = ''
      return
    }

    setAvatarSaving(true)
    try {
      const avatarDataUrl = await imageFileToDataUrl(file)
      const { error } = await supabase.auth.updateUser({ data: { avatar_url: avatarDataUrl } })
      if (error) throw new Error(error.message)
      setAvatarUrl(avatarDataUrl)
      await refreshUser()
      toast.success('Profile image updated')
    } catch {
      toast.error('Failed to update profile image')
    } finally {
      setAvatarSaving(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName || 'User avatar'} className="w-8 h-8 rounded-full object-cover border border-gray-200" />
              ) : (
                <User className="w-7 h-7 text-primary-500" />
              )}
              Profile
            </h1>
            <p className="text-gray-500 mt-1">Manage your account information</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[540px]">
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Display Name</p>
            <p className="mt-2 truncate text-sm font-semibold text-gray-900">{currentName || 'Not set'}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Email</p>
            <p className="mt-2 truncate text-sm font-semibold text-gray-900">{currentEmail || 'No email found'}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Security</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">Email-verified flows</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <aside className="self-start space-y-6 xl:sticky xl:top-8">
          <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-sm">
            <div className="bg-gradient-to-br from-primary-50 via-white to-amber-50 px-6 py-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-600">Account Overview</p>
                  <h2 className="mt-3 text-xl font-semibold text-gray-900">Keep your profile current</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    Profile changes update your Supabase account directly. Email and password changes always require confirmation links.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm">
                  <ShieldCheck className="h-6 w-6 text-primary-500" />
                </div>
              </div>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="flex flex-col items-center rounded-3xl border border-gray-200 bg-gray-50 px-5 py-6 text-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName || 'User avatar'} className="h-24 w-24 rounded-full border border-gray-200 object-cover shadow-sm" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border border-primary-200 bg-primary-100 text-3xl font-bold text-primary-700 shadow-sm">
                    {userInitial}
                  </div>
                )}
                <p className="mt-4 text-lg font-semibold text-gray-900">{currentName || 'Unnamed user'}</p>
                <p className="mt-1 truncate text-sm text-gray-500">{currentEmail || 'No email found'}</p>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-gray-200 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Current email</p>
                  <p className="mt-2 break-all text-sm font-medium text-gray-900">{currentEmail || 'No email found'}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Change policy</p>
                  <p className="mt-2 text-sm text-gray-600">Email changes and password resets only complete after the verification link flow finishes.</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="grid gap-6 2xl:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm 2xl:col-span-2">
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-gray-900">
                <User className="w-5 h-5 text-primary-500" />
                Account Information
              </h2>
            </div>

            <div className="grid gap-6 p-6 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
              <div className="flex flex-col justify-between rounded-3xl border border-gray-200 bg-gray-50 p-5">
                <div className="flex items-center gap-4 min-w-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName || 'User avatar'} className="w-16 h-16 rounded-full object-cover border border-gray-200" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary-200 bg-primary-100 text-2xl font-bold text-primary-700">
                      {userInitial}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">Profile Image</p>
                    <p className="text-xs leading-5 text-gray-500">Upload a square image for the best result.</p>
                  </div>
                </div>

                <label className="mt-6 inline-flex shrink-0 self-start">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    disabled={avatarSaving}
                  />
                  <span className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100">
                    {avatarSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    {avatarSaving ? 'Uploading...' : 'Upload Image'}
                  </span>
                </label>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Display Name</label>
                  <div className="flex flex-col gap-2 lg:flex-row">
                    <div className="relative flex-1">
                      <Pencil className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 py-3 pl-12 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                        style={{ paddingLeft: '42px' }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveName}
                      disabled={!nameChanged || !trimmedDisplayName || nameSaving}
                      className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary-500 px-5 py-3 font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50 lg:min-w-[132px]"
                    >
                      {nameSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Save
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                    Email Address
                    <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-normal text-primary-600">
                      Change email below
                    </span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={currentEmail}
                      readOnly
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-12 pr-4 text-gray-600"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-gray-900">
                <Mail className="w-5 h-5 text-primary-500" />
                Change Email Address
              </h2>
            </div>

            <form onSubmit={handleChangeEmail} className="space-y-4 p-6">
              <div className="flex items-start gap-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">
                <ShieldCheck className="mt-0.5 w-5 h-5 flex-shrink-0" />
                <p>
                  For security, confirmation links will be sent to both your current and new email addresses.
                  The change takes effect only after both are confirmed.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">New Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Enter new email address"
                    className="w-full rounded-xl border border-gray-200 py-3 pl-12 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
                    style={{ paddingLeft: '42px' }}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!sanitizedNewEmail || sanitizedNewEmail === currentEmail || emailSaving}
                  className="flex items-center gap-2 rounded-xl bg-primary-500 px-6 py-2.5 font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {emailSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Change Email
                </button>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-gray-900">
                <KeyRound className="w-5 h-5 text-primary-500" />
                Change Password
              </h2>
            </div>

            <div className="space-y-4 p-6">
              <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                <ShieldCheck className="mt-0.5 w-5 h-5 flex-shrink-0" />
                <p>
                  For security, password changes require email verification.
                  Click the button below and we'll send a password reset link to your email.
                </p>
              </div>

              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                The reset link now returns to an in-app password form so the flow can finish correctly after the email is opened.
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={resetSending}
                  className="flex items-center gap-2 rounded-xl bg-primary-500 px-6 py-2.5 font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resetSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Password Reset Email
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
