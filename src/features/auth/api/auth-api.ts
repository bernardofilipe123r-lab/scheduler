/**
 * Authentication API — Supabase SDK.
 * All session/token management is handled by Supabase.
 */
import { supabase } from '@/shared/api/supabase'

export interface AuthUser {
  email: string
  name: string
  id: string
}

export async function loginApi(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return {
    user: {
      email: data.user?.email || '',
      name: data.user?.user_metadata?.name || '',
      id: data.user?.id || '',
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
