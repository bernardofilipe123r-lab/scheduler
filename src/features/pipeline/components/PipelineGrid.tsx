import { useState, useEffect, useMemo } from 'react'
import { PipelineCard } from './PipelineCard'
import type { PipelineItem } from '../model/types'

const INITIAL_VISIBLE = 12

interface Props {
  items: PipelineItem[]
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onEdit: (item: PipelineItem) => void
  onOpenReview: (item: PipelineItem) => void
  onRegenerate: (id: string) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}

export function PipelineGrid({ items, onApprove, onReject, onEdit, onOpenReview, onRegenerate, selectedIds, onToggleSelect }: Props) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)

  // Reset visible count when items change (e.g. filter change)
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE)
  }, [items.length])

  // Expand visible count when items are removed (approve/reject) to keep grid full
  useEffect(() => {
    if (visibleCount > items.length && items.length > 0) {
      setVisibleCount(items.length)
    }
  }, [items.length, visibleCount])

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount])
  const hasMore = visibleCount < items.length

  if (items.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {visibleItems.map(item => (
          <PipelineCard
            key={item.job_id}
            item={item}
            onApprove={onApprove}
            onReject={onReject}
            onEdit={onEdit}
            onOpenReview={onOpenReview}
            onRegenerate={onRegenerate}
            selected={selectedIds.has(item.job_id)}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisibleCount(prev => prev + INITIAL_VISIBLE)}
            className="px-5 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Show more ({items.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
