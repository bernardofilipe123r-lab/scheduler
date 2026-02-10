/**
 * Authentication API client and React hooks.
 * 
 * Single-user auth system. Token stored in localStorage for persistence.
 */
import { apiClient } from '@/shared/api/client'

const AUTH_TOKEN_KEY = 'auth_token'
const AUTH_USER_KEY = 'auth_user'

// ============================================================================
// Token management (localStorage for persistence across sessions)
// ============================================================================

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredUser(user: AuthUser) {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ============================================================================
// Types
// ============================================================================

export interface AuthUser {
  email: string
  name: string
}

export interface LoginResponse {
  success: boolean
  token: string
  user: AuthUser
}

export interface ProfileResponse {
  success: boolean
  user: AuthUser
}

// ============================================================================
// API functions
// ============================================================================

export async function loginApi(email: string, password: string): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>('/api/auth/login', { email, password })
}

export async function getMeApi(): Promise<AuthUser> {
  return apiClient.get<AuthUser>('/api/auth/me', { headers: authHeaders() })
}

export async function changePasswordApi(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  return apiClient.post<{ success: boolean; message: string }>('/api/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  }, { headers: authHeaders() })
}

export async function updateProfileApi(data: { name?: string; email?: string }): Promise<ProfileResponse> {
  return apiClient.put<ProfileResponse>('/api/auth/profile', data, { headers: authHeaders() })
}

export async function logoutApi(): Promise<void> {
  try {
    await apiClient.post('/api/auth/logout', {}, { headers: authHeaders() })
  } catch {
    // Ignore errors on logout
  }
  clearAuth()
}
