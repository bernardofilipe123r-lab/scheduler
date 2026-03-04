/**
 * Trending music hooks — TikTok trending tracks for reel videos.
 */
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

export interface TrendingTrack {
  id: string
  tiktok_id: string | null
  title: string
  author: string | null
  play_url: string
  cover_url: string | null
  duration_seconds: number | null
  rank: number | null
  batch_id: string
  fetched_at: string
}

interface TrendingMusicResponse {
  tracks: TrendingTrack[]
  count: number
  batch_id: string | null
}

const trendingMusicKeys = {
  all: ['trending-music'] as const,
  list: () => [...trendingMusicKeys.all, 'list'] as const,
}

export function useTrendingMusic() {
  return useQuery({
    queryKey: trendingMusicKeys.list(),
    queryFn: () => apiClient.get<TrendingMusicResponse>('/api/trending-music'),
    staleTime: 30 * 60 * 1000, // 30 minutes — trending data changes 3x/day
  })
}
