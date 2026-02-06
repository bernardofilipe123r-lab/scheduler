/**
 * API types and functions for brand analytics
 */
import { get, post } from '@/shared/api'

// Platform metrics
export interface PlatformMetrics {
  platform: string
  followers_count: number
  views_last_7_days: number
  likes_last_7_days: number
  last_fetched_at: string | null
  extra_metrics?: Record<string, unknown>
}

// Brand metrics across all platforms
export interface BrandMetrics {
  brand: string
  display_name: string
  color: string
  platforms: Record<string, PlatformMetrics>
  totals: {
    followers: number
    views_7d: number
    likes_7d: number
  }
}

// Rate limit information
export interface RateLimitInfo {
  remaining: number
  max_per_day: number
  next_available_at: string | null
  can_refresh: boolean
}

// Response from /api/analytics
export interface AnalyticsResponse {
  brands: BrandMetrics[]
  rate_limit: RateLimitInfo
  last_refresh: string | null
}

// Response from /api/analytics/refresh
export interface RefreshResponse {
  success: boolean
  message: string
  updated_count?: number
  errors?: string[]
  rate_limit: RateLimitInfo
  analytics?: BrandMetrics[]
}

// Single analytics snapshot for historical data
export interface AnalyticsSnapshot {
  id: number
  brand: string
  platform: string
  snapshot_at: string
  followers_count: number
  views_last_7_days: number
  likes_last_7_days: number
}

// Response from /api/analytics/snapshots
export interface SnapshotsResponse {
  snapshots: AnalyticsSnapshot[]
  brands: string[]
  platforms: string[]
}

/**
 * Fetch all cached analytics data
 */
export async function fetchAnalytics(): Promise<AnalyticsResponse> {
  return get<AnalyticsResponse>('/api/analytics')
}

/**
 * Refresh analytics data for all brands
 * Rate limited to 3 refreshes per hour
 */
export async function refreshAnalytics(): Promise<RefreshResponse> {
  return post<RefreshResponse>('/api/analytics/refresh')
}

/**
 * Get current rate limit status
 */
export async function fetchRateLimitStatus(): Promise<RateLimitInfo> {
  return get<RateLimitInfo>('/api/analytics/rate-limit')
}

/**
 * Fetch historical snapshots for trend analysis
 */
export async function fetchSnapshots(params?: {
  brand?: string
  platform?: string
  days?: number
}): Promise<SnapshotsResponse> {
  const searchParams = new URLSearchParams()
  if (params?.brand) searchParams.set('brand', params.brand)
  if (params?.platform) searchParams.set('platform', params.platform)
  if (params?.days) searchParams.set('days', params.days.toString())
  
  const query = searchParams.toString()
  return get<SnapshotsResponse>(`/api/analytics/snapshots${query ? `?${query}` : ''}`)
}

// Response from /api/analytics/backfill
export interface BackfillResponse {
  success: boolean
  snapshots_created: number
  deleted_count?: number
  errors?: string[]
  note?: string
}

/**
 * Backfill historical analytics data from Instagram insights
 * Fetches up to 28 days of historical VIEWS data (not followers)
 * NOTE: Instagram API doesn't provide historical follower counts
 */
export async function backfillHistoricalData(days: number = 28): Promise<BackfillResponse> {
  return post<BackfillResponse>(`/api/analytics/backfill?days=${days}&clear_existing=true`)
}
