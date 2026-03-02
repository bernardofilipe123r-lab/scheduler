import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import type { NicheConfig } from '../types/niche-config'

const NICHE_CONFIG_KEY = ['niche-config'] as const

async function fetchNicheConfig(): Promise<NicheConfig> {
  return apiClient.get<NicheConfig>('/api/v2/brands/niche-config')
}

async function updateNicheConfig(data: Partial<NicheConfig>): Promise<NicheConfig> {
  return apiClient.put<NicheConfig>('/api/v2/brands/niche-config', data)
}

export function useNicheConfig() {
  return useQuery({
    queryKey: [...NICHE_CONFIG_KEY],
    queryFn: () => fetchNicheConfig(),
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

async function fetchAiUnderstanding(): Promise<AiUnderstanding> {
  return apiClient.post<AiUnderstanding>('/api/v2/brands/niche-config/ai-understanding', {})
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
  study_ref: string
}

async function fetchGeneratePostExample(data: { num_slides: number; existing_titles?: string[] }): Promise<GeneratedPostExample> {
  return apiClient.post<GeneratedPostExample>('/api/v2/brands/niche-config/generate-post-example', data)
}

export function useGeneratePostExample() {
  return useMutation({
    mutationFn: fetchGeneratePostExample,
  })
}

// Generate Post Examples Batch via DeepSeek

interface GeneratedPostExamplesBatch {
  posts: GeneratedPostExample[]
}

async function fetchGeneratePostExamplesBatch(data: { count: number; num_slides: number; existing_titles?: string[] }): Promise<GeneratedPostExamplesBatch> {
  return apiClient.post<GeneratedPostExamplesBatch>('/api/v2/brands/niche-config/generate-post-examples-batch', data, { timeout: 180_000 })
}

export function useGeneratePostExamplesBatch() {
  return useMutation({
    mutationFn: fetchGeneratePostExamplesBatch,
  })
}

// Generate Reel Examples Batch via DeepSeek

interface GeneratedReelExamplesBatch {
  reels: { title: string; content_lines: string[] }[]
}

async function fetchGenerateReelExamplesBatch(data: { count: number }): Promise<GeneratedReelExamplesBatch> {
  return apiClient.post<GeneratedReelExamplesBatch>('/api/v2/brands/niche-config/generate-reel-examples-batch', data, { timeout: 180_000 })
}

export function useGenerateReelExamplesBatch() {
  return useMutation({
    mutationFn: fetchGenerateReelExamplesBatch,
  })
}

// Suggest YouTube Titles via DeepSeek

interface SuggestedYtTitles {
  good_titles: string[]
  bad_titles: string[]
}

async function fetchSuggestYtTitles(): Promise<SuggestedYtTitles> {
  return apiClient.post<SuggestedYtTitles>('/api/v2/brands/niche-config/suggest-yt-titles', {})
}

export function useSuggestYtTitles() {
  return useMutation({
    mutationFn: fetchSuggestYtTitles,
  })
}

// Import Content DNA from Instagram

interface ImportFromInstagramResult {
  niche_name: string
  content_brief: string
  posts_analysed: number
}

async function fetchImportFromInstagram(data: { brand_id: string }): Promise<ImportFromInstagramResult> {
  return apiClient.post<ImportFromInstagramResult>('/api/v2/brands/niche-config/import-from-instagram', data, { timeout: 60_000 })
}

export function useImportFromInstagram() {
  return useMutation({
    mutationFn: fetchImportFromInstagram,
  })
}
