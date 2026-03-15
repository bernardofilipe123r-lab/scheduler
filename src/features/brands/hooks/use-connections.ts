/**
 * React Query hooks for brand connections
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchBrandConnections,
  fetchBrandsList,
  disconnectYouTube,
  type BrandConnectionsResponse,
  type BrandsListResponse
} from '../api'
import { useAdaptivePoll } from '@/shared/hooks/use-adaptive-poll'
import type { BrandName } from '@/shared/types'

/**
 * Hook to fetch all brand connection statuses
 */
export function useBrandConnections(options?: { enabled?: boolean }) {
  // Connections rarely change — poll very slowly; realtime handles OAuth returns
  const pollInterval = useAdaptivePoll({
    active: 120_000,
    idle: 600_000,
    background: false,
  })

  return useQuery<BrandConnectionsResponse>({
    queryKey: ['brand-connections'],
    queryFn: fetchBrandConnections,
    refetchInterval: pollInterval,
    staleTime: 60_000,
    refetchOnWindowFocus: true, // Keep true — needed to detect returning from OAuth tab
    enabled: options?.enabled,
  })
}

/**
 * Hook to fetch list of all brands
 */
export function useBrandsList() {
  return useQuery<BrandsListResponse>({
    queryKey: ['brands-list'],
    queryFn: fetchBrandsList,
    staleTime: 60000, // Brands don't change often
  })
}

/**
 * Hook to disconnect YouTube for a brand
 */
export function useDisconnectYouTube() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (brand: BrandName) => disconnectYouTube(brand),
    onSuccess: () => {
      // Invalidate connections query to refresh data
      queryClient.invalidateQueries({ queryKey: ['brand-connections'] })
    }
  })
}
