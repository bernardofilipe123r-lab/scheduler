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
  max_per_hour: number
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
