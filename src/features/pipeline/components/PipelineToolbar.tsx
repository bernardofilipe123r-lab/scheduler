import { CheckCircle2, XCircle, Search } from 'lucide-react'
import { clsx } from 'clsx'
import type { PipelineFilters } from '../model/types'
import { useDynamicBrands } from '@/features/brands/hooks/use-dynamic-brands'

const CHEVRON_SVG = `url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239ca3af%22 stroke-width=%222%22%3E%3Cpolyline points=%226 9 12 15 18 9%22/%3E%3C/svg%3E')`

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
  searchQuery: string
  onSearch: (q: string) => void
}

const STATUS_TABS: { value: PipelineFilters['status']; label: string }[] = [
  { value: 'generating', label: 'Generating' },
  { value: 'pending_review', label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
  { value: 'all', label: 'All' },
]

const CONTENT_TYPES = [
  { value: 'all' as const, label: 'All Types' },
  { value: 'reels' as const, label: 'Reels' },
  { value: 'carousels' as const, label: 'Carousels' },
  { value: 'threads' as const, label: 'Threads' },
]

const SELECT_CLASS = 'text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-600 focus:ring-2 focus:ring-[#006d8f]/20 focus:border-[#006d8f] outline-none transition-all cursor-pointer appearance-none pr-7'

export function PipelineToolbar({
  filters,
  onStatusChange,
  onBrandChange,
  onContentTypeChange,
  selectedCount,
  onBulkApprove,
  onBulkReject,
  onSelectAll,
  totalPending,
  searchQuery,
  onSearch,
}: Props) {
  const { brands } = useDynamicBrands()
  const allSelected = selectedCount === totalPending && totalPending > 0

  return (
    <div className="space-y-3">
      {/* Tabs + Filters row */}
      <div className="flex items-center justify-between gap-4">
        {/* Tab Pills */}
        <div className="flex bg-gray-100/80 rounded-xl p-1 gap-0.5">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => onStatusChange(tab.value)}
              className={clsx(
                'px-3.5 py-2 text-xs font-medium rounded-lg transition-all',
                filters.status === tab.value
                  ? 'bg-white text-[#00435c] shadow-sm'
                  : 'text-gray-400 hover:text-gray-600',
              )}
            >
              {tab.label}
              {tab.value === 'pending_review' && totalPending > 0 && (
                <span className={clsx(
                  'ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                  filters.status === 'pending_review'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-200 text-gray-500',
                )}>
                  {totalPending}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => onSearch(e.target.value)}
              placeholder="Search content..."
              className="text-xs pl-8 pr-3 py-2 w-40 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#006d8f]/20 focus:border-[#006d8f] outline-none transition-all placeholder:text-gray-300"
            />
          </div>

          {/* Brand filter */}
          <select
            value={filters.brand ?? ''}
            onChange={e => onBrandChange(e.target.value || null)}
            className={SELECT_CLASS}
            style={{ backgroundImage: CHEVRON_SVG, backgroundPosition: 'right 8px center', backgroundRepeat: 'no-repeat' }}
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
            className={SELECT_CLASS}
            style={{ backgroundImage: CHEVRON_SVG, backgroundPosition: 'right 8px center', backgroundRepeat: 'no-repeat' }}
          >
            {CONTENT_TYPES.map(ct => (
              <option key={ct.value} value={ct.value}>{ct.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk actions bar — shown on pending tab */}
      {filters.status === 'pending_review' && totalPending > 0 && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-2.5 shadow-sm">
          <label className="flex items-center gap-2.5 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-[#006d8f] focus:ring-[#006d8f] transition-colors"
            />
            <span className="text-xs font-medium text-gray-500 group-hover:text-gray-700 transition-colors">
              {allSelected ? 'All selected' : 'Select all'}
            </span>
          </label>

          <div className={clsx('flex items-center gap-1.5 transition-opacity', selectedCount === 0 && 'opacity-40 pointer-events-none')}>
            <button
              onClick={onBulkApprove}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              {selectedCount > 0 ? `Approve ${selectedCount}` : 'Approve Selected'}
            </button>
            <button
              onClick={onBulkReject}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
            >
              <XCircle className="w-3 h-3" />
              {selectedCount > 0 ? `Reject ${selectedCount}` : 'Reject Selected'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
