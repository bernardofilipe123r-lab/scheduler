import type { BrandName } from '@/shared/types'

export interface BrandConfig {
  id: BrandName
  label: string
  color: string
  bgClass: string
  textClass: string
}

export const BRAND_CONFIG: Record<BrandName, BrandConfig> = {
  gymcollege: {
    id: 'gymcollege',
    label: 'Gym College',
    color: '#00435c',
    bgClass: 'bg-[#00435c]',
    textClass: 'text-white',
  },
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
}

export const ALL_BRANDS: BrandName[] = ['gymcollege', 'healthycollege', 'vitalitycollege', 'longevitycollege']

export function getBrandLabel(brand: BrandName): string {
  return BRAND_CONFIG[brand]?.label || brand
}

export function getBrandColor(brand: BrandName): string {
  return BRAND_CONFIG[brand]?.color || '#666'
}
