import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import type { NicheConfig } from '../types/niche-config'

const NICHE_CONFIG_KEY = ['niche-config'] as const

async function fetchNicheConfig(brandId?: string): Promise<NicheConfig> {
  const url = brandId
    ? `/api/v2/brands/niche-config?brand_id=${encodeURIComponent(brandId)}`
    : '/api/v2/brands/niche-config'
  return apiClient.get<NicheConfig>(url)
}

async function updateNicheConfig(data: Partial<NicheConfig> & { brand_id?: string | null }): Promise<NicheConfig> {
  return apiClient.put<NicheConfig>('/api/v2/brands/niche-config', data)
}

export function useNicheConfig(brandId?: string) {
  return useQuery({
    queryKey: [...NICHE_CONFIG_KEY, brandId ?? 'global'],
    queryFn: () => fetchNicheConfig(brandId),
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateNicheConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateNicheConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NICHE_CONFIG_KEY })
    },
  })
}

// AI Understanding

interface AiUnderstanding {
  understanding: string
  example_reel: { title: string; content_lines: string[] } | null
  example_post: { title: string; slides: string[] } | null
}

async function fetchAiUnderstanding(brandId?: string): Promise<AiUnderstanding> {
  const url = brandId
    ? `/api/v2/brands/niche-config/ai-understanding?brand_id=${encodeURIComponent(brandId)}`
    : '/api/v2/brands/niche-config/ai-understanding'
  return apiClient.post<AiUnderstanding>(url, {})
}

export function useAiUnderstanding() {
  return useMutation({
    mutationFn: fetchAiUnderstanding,
  })
}
