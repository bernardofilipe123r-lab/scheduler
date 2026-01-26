import { get, post } from '@/shared/api'

// YouTube connection status for a single brand
export interface YouTubeBrandStatus {
  connected: boolean
  channel_id: string | null
  channel_name: string | null
  source: 'file' | 'env' | null
}

// Overall YouTube status response
export interface YouTubeStatusResponse {
  brands: Record<string, YouTubeBrandStatus>
  quota: {
    used: number
    limit: number
    remaining: number
    reset_time: string
    can_upload: boolean
    upload_cost: number
  }
  oauth_configured: boolean
}

// API functions for YouTube
export const youtubeApi = {
  // Get connection status for all brands
  getStatus: () => get<YouTubeStatusResponse>('/api/youtube/status'),
  
  // Get the connect URL for a brand (returns redirect URL)
  getConnectUrl: (brand: string) => `/api/youtube/connect?brand=${brand}`,
  
  // Get quota status
  getQuota: () => get<YouTubeStatusResponse['quota']>('/api/youtube/quota'),
  
  // Disconnect a brand from YouTube
  disconnect: (brand: string) => post<{ success: boolean; message: string }>(`/api/youtube/disconnect/${brand}`),
}
