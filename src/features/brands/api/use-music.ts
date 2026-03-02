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
  weight: number
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
    mutationFn: async ({ file, onProgress }: { file: File; onProgress?: (pct: number) => void }) => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const formData = new FormData()
      formData.append('file', file)

      return new Promise<{ track: MusicTrack }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/music')
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100))
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText))
            } catch {
              reject(new Error('Invalid response'))
            }
          } else {
            try {
              const err = JSON.parse(xhr.responseText)
              reject(new Error(err.detail || 'Upload failed'))
            } catch {
              reject(new Error('Upload failed'))
            }
          }
        })

        xhr.addEventListener('error', () => reject(new Error('Upload failed')))
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))
        xhr.send(formData)
      })
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

export function useUpdateMusicWeight() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ trackId, weight }: { trackId: string; weight: number }) =>
      apiClient.patch<{ track: MusicTrack }>(`/api/music/${trackId}/weight`, { weight }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: musicKeys.all })
    },
  })
}

export function useSaveMusicWeights() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: { trackId: string; weight: number }[]) => {
      await Promise.all(
        updates.map(({ trackId, weight }) =>
          apiClient.patch<{ track: MusicTrack }>(`/api/music/${trackId}/weight`, { weight })
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: musicKeys.all })
    },
  })
}
