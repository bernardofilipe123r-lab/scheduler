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

// Reel Preview — calls the real ImageGenerator on the backend

interface ReelPreview {
  thumbnail_base64: string
  content_base64: string
}

async function fetchReelPreview(data: { brand_id: string; title: string; content_lines: string[] }): Promise<ReelPreview> {
  return apiClient.post<ReelPreview>('/api/v2/brands/niche-config/preview-reel', data)
}

export function useReelPreview() {
  return useMutation({
    mutationFn: fetchReelPreview,
  })
}

// Generate Post Example via DeepSeek

interface GeneratedPostExample {
  title: string
  slides: string[]
  doi: string
}

async function fetchGeneratePostExample(data: { brand_id?: string; num_slides: number; existing_titles?: string[] }): Promise<GeneratedPostExample> {
  return apiClient.post<GeneratedPostExample>('/api/v2/brands/niche-config/generate-post-example', data)
}

export function useGeneratePostExample() {
  return useMutation({
    mutationFn: fetchGeneratePostExample,
  })
}

// Suggest YouTube Titles via DeepSeek

interface SuggestedYtTitles {
  good_titles: string[]
  bad_titles: string[]
}

async function fetchSuggestYtTitles(brandId?: string): Promise<SuggestedYtTitles> {
  const url = brandId
    ? `/api/v2/brands/niche-config/suggest-yt-titles?brand_id=${encodeURIComponent(brandId)}`
    : '/api/v2/brands/niche-config/suggest-yt-titles'
  return apiClient.post<SuggestedYtTitles>(url, {})
}

export function useSuggestYtTitles() {
  return useMutation({
    mutationFn: fetchSuggestYtTitles,
  })
}
