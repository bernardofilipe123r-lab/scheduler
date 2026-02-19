/**
 * Profile Page — view/edit profile info, change password & email via Supabase.
 */
import { useState, useEffect } from 'react'
import { User, Mail, KeyRound, Loader2, ArrowLeft, Pencil, Send, ShieldCheck, Camera } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/features/auth'
import { supabase } from '@/shared/api/supabase'

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
    refreshUser()
  }, [])

  useEffect(() => {
    if (user?.name) setDisplayName(user.name)
    setAvatarUrl(user?.avatarUrl || '')
  }, [user?.name, user?.avatarUrl])

  const userInitial = (displayName || user?.name || 'U').charAt(0).toUpperCase()

  const nameChanged = displayName !== (user?.name || '')

  const handleSaveName = async () => {
    if (!nameChanged) return
    setNameSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ data: { name: displayName } })
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
      const { error } = await supabase.auth.resetPasswordForEmail(user.email)
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
    if (!newEmail) return
    setEmailSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail })
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

          // Center-crop to a square so avatar rendering is consistent everywhere.
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
    <div className="max-w-3xl space-y-6">
      {/* Header */}
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

      {/* Profile Info Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-primary-500" />
            Account Information
          </h2>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <div className="flex items-center gap-4 min-w-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName || 'User avatar'} className="w-16 h-16 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-2xl font-bold border border-primary-200">
                  {userInitial}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">Profile Image</p>
                <p className="text-xs text-gray-500 truncate">Upload a square image for the best result.</p>
              </div>
            </div>

            <label className="shrink-0">
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
                disabled={avatarSaving}
              />
              <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer text-sm font-medium">
                {avatarSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {avatarSaving ? 'Uploading...' : 'Upload Image'}
              </span>
            </label>
          </div>

          {/* Editable Display Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Display Name</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Pencil className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  style={{ paddingLeft: "42px" }}
                />
              </div>
              {nameChanged && (
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={nameSaving}
                  className="flex items-center gap-2 px-5 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors whitespace-nowrap"
                >
                  {nameSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save
                </button>
              )}
            </div>
          </div>

          {/* Email (read-only with badge) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
              Email Address
              <span className="text-xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full font-normal">
                Change email below
              </span>
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={user?.email || ''}
                readOnly
                className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-600"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Change Email Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary-500" />
            Change Email Address
          </h2>
        </div>

        <form onSubmit={handleChangeEmail} className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
            <ShieldCheck className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <p>
              For security, confirmation links will be sent to both your current and new email addresses.
              The change takes effect only after both are confirmed.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">New Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Enter new email address"
                className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                style={{ paddingLeft: "42px" }}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!newEmail || emailSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {emailSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Change Email
            </button>
          </div>
        </form>
      </div>

      {/* Password Reset Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary-500" />
            Change Password
          </h2>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
            <ShieldCheck className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <p>
              For security, password changes require email verification.
              Click the button below and we'll send a password reset link to your email.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={resetSending}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {resetSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Password Reset Email
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
