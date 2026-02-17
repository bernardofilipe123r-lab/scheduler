import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { youtubeApi } from '../api'

// Query key for YouTube status
const YOUTUBE_STATUS_KEY = ['youtube', 'status']

/**
 * Hook to get YouTube connection status for all brands
 */
export function useYouTubeStatus() {
  return useQuery({
    queryKey: YOUTUBE_STATUS_KEY,
    queryFn: youtubeApi.getStatus,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  })
}

/**
 * Hook to disconnect a brand from YouTube
 */
export function useDisconnectYouTube() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (brand: string) => youtubeApi.disconnect(brand),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: YOUTUBE_STATUS_KEY })
    },
  })
}

/**
 * Start YouTube OAuth flow for a brand (authenticated)
 */
export async function connectYouTube(brand: string): Promise<string> {
  return youtubeApi.connectBrand(brand)
}
