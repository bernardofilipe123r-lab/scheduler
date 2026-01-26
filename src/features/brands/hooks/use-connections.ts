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
export function useBrandConnections() {
  return useQuery<BrandConnectionsResponse>({
    queryKey: ['brand-connections'],
    queryFn: fetchBrandConnections,
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
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
