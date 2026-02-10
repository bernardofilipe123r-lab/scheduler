/**
 * HTTP client with error handling and interceptors
 */

const BASE_URL = import.meta.env.VITE_API_URL || ''

export interface ApiError {
  message: string
  status: number
}

export interface RequestOptions {
  headers?: Record<string, string>
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
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: options?.headers,
  })
  return handleResponse<T>(response)
}

export async function post<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    body: data ? JSON.stringify(data) : undefined,
  })
  return handleResponse<T>(response)
}

export async function put<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    body: data ? JSON.stringify(data) : undefined,
  })
  return handleResponse<T>(response)
}

export async function del<T>(endpoint: string, options?: RequestOptions): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'DELETE',
    headers: options?.headers,
  })
  return handleResponse<T>(response)
}

export async function patch<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
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

