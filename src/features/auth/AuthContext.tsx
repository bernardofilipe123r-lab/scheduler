/**
 * AuthContext — provides authentication state to the entire app.
 * 
 * Single user model. If not logged in, the app shows the Login page.
 * Token and user info persisted in localStorage.
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  getAuthToken,
  setAuthToken,
  clearAuth,
  getStoredUser,
  setStoredUser,
  loginApi,
  getMeApi,
  logoutApi,
  type AuthUser,
} from './api/auth-api'

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser())
  const [isLoading, setIsLoading] = useState(() => !!getAuthToken())

  const isAuthenticated = !!user && !!getAuthToken()

  // On mount, validate existing token
  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      setIsLoading(false)
      return
    }

    getMeApi()
      .then((userData) => {
        setUser(userData)
        setStoredUser(userData)
      })
      .catch(() => {
        // Token invalid — clear everything
        clearAuth()
        setUser(null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginApi(email, password)
    setAuthToken(result.token)
    setStoredUser(result.user)
    setUser(result.user)
  }, [])

  const logout = useCallback(async () => {
    await logoutApi()
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const userData = await getMeApi()
      setUser(userData)
      setStoredUser(userData)
    } catch {
      // ignore
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
