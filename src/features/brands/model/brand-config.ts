import type { BrandName } from '@/shared/types'

export interface BrandConfig {
  id: BrandName
  label: string
  color: string
  bgClass: string
  textClass: string
}

/**
 * Static fallback brand configs — used when DB brands haven't loaded yet.
 * New brands added via the UI will be fetched dynamically from /api/v2/brands.
 */
export const BRAND_CONFIG: Record<string, BrandConfig> = {
  healthycollege: {
    id: 'healthycollege',
    label: 'Healthy College',
    color: '#2e7d32',
    bgClass: 'bg-[#2e7d32]',
    textClass: 'text-white',
  },
  vitalitycollege: {
    id: 'vitalitycollege',
    label: 'Vitality College',
    color: '#c2185b',
    bgClass: 'bg-[#c2185b]',
    textClass: 'text-white',
  },
  longevitycollege: {
    id: 'longevitycollege',
    label: 'Longevity College',
    color: '#6a1b9a',
    bgClass: 'bg-[#6a1b9a]',
    textClass: 'text-white',
  },
  holisticcollege: {
    id: 'holisticcollege',
    label: 'Holistic College',
    color: '#f0836e',
    bgClass: 'bg-[#f0836e]',
    textClass: 'text-white',
  },
  wellbeingcollege: {
    id: 'wellbeingcollege',
    label: 'Wellbeing College',
    color: '#ebbe4d',
    bgClass: 'bg-[#ebbe4d]',
    textClass: 'text-white',
  },
}

/**
 * Static fallback list — use useBrands() or useDynamicBrands() for dynamic data.
 */
export const ALL_BRANDS: string[] = ['healthycollege', 'vitalitycollege', 'longevitycollege', 'holisticcollege', 'wellbeingcollege']

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
  return BRAND_CONFIG[brand]?.label || brand.replace(/college$/i, ' College').replace(/^\w/, c => c.toUpperCase())
}

export function getBrandColor(brand: BrandName): string {
  return BRAND_CONFIG[brand]?.color || '#666'
}
