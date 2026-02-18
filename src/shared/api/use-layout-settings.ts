import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import type { GeneralSettings } from '@/shared/components/PostCanvas'

const LAYOUT_KEY = ['layout-settings'] as const

export function useLayoutSettings() {
  return useQuery({
    queryKey: LAYOUT_KEY,
    queryFn: () => apiClient.get<Partial<GeneralSettings>>('/api/v2/brands/settings/layout'),
    staleTime: 60_000,
  })
}

export function useUpdateLayoutSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (settings: GeneralSettings) =>
      apiClient.put<{ status: string }>('/api/v2/brands/settings/layout', settings),
    onSuccess: () => qc.invalidateQueries({ queryKey: LAYOUT_KEY }),
  })
}
