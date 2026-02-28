/**
 * AuthContext — Supabase-backed authentication state.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/shared/api/supabase'
import { apiClient } from '@/shared/api/client'
import type { User } from '@supabase/supabase-js'
import type { AuthUser } from './api/auth-api'

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<{ needsEmailConfirmation: boolean }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

function extractRoleAndAdmin(supaUser: User) {
  const appMeta = (supaUser.app_metadata ?? {}) as Record<string, unknown>
  const userMeta = (supaUser.user_metadata ?? {}) as Record<string, unknown>
  const roles = [supaUser.role, appMeta.role, userMeta.role]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase())

  const isSuperAdmin =
    roles.includes('super_admin') ||
    Boolean(appMeta.is_super_admin) ||
    Boolean(userMeta.is_super_admin)

  const isAdmin =
    isSuperAdmin ||
    roles.includes('admin') ||
    Boolean(appMeta.is_admin) ||
    Boolean(userMeta.is_admin)

  return {
    role: roles[0] || 'authenticated',
    isAdmin,
    isSuperAdmin,
  }
}

function mapUser(supaUser: User | null): AuthUser | null {
  if (!supaUser) return null
  return {
    email: supaUser.email || '',
    name: supaUser.user_metadata?.name || '',
    id: supaUser.id,
    avatarUrl: supaUser.user_metadata?.avatar_url || '',
    onboardingCompleted: Boolean(supaUser.user_metadata?.onboarding_completed),
    ...extractRoleAndAdmin(supaUser),
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Validate session server-side (catches deleted users whose JWT is still cached)
    supabase.auth.getUser().then(({ data: { user: validatedUser }, error }) => {
      if (error || !validatedUser) {
        // Session is stale or user was deleted — clear local state
        supabase.auth.signOut().catch(() => {})
        setUser(null)
      } else {
        setUser(mapUser(validatedUser))
      }
      setIsLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(mapUser(session?.user ?? null))
      setIsLoading(false)

      // Sync backend user profile on every sign-in (idempotent)
      if (event === 'SIGNED_IN' && session?.user) {
        const u = session.user
        apiClient.post('/reels/users', {
          user_id: u.id,
          email: u.email ?? '',
          user_name: u.user_metadata?.name ?? '',
        }).catch(() => {})
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }

  const register = async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, onboarding_completed: false },
        emailRedirectTo: import.meta.env.VITE_APP_URL || window.location.origin,
      },
    })
    if (error) throw new Error(error.message)
    // Supabase silently returns success with empty identities when email is already registered
    if (data.user && data.user.identities?.length === 0) {
      throw new Error('An account with this email already exists. Please sign in instead.')
    }
    // If session is null, email confirmation is required
    return { needsEmailConfirmation: !data.session }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const refreshUser = async () => {
    const { data: { user: freshUser } } = await supabase.auth.getUser()
    setUser(mapUser(freshUser ?? null))
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
