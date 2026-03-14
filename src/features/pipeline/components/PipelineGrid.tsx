import { PipelineCard } from './PipelineCard'
import type { PipelineItem } from '../model/types'

interface Props {
  items: PipelineItem[]
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onEdit: (item: PipelineItem) => void
  onDelete?: (id: string) => void
  onOpenReview: (item: PipelineItem) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  autoSchedule?: boolean
}

export function PipelineGrid({ items, onApprove, onReject, onEdit, onDelete, onOpenReview, selectedIds, onToggleSelect, autoSchedule = true }: Props) {
  if (items.length === 0) return null

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">
      {items.map(item => (
        <PipelineCard
          key={item.job_id}
          item={item}
          onApprove={onApprove}
          onReject={onReject}
          onEdit={onEdit}
          onDelete={onDelete}
          onOpenReview={onOpenReview}
          selected={selectedIds.has(item.job_id)}
          onToggleSelect={onToggleSelect}
          autoSchedule={autoSchedule}
        />
      ))}
    </div>
  )
}
