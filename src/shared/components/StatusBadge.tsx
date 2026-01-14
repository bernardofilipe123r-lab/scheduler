import { clsx } from 'clsx'
import type { JobStatus, BrandStatus } from '@/shared/types'

interface StatusBadgeProps {
  status: JobStatus | BrandStatus
  size?: 'sm' | 'md'
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  pending: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    label: 'Pending',
  },
  generating: {
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    label: 'Generating',
  },
  completed: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    label: 'Completed',
  },
  failed: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    label: 'Failed',
  },
  cancelled: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    label: 'Cancelled',
  },
  scheduled: {
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    label: 'Scheduled',
  },
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending
  
  return (
    <span
      className={clsx(
        'badge',
        config.bg,
        config.text,
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'
      )}
    >
      {status === 'generating' && (
        <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse mr-1.5" />
      )}
      {config.label}
    </span>
  )
}
