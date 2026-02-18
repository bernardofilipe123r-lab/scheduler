import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

interface ContentPrompts {
  reels_prompt: string
  posts_prompt: string
  brand_description: string
}

export function useContentPrompts() {
  return useQuery({
    queryKey: ['brand-prompts'],
    queryFn: () => apiClient.get<ContentPrompts>('/api/v2/brands/prompts'),
  })
}

export function useUpdateContentPrompts() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<ContentPrompts>) =>
      apiClient.put<ContentPrompts>('/api/v2/brands/prompts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-prompts'] })
    },
  })
}
