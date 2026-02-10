/**
 * Settings API hooks for managing application settings.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

// Types
export interface Setting {
  key: string
  value: string | null
  description: string | null
  category: string | null
  value_type: 'string' | 'number' | 'boolean' | 'json'
  sensitive: boolean
  updated_at: string | null
  source?: 'database' | 'environment' | 'default'
  has_env_var?: boolean
  env_var_name?: string
}

export interface SettingsResponse {
  settings: Setting[]
  grouped: Record<string, Setting[]>
  count: number
}

// Query keys
export const settingsKeys = {
  all: ['settings'] as const,
  list: (category?: string) => [...settingsKeys.all, 'list', category || 'all'] as const,
  categories: () => [...settingsKeys.all, 'categories'] as const,
  detail: (key: string) => [...settingsKeys.all, 'detail', key] as const,
}

// API functions
async function fetchSettings(category?: string): Promise<SettingsResponse> {
  const url = category ? `/api/settings?category=${category}` : '/api/settings'
  return apiClient.get<SettingsResponse>(url)
}

async function fetchCategories(): Promise<string[]> {
  const response = await apiClient.get<{ categories: string[] }>('/api/settings/categories')
  return response.categories
}

async function fetchSetting(key: string): Promise<Setting> {
  return apiClient.get<Setting>(`/api/settings/${key}`)
}

async function updateSetting(key: string, value: string): Promise<Setting> {
  const response = await apiClient.put<{ success: boolean; setting: Setting }>(`/api/settings/${key}`, { value })
  return response.setting
}

async function bulkUpdateSettings(settings: Record<string, string>): Promise<{ updated: string[]; errors: string[] }> {
  return apiClient.post<{ updated: string[]; errors: string[] }>('/api/settings/bulk', { settings })
}

// ============================================================================
// Session token helpers (password gate)
// ============================================================================

const SETTINGS_TOKEN_KEY = 'settings_access_token'

export function getSettingsToken(): string | null {
  return localStorage.getItem(SETTINGS_TOKEN_KEY)
}

export function setSettingsToken(token: string) {
  localStorage.setItem(SETTINGS_TOKEN_KEY, token)
}

export function clearSettingsToken() {
  localStorage.removeItem(SETTINGS_TOKEN_KEY)
}

// Hooks

/**
 * Verify access password — returns a session token on success
 */
export function useVerifyAccess() {
  return useMutation({
    mutationFn: async (password: string) => {
      const response = await apiClient.post<{ success: boolean; token: string }>(
        '/api/settings/verify-access',
        { password }
      )
      if (response.token) {
        setSettingsToken(response.token)
      }
      return response
    },
  })
}

/**
 * Fetch all settings, optionally filtered by category
 */
export function useSettings(category?: string) {
  return useQuery({
    queryKey: settingsKeys.list(category),
    queryFn: () => fetchSettings(category),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Fetch all setting categories
 */
export function useSettingCategories() {
  return useQuery({
    queryKey: settingsKeys.categories(),
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Fetch a single setting by key
 */
export function useSetting(key: string) {
  return useQuery({
    queryKey: settingsKeys.detail(key),
    queryFn: () => fetchSetting(key),
    enabled: !!key,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Update a single setting
 */
export function useUpdateSetting() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => updateSetting(key, value),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.detail(variables.key) })
      queryClient.invalidateQueries({ queryKey: settingsKeys.all })
    },
  })
}

/**
 * Bulk update multiple settings
 */
export function useBulkUpdateSettings() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: bulkUpdateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all })
    },
  })
}
