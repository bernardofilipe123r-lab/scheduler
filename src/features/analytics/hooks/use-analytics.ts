/**
 * React Query hooks for brand analytics
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  fetchAnalytics, 
  refreshAnalytics,
  fetchRateLimitStatus,
  fetchSnapshots,
  backfillHistoricalData,
  type AnalyticsResponse,
  type RefreshResponse,
  type RateLimitInfo,
  type SnapshotsResponse,
  type BackfillResponse
} from '../api'

/**
 * Hook to fetch cached analytics data
 */
export function useAnalytics() {
  return useQuery<AnalyticsResponse>({
    queryKey: ['analytics'],
    queryFn: fetchAnalytics,
    staleTime: 60000, // Consider data stale after 1 minute test
    refetchOnWindowFocus: false, // Don't auto-refetch - user controls refresh
  })
}

/**
 * Hook to check rate limit status
 */
export function useRateLimitStatus() {
  return useQuery<RateLimitInfo>({
    queryKey: ['analytics-rate-limit'],
    queryFn: fetchRateLimitStatus,
    staleTime: 30000, // Check every 30 seconds
  })
}

/**
 * Hook to fetch historical snapshots
 */
export function useSnapshots(params?: {
  brand?: string
  platform?: string
  days?: number
}) {
  return useQuery<SnapshotsResponse>({
    queryKey: ['analytics-snapshots', params],
    queryFn: () => fetchSnapshots(params),
    staleTime: 60000,
    refetchOnWindowFocus: false,
  })
}

/**
 * Hook to refresh analytics data
 * Rate limited to 3 refreshes per hour
 */
export function useRefreshAnalytics() {
  const queryClient = useQueryClient()
  
  return useMutation<RefreshResponse, Error>({
    mutationFn: refreshAnalytics,
    onSuccess: (data) => {
      // Update the analytics cache with new data
      if (data.analytics) {
        queryClient.setQueryData(['analytics'], {
          brands: data.analytics,
          rate_limit: data.rate_limit,
          last_refresh: new Date().toISOString()
        })
      }
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['analytics-rate-limit'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-snapshots'] })
    },
    onError: () => {
      // Invalidate rate limit query on error too
      queryClient.invalidateQueries({ queryKey: ['analytics-rate-limit'] })
    }
  })
}

/**
 * Hook to backfill historical analytics data
 * Fetches up to 28 days of Instagram insights history
 */
export function useBackfillHistoricalData() {
  const queryClient = useQueryClient()
  
  return useMutation<BackfillResponse, Error, number>({
    mutationFn: (days: number) => backfillHistoricalData(days),
    onSuccess: () => {
      // Invalidate snapshots to show new historical data
      queryClient.invalidateQueries({ queryKey: ['analytics-snapshots'] })
    }
  })
}
