/**
 * TanStack Query hooks for Analytics V2 endpoints.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  fetchOverview,
  fetchPosts,
  fetchAnswers,
  fetchAudience,
  refreshAudience,
  fetchCumulative,
  fetchSocialHealth,
} from '../api/analytics-v2-api'
import { useAdaptivePoll } from '@/shared/hooks/use-adaptive-poll'

export function useOverview(params: { brand?: string; platform?: string; days?: number }) {
  return useQuery({
    queryKey: ['analytics-v2-overview', params],
    queryFn: () => fetchOverview(params),
    staleTime: 60_000,
  })
}

export function usePosts(params: {
  brand?: string
  content_type?: string
  sort_by?: string
  sort_dir?: string
  days?: number
  limit?: number
  offset?: number
}) {
  return useQuery({
    queryKey: ['analytics-v2-posts', params],
    queryFn: () => fetchPosts(params),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
}

export function useAnswers(params: { brand?: string; days?: number }) {
  return useQuery({
    queryKey: ['analytics-v2-answers', params],
    queryFn: () => fetchAnswers(params),
    staleTime: 5 * 60_000,
  })
}

export function useAudience(params?: { brand?: string }) {
  return useQuery({
    queryKey: ['analytics-v2-audience', params],
    queryFn: () => fetchAudience(params),
    staleTime: 5 * 60_000,
  })
}

export function useRefreshAudience() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (brand?: string) => refreshAudience(brand),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analytics-v2-audience'] })
    },
  })
}

export function useCumulative(params?: { brand?: string; platform?: string; months?: number }) {
  return useQuery({
    queryKey: ['analytics-v2-cumulative', params],
    queryFn: () => fetchCumulative(params),
    staleTime: 5 * 60_000,
  })
}

export function useSocialHealth() {
  const pollInterval = useAdaptivePoll({
    active: 300_000,     // 5 min — social health doesn't change fast
    idle: 600_000,       // 10 min
    background: false,
  })

  return useQuery({
    queryKey: ['social-health'],
    queryFn: fetchSocialHealth,
    staleTime: 5 * 60_000,
    refetchInterval: pollInterval,
  })
}
