import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

export interface ContentPrompts {
  reels_prompt: string
  posts_prompt: string
  brand_description: string
}

const PROMPTS_KEY = ['brand-prompts'] as const

async function fetchPrompts(): Promise<ContentPrompts> {
  return apiClient.get<ContentPrompts>('/api/v2/brands/prompts')
}

async function updatePrompts(data: Partial<ContentPrompts>): Promise<ContentPrompts> {
  return apiClient.put<ContentPrompts>('/api/v2/brands/prompts', data)
}

export function useContentPrompts() {
  return useQuery({
    queryKey: PROMPTS_KEY,
    queryFn: fetchPrompts,
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateContentPrompts() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updatePrompts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROMPTS_KEY })
    },
  })
}
