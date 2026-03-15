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
  fetchRefreshStatus,
  type AnalyticsResponse,
  type RefreshResponse,
  type RateLimitInfo,
  type SnapshotsResponse,
  type BackfillResponse,
  type RefreshStatusResponse
} from '../api'
import { useAdaptivePoll } from '@/shared/hooks/use-adaptive-poll'

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
 * Hook to poll refresh status from the server.
 * When a refresh is in progress, polls every 3 seconds.
 * When idle, polls every 30 seconds to catch server-side auto-refreshes.
 */
export function useRefreshStatus() {
  const pollInterval = useAdaptivePoll({
    active: 10_000,      // something generating — check regularly
    idle: 300_000,       // nothing happening — 5 min
    background: false,   // tab hidden — don't poll
  })

  return useQuery<RefreshStatusResponse>({
    queryKey: ['analytics-refresh-status'],
    queryFn: fetchRefreshStatus,
    refetchInterval: pollInterval,
    staleTime: 5000,
    refetchOnWindowFocus: false,
  })
}

/**
 * Hook to refresh analytics data.
 * Now triggers a background refresh on the server and relies on
 * useRefreshStatus for tracking completion.
 */
export function useRefreshAnalytics() {
  const queryClient = useQueryClient()
  
  return useMutation<RefreshResponse, Error>({
    mutationFn: refreshAnalytics,
    onSuccess: () => {
      // Immediately poll refresh status
      queryClient.invalidateQueries({ queryKey: ['analytics-refresh-status'] })
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-refresh-status'] })
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
