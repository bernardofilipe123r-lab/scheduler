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
import type { BrandName } from '@/shared/types'

/**
 * Hook to fetch all brand connection statuses
 */
export function useBrandConnections(options?: { enabled?: boolean }) {
  return useQuery<BrandConnectionsResponse>({
    queryKey: ['brand-connections'],
    queryFn: fetchBrandConnections,
    refetchInterval: 300_000,
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
