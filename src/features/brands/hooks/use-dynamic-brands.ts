/**
 * useDynamicBrands — single source of truth for brand lists.
 * Fetches from /api/v2/brands, falls back to static ALL_BRANDS if API hasn't loaded yet.
 * Registers new brands into the runtime BRAND_CONFIG cache for getBrandLabel/getBrandColor.
 */
import { useMemo } from 'react'
import { useBrands } from '../api/use-brands'
import { ALL_BRANDS, BRAND_CONFIG, registerBrand, getBrandLabel, getBrandColor } from '../model'

export interface DynamicBrandInfo {
  id: string
  label: string
  color: string
  shortName: string
  scheduleOffset: number
  active: boolean
  instagram_handle?: string
}

/**
 * Returns the full dynamic list of brands.
 * While the API is loading, falls back to the static ALL_BRANDS list.
 * On success, merges API data into BRAND_CONFIG for downstream consumers.
 */
export function useDynamicBrands() {
  const { data: apiBrands, isLoading, isError } = useBrands()

  const brands = useMemo<DynamicBrandInfo[]>(() => {
    if (apiBrands && apiBrands.length > 0) {
      // Register each API brand into the runtime cache
      apiBrands.forEach(b => {
        registerBrand(b.id, b.display_name, b.colors?.primary || '#666')
      })

      return apiBrands
        .filter(b => b.active)
        .map(b => ({
          id: b.id,
          label: b.display_name,
          color: b.colors?.primary || BRAND_CONFIG[b.id]?.color || '#666',
          shortName: b.short_name || b.display_name.split(' ')[0],
          scheduleOffset: b.schedule_offset,
          active: b.active,
          instagram_handle: b.instagram_handle,
        }))
    }

    // Fallback to static
    return ALL_BRANDS.map(id => ({
      id,
      label: getBrandLabel(id),
      color: getBrandColor(id),
      shortName: getBrandLabel(id).split(' ')[0],
      scheduleOffset: ALL_BRANDS.indexOf(id),
      active: true,
    }))
  }, [apiBrands])

  const brandIds = useMemo(() => brands.map(b => b.id), [brands])

  return {
    brands,
    brandIds,
    isLoading,
    isError,
  }
}
