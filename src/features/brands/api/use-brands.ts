/**
 * Brand API hooks for fetching brands from the backend.
 * 
 * This replaces hardcoded brand constants with dynamic data from the database.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

// Types
export interface BrandColors {
  primary: string
  accent: string
  color_name: string
  light_mode?: {
    background: string
    gradient_start?: string
    gradient_end?: string
    text: string
    cta_bg?: string
    cta_text?: string
  }
  dark_mode?: {
    background: string
    gradient_start?: string
    gradient_end?: string
    text: string
    cta_bg?: string
    cta_text?: string
  }
}

export interface Brand {
  id: string
  display_name: string
  short_name: string
  instagram_handle?: string
  facebook_page_name?: string
  youtube_channel_name?: string
  schedule_offset: number
  posts_per_day: number
  baseline_for_content: boolean
  colors: BrandColors
  logo_path?: string
  active: boolean
  has_instagram: boolean
  has_facebook: boolean
  created_at?: string
  updated_at?: string
}

export interface CreateBrandInput {
  id: string
  display_name: string
  short_name?: string
  instagram_handle?: string
  facebook_page_name?: string
  youtube_channel_name?: string
  schedule_offset?: number
  posts_per_day?: number
  colors?: Partial<BrandColors>
}

export interface UpdateBrandInput {
  display_name?: string
  short_name?: string
  instagram_handle?: string
  facebook_page_name?: string
  youtube_channel_name?: string
  schedule_offset?: number
  posts_per_day?: number
  baseline_for_content?: boolean
  colors?: Partial<BrandColors>
}

export interface UpdateCredentialsInput {
  instagram_access_token?: string
  instagram_business_account_id?: string
  facebook_page_id?: string
  facebook_access_token?: string
  meta_access_token?: string
}

// Query keys
export const brandKeys = {
  all: ['brands'] as const,
  list: () => [...brandKeys.all, 'list'] as const,
  ids: () => [...brandKeys.all, 'ids'] as const,
  detail: (id: string) => [...brandKeys.all, 'detail', id] as const,
  colors: (id: string) => [...brandKeys.all, 'colors', id] as const,
  connections: () => [...brandKeys.all, 'connections'] as const,
}

// API functions
async function fetchBrands(): Promise<Brand[]> {
  const response = await apiClient.get<{ brands: Brand[]; count: number }>('/api/v2/brands')
  return response.brands
}

async function fetchBrandIds(): Promise<string[]> {
  const response = await apiClient.get<{ brand_ids: string[]; count: number }>('/api/v2/brands/ids')
  return response.brand_ids
}

async function fetchBrand(id: string): Promise<Brand> {
  return apiClient.get<Brand>(`/api/v2/brands/${id}`)
}

async function fetchBrandColors(id: string): Promise<BrandColors> {
  const response = await apiClient.get<{ brand_id: string; colors: BrandColors }>(`/api/v2/brands/${id}/colors`)
  return response.colors
}

async function createBrand(input: CreateBrandInput): Promise<Brand> {
  const response = await apiClient.post<{ success: boolean; brand: Brand }>('/api/v2/brands', input)
  return response.brand
}

async function updateBrand(id: string, input: UpdateBrandInput): Promise<Brand> {
  const response = await apiClient.put<{ success: boolean; brand: Brand }>(`/api/v2/brands/${id}`, input)
  return response.brand
}

async function updateBrandCredentials(id: string, input: UpdateCredentialsInput): Promise<void> {
  await apiClient.put(`/api/v2/brands/${id}/credentials`, input)
}

async function deleteBrand(id: string): Promise<void> {
  await apiClient.delete(`/api/v2/brands/${id}`)
}

async function reactivateBrand(id: string): Promise<Brand> {
  const response = await apiClient.post<{ success: boolean; brand: Brand }>(`/api/v2/brands/${id}/reactivate`, {})
  return response.brand
}

// Hooks

/**
 * Fetch all active brands
 */
export function useBrands() {
  return useQuery({
    queryKey: brandKeys.list(),
    queryFn: fetchBrands,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Fetch just the brand IDs (for validation/quick lookups)
 */
export function useBrandIds() {
  return useQuery({
    queryKey: brandKeys.ids(),
    queryFn: fetchBrandIds,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Fetch a single brand by ID
 */
export function useBrand(id: string) {
  return useQuery({
    queryKey: brandKeys.detail(id),
    queryFn: () => fetchBrand(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Fetch just the colors for a brand
 */
export function useBrandColors(id: string) {
  return useQuery({
    queryKey: brandKeys.colors(id),
    queryFn: () => fetchBrandColors(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Create a new brand
 */
export function useCreateBrand() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: createBrand,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandKeys.all })
    },
  })
}

/**
 * Update an existing brand
 */
export function useUpdateBrand() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateBrandInput & { id: string }) => updateBrand(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: brandKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: brandKeys.list() })
    },
  })
}

/**
 * Update brand API credentials
 */
export function useUpdateBrandCredentials() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCredentialsInput & { id: string }) => updateBrandCredentials(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: brandKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: brandKeys.connections() })
    },
  })
}

/**
 * Delete (deactivate) a brand
 */
export function useDeleteBrand() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: deleteBrand,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandKeys.all })
    },
  })
}

/**
 * Reactivate a previously deleted brand
 */
export function useReactivateBrand() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: reactivateBrand,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brandKeys.all })
    },
  })
}

// Helper functions for backward compatibility

/**
 * Get brand label from a Brand object
 */
export function getBrandObjectLabel(brand: Brand): string {
  return brand.display_name || brand.id
}

/**
 * Get primary color from a Brand object
 */
export function getBrandObjectColor(brand: Brand): string {
  return brand.colors?.primary || '#666666'
}

/**
 * Get short name (abbreviation) from a Brand object
 */
export function getBrandObjectShortName(brand: Brand): string {
  return brand.short_name || brand.id.substring(0, 3).toUpperCase()
}
