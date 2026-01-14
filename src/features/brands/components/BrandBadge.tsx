import { clsx } from 'clsx'
import type { BrandName } from '@/shared/types'
import { BRAND_CONFIG } from '../model'

interface BrandBadgeProps {
  brand: BrandName
  size?: 'sm' | 'md'
}

export function BrandBadge({ brand, size = 'sm' }: BrandBadgeProps) {
  const config = BRAND_CONFIG[brand]
  
  if (!config) {
    return <span className="badge bg-gray-100 text-gray-700">{brand}</span>
  }
  
  return (
    <span
      className={clsx(
        'badge',
        config.bgClass,
        config.textClass,
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'
      )}
    >
      {config.label}
    </span>
  )
}
