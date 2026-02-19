/**
 * Authentication API — Supabase SDK.
 * All session/token management is handled by Supabase.
 */
import { supabase } from '@/shared/api/supabase'

export interface AuthUser {
  email: string
  name: string
  id: string
  avatarUrl: string
  role: string
  isAdmin: boolean
}

function extractRoleAndAdmin(rawUser: {
  role?: string | null
  app_metadata?: Record<string, unknown> | null
  user_metadata?: Record<string, unknown> | null
}) {
  const appMeta = rawUser.app_metadata ?? {}
  const userMeta = rawUser.user_metadata ?? {}
  const roles = [rawUser.role, appMeta.role, userMeta.role]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase())

  const isAdmin =
    roles.includes('admin') ||
    Boolean(appMeta.is_admin) ||
    Boolean(userMeta.is_admin)

  return {
    role: roles[0] || 'authenticated',
    isAdmin,
  }
}

export async function loginApi(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return {
    user: {
      email: data.user?.email || '',
      name: data.user?.user_metadata?.name || '',
      id: data.user?.id || '',
      avatarUrl: data.user?.user_metadata?.avatar_url || '',
      ...extractRoleAndAdmin(data.user || {}),
    },
  }
}

export async function logoutApi() {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export async function getSessionToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || null
}
