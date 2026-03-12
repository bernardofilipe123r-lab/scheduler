import { CheckCircle2, XCircle, Filter, RotateCcw } from 'lucide-react'
import { clsx } from 'clsx'
import type { PipelineFilters } from '../model/types'
import { useDynamicBrands } from '@/features/brands/hooks/use-dynamic-brands'

interface Props {
  filters: PipelineFilters
  onStatusChange: (status: PipelineFilters['status']) => void
  onBrandChange: (brand: string | null) => void
  onContentTypeChange: (ct: PipelineFilters['content_type']) => void
  onReset: () => void
  selectedCount: number
  onBulkApprove: () => void
  onBulkReject: () => void
  onSelectAll: () => void
  totalPending: number
}

const STATUS_TABS = [
  { value: 'pending_review' as const, label: 'Pending Review' },
  { value: 'generating' as const, label: 'Generating' },
  { value: 'scheduled' as const, label: 'Scheduled' },
  { value: 'published' as const, label: 'Published' },
  { value: 'rejected' as const, label: 'Rejected' },
  { value: 'failed' as const, label: 'Failed' },
  { value: 'all' as const, label: 'All' },
]

const CONTENT_TYPES = [
  { value: 'all' as const, label: 'All Types' },
  { value: 'reels' as const, label: 'Reels' },
  { value: 'carousels' as const, label: 'Carousels' },
  { value: 'threads' as const, label: 'Threads' },
]

export function PipelineToolbar({
  filters,
  onStatusChange,
  onBrandChange,
  onContentTypeChange,
  onReset,
  selectedCount,
  onBulkApprove,
  onBulkReject,
  onSelectAll,
  totalPending,
}: Props) {
  const { brands } = useDynamicBrands()

  return (
    <div className="space-y-3">
      {/* Status tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => onStatusChange(tab.value)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                filters.status === tab.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Filter className="w-3.5 h-3.5 text-gray-400" />

          {/* Brand filter */}
          <select
            value={filters.brand ?? ''}
            onChange={e => onBrandChange(e.target.value || null)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
          >
            <option value="">All Brands</option>
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>

          {/* Content type filter */}
          <select
            value={filters.content_type}
            onChange={e => onContentTypeChange(e.target.value as PipelineFilters['content_type'])}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
          >
            {CONTENT_TYPES.map(ct => (
              <option key={ct.value} value={ct.value}>{ct.label}</option>
            ))}
          </select>

          {(filters.brand || filters.content_type !== 'all') && (
            <button
              onClick={onReset}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              title="Reset filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Bulk actions bar */}
      {filters.status === 'pending_review' && totalPending > 0 && (
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedCount === totalPending && totalPending > 0}
              onChange={onSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs font-medium text-gray-700">
              {selectedCount === totalPending && totalPending > 0 ? 'All selected' : 'Select all'}
            </span>
          </label>

          {selectedCount > 0 && (
            <>
              <div className="w-px h-4 bg-gray-200" />
              <span className="text-xs text-gray-500 tabular-nums">
                {selectedCount} of {totalPending}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={onBulkApprove}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors shadow-sm"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Accept {selectedCount}
                </button>
                <button
                  onClick={onBulkReject}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors shadow-sm"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Decline {selectedCount}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
