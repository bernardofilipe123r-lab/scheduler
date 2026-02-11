import { clsx } from 'clsx'
import type { BrandName } from '@/shared/types'
import { BRAND_CONFIG, getBrandLabel, getBrandColor } from '../model'

interface BrandBadgeProps {
  brand: BrandName
  size?: 'sm' | 'md'
}

export function BrandBadge({ brand, size = 'sm' }: BrandBadgeProps) {
  const config = BRAND_CONFIG[brand]
  const label = config?.label || getBrandLabel(brand)
  const color = config?.color || getBrandColor(brand)
  
  return (
    <span
      className={clsx(
        'badge text-white inline-flex items-center rounded-full font-medium',
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'
      )}
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  )
}
