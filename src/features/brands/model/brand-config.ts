import type { BrandName } from '@/shared/types'

export interface BrandConfig {
  id: BrandName
  label: string
  color: string
  bgClass: string
  textClass: string
}

/**
 * Runtime brand config cache — populated dynamically by registerBrand()
 * when brands load from the API via useDynamicBrands().
 * No hardcoded brand entries — all brands come from the database.
 */
export const BRAND_CONFIG: Record<string, BrandConfig> = {}

/**
 * Dynamic brand list — use useBrands() or useDynamicBrands() for the real list.
 * Empty by default; the hooks fetch from /api/v2/brands.
 */
export const ALL_BRANDS: string[] = []

/**
 * Register a brand from DB data into the runtime config cache.
 * Called by the dynamic brands provider when brands load from API.
 */
export function registerBrand(id: string, label: string, color: string): void {
  if (!BRAND_CONFIG[id]) {
    BRAND_CONFIG[id] = {
      id,
      label,
      color,
      bgClass: `bg-[${color}]`,
      textClass: 'text-white',
    }
  }
}

export function getBrandLabel(brand: BrandName): string {
  return BRAND_CONFIG[brand]?.label || brand
}

export function getBrandColor(brand: BrandName): string {
  return BRAND_CONFIG[brand]?.color || '#666'
}
