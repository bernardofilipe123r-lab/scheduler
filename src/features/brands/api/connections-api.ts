/**
 * API types and functions for brand connections
 */
import { get, post } from '@/shared/api'
import type { BrandName } from '@/shared/types'

// Platform connection status
export interface PlatformConnection {
  connected: boolean
  account_id: string | null
  account_name: string | null
  status: 'connected' | 'not_configured' | 'not_connected' | 'error' | 'revoked'
  last_error: string | null
}

// Brand connection status
export interface BrandConnectionStatus {
  brand: BrandName
  display_name: string
  color: string
  instagram: PlatformConnection
  facebook: PlatformConnection
  youtube: PlatformConnection
}

// Response from /api/brands/connections
export interface BrandConnectionsResponse {
  brands: BrandConnectionStatus[]
  oauth_configured: {
    meta: boolean
    youtube: boolean
  }
}

// Brand info
export interface BrandInfo {
  id: BrandName
  name: string
  color: string
  logo: string
}

// Response from /api/brands/list
export interface BrandsListResponse {
  brands: BrandInfo[]
}

/**
 * Fetch all brand connection statuses
 */
export async function fetchBrandConnections(): Promise<BrandConnectionsResponse> {
  return get<BrandConnectionsResponse>('/api/brands/connections')
}

/**
 * Fetch list of all brands
 */
export async function fetchBrandsList(): Promise<BrandsListResponse> {
  return get<BrandsListResponse>('/api/brands/list')
}

/**
 * Start YouTube OAuth flow for a brand (authenticated)
 */
export async function connectYouTube(brand: BrandName): Promise<string> {
  const data = await get<{ auth_url: string }>(`/api/youtube/connect?brand=${brand}`)
  return data.auth_url
}

/**
 * Disconnect YouTube for a brand
 */
export async function disconnectYouTube(brand: BrandName): Promise<{ success: boolean; message: string }> {
  return post<{ success: boolean; message: string }>(`/api/youtube/disconnect/${brand}`)
}

// Connection test types
export interface ConnectionTestResult {
  platform: string
  status: 'success' | 'error'
  message: string
  details?: Record<string, unknown>
}

/**
 * Test Meta (Instagram + Facebook) connection for a brand
 */
export async function testMetaConnection(brandId: string): Promise<ConnectionTestResult> {
  return post<ConnectionTestResult>(`/api/v2/brands/${brandId}/test-connection/meta`)
}

/**
 * Test YouTube connection for a brand
 */
export async function testYouTubeConnection(brandId: string): Promise<ConnectionTestResult> {
  return post<ConnectionTestResult>(`/api/v2/brands/${brandId}/test-connection/youtube`)
}
