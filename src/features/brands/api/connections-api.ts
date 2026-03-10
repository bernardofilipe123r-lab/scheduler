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
  token_expires_at: string | null        // ISO datetime, only for Instagram
  token_last_refreshed_at: string | null // ISO datetime, only for Instagram
}

// TikTok has separate expiry fields for access/refresh tokens
export interface TikTokConnection extends PlatformConnection {
  access_token_expires_at: string | null
  refresh_token_expires_at: string | null
}

// Brand connection status
export interface BrandConnectionStatus {
  brand: BrandName
  display_name: string
  color: string
  profile_image_url?: string
  instagram: PlatformConnection
  facebook: PlatformConnection
  youtube: PlatformConnection
  threads: PlatformConnection
  tiktok: TikTokConnection
  bluesky: PlatformConnection
}

// Response from /api/brands/connections
export interface BrandConnectionsResponse {
  brands: BrandConnectionStatus[]
  oauth_configured: {
    meta: boolean
    facebook: boolean
    youtube: boolean
    threads: boolean
    tiktok: boolean
    bluesky: boolean
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
export async function connectYouTube(brand: BrandName, returnTo?: string): Promise<string> {
  const params = new URLSearchParams({ brand })
  if (returnTo) params.set('return_to', returnTo)
  const data = await get<{ auth_url: string }>(`/api/youtube/connect?${params}`)
  return data.auth_url
}

/**
 * Disconnect YouTube for a brand
 */
export async function disconnectYouTube(brand: BrandName): Promise<{ success: boolean; message: string }> {
  return post<{ success: boolean; message: string }>(`/api/youtube/disconnect/${brand}`)
}

/**
 * Start Instagram OAuth flow for a brand (authenticated).
 * Returns the Instagram authorization URL to redirect to.
 */
export async function connectInstagram(brandId: string, returnTo?: string): Promise<string> {
  const params = new URLSearchParams({ brand_id: brandId })
  if (returnTo) params.set('return_to', returnTo)
  const data = await get<{ auth_url: string }>(`/api/auth/instagram/connect?${params}`)
  return data.auth_url
}

/**
 * Disconnect Instagram for a brand
 */
export async function disconnectInstagram(brandId: string): Promise<{ status: string }> {
  return post<{ status: string }>('/api/auth/instagram/disconnect', { brand_id: brandId })
}

/**
 * Start Facebook OAuth flow for a brand (authenticated).
 * Returns the Facebook authorization URL to redirect to.
 */
export async function connectFacebook(brandId: string, returnTo?: string): Promise<string> {
  const params = new URLSearchParams({ brand_id: brandId })
  if (returnTo) params.set('return_to', returnTo)
  const data = await get<{ auth_url: string }>(`/api/auth/facebook/connect?${params}`)
  return data.auth_url
}

/**
 * Disconnect Facebook for a brand
 */
export async function disconnectFacebook(brandId: string): Promise<{ status: string }> {
  return post<{ status: string }>('/api/auth/facebook/disconnect', { brand_id: brandId })
}

/**
 * Start Threads OAuth flow for a brand (authenticated).
 * Returns the Threads authorization URL to redirect to.
 */
export async function connectThreads(brandId: string, returnTo?: string): Promise<string> {
  const params = new URLSearchParams({ brand_id: brandId })
  if (returnTo) params.set('return_to', returnTo)
  const data = await get<{ auth_url: string }>(`/api/auth/threads/connect?${params}`)
  return data.auth_url
}

/**
 * Disconnect Threads for a brand
 */
export async function disconnectThreads(brandId: string): Promise<{ status: string }> {
  return post<{ status: string }>('/api/auth/threads/disconnect', { brand_id: brandId })
}

/**
 * Refresh Threads long-lived token
 */
export async function refreshThreadsToken(brandId: string): Promise<{ status: string }> {
  return post<{ status: string }>('/api/auth/threads/refresh', { brand_id: brandId })
}

/**
 * Start TikTok OAuth flow for a brand (authenticated).
 * Returns the TikTok authorization URL to redirect to.
 */
export async function connectTikTok(brandId: string, returnTo?: string): Promise<string> {
  const params = new URLSearchParams({ brand_id: brandId })
  if (returnTo) params.set('return_to', returnTo)
  const data = await get<{ auth_url: string }>(`/api/auth/tiktok/connect?${params}`)
  return data.auth_url
}

/**
 * Disconnect TikTok for a brand
 */
export async function disconnectTikTok(brandId: string): Promise<{ status: string }> {
  return post<{ status: string }>('/api/auth/tiktok/disconnect', { brand_id: brandId })
}

/**
 * Connect Bluesky for a brand (App Password based — no OAuth redirect).
 */
export async function connectBluesky(brandId: string, handle: string, appPassword: string): Promise<{ status: string; handle: string; did: string }> {
  return post<{ status: string; handle: string; did: string }>('/api/auth/bluesky/connect', {
    brand_id: brandId,
    handle,
    app_password: appPassword,
  })
}

/**
 * Disconnect Bluesky for a brand
 */
export async function disconnectBluesky(brandId: string): Promise<{ status: string }> {
  return post<{ status: string }>('/api/auth/bluesky/disconnect', { brand_id: brandId })
}

/**
 * Fetch the list of Facebook Pages available after OAuth, before page selection.
 */
export interface FacebookPage {
  id: string
  name: string
  category: string
  fan_count: number | null
  picture: string | null
}

export interface FacebookPageBrand {
  id: string
  display_name: string
  facebook_page_id: string | null
  facebook_page_name: string | null
}

export interface FacebookPagesResponse {
  pages: FacebookPage[]
  brands: FacebookPageBrand[]
}

export async function fetchFacebookPages(brandId: string): Promise<FacebookPagesResponse> {
  return get<FacebookPagesResponse>(`/api/auth/facebook/pages?brand_id=${encodeURIComponent(brandId)}`)
}

/**
 * Select a Facebook Page to connect to a brand (after multi-page OAuth flow).
 */
export async function selectFacebookPage(brandId: string, pageId: string): Promise<{ status: string; page_name: string }> {
  return post<{ status: string; page_name: string }>('/api/auth/facebook/select-page', { brand_id: brandId, page_id: pageId })
}

/**
 * Bulk connect multiple Facebook Pages to multiple brands at once.
 */
export interface PageBrandMapping {
  brand_id: string
  page_id: string
}

export async function bulkConnectFacebook(
  sourceBrandId: string,
  mappings: PageBrandMapping[],
): Promise<{ status: string; connected: Array<{ brand_id: string; page_id: string; page_name: string }>; count: number }> {
  return post('/api/auth/facebook/bulk-connect', {
    source_brand_id: sourceBrandId,
    mappings,
  })
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
