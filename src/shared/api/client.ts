/**
 * HTTP client with error handling — auto-attaches Supabase JWT.
 */
import { supabase } from './supabase'

const BASE_URL = import.meta.env.VITE_API_URL || ''
const REQUEST_TIMEOUT_MS = 30_000

export interface ApiError {
  message: string
  status: number
}

export interface RequestOptions {
  headers?: Record<string, string>
}

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  return fetch(url, { ...init, signal: controller.signal })
    .catch((err) => {
      if (err.name === 'AbortError') {
        throw { message: `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`, status: 408 } as ApiError
      }
      throw err
    })
    .finally(() => clearTimeout(timer))
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ApiError = {
      message: `HTTP error ${response.status}`,
      status: response.status,
    }
    try {
      const data = await response.json()
      error.message = data.detail || data.message || error.message
    } catch {
      // Ignore JSON parse errors
    }
    throw error
  }
  return response.json()
}

export async function get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
  const auth = await authHeaders()
  const response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
    headers: { ...auth, ...options?.headers },
  })
  return handleResponse<T>(response)
}

export async function post<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
  const auth = await authHeaders()
  const response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...auth,
      ...options?.headers,
    },
    body: data ? JSON.stringify(data) : undefined,
  })
  return handleResponse<T>(response)
}

export async function put<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
  const auth = await authHeaders()
  const response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...auth,
      ...options?.headers,
    },
    body: data ? JSON.stringify(data) : undefined,
  })
  return handleResponse<T>(response)
}

export async function del<T>(endpoint: string, options?: RequestOptions): Promise<T> {
  const auth = await authHeaders()
  const response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
    method: 'DELETE',
    headers: { ...auth, ...options?.headers },
  })
  return handleResponse<T>(response)
}

export async function patch<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
  const auth = await authHeaders()
  const response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...auth,
      ...options?.headers,
    },
    body: data ? JSON.stringify(data) : undefined,
  })
  return handleResponse<T>(response)
}

// Convenience object for importing as a namespace
export const apiClient = {
  get,
  post,
  put,
  delete: del,
  patch,
}

