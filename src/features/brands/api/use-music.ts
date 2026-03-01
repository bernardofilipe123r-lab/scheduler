/**
 * Music track management hooks — per-user background music for reel videos.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { supabase } from '@/shared/api/supabase'

export interface MusicTrack {
  id: string
  user_id: string
  filename: string
  storage_url: string
  duration_seconds: number | null
  created_at: string
}

interface MusicListResponse {
  tracks: MusicTrack[]
  count: number
  max: number
}

const musicKeys = {
  all: ['music'] as const,
  list: () => [...musicKeys.all, 'list'] as const,
}

export function useUserMusic() {
  return useQuery({
    queryKey: musicKeys.list(),
    queryFn: () => apiClient.get<MusicListResponse>('/api/music'),
    staleTime: 5 * 60 * 1000,
  })
}

export function useUploadMusic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/music', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Upload failed' }))
        throw new Error(err.detail || 'Upload failed')
      }
      return res.json() as Promise<{ track: MusicTrack }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: musicKeys.all })
    },
  })
}

export function useDeleteMusic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (trackId: string) =>
      apiClient.delete<{ success: boolean }>(`/api/music/${trackId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: musicKeys.all })
    },
  })
}
