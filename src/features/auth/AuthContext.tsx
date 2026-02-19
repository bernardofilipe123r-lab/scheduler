/**
 * AuthContext — Supabase-backed authentication state.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/shared/api/supabase'
import type { User } from '@supabase/supabase-js'
import type { AuthUser } from './api/auth-api'

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
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
    ...extractRoleAndAdmin(supaUser),
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(mapUser(session?.user ?? null))
      setIsLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(mapUser(session?.user ?? null))
      setIsLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(mapUser(session?.user ?? null))
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
