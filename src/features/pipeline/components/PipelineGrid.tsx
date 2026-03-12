import { PipelineCard } from './PipelineCard'
import type { PipelineItem } from '../model/types'

interface Props {
  items: PipelineItem[]
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onNavigate: (item: PipelineItem) => void
  onDelete: (id: string) => void
  onRegenerate: (id: string) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}

export function PipelineGrid({ items, onApprove, onReject, onNavigate, onDelete, onRegenerate, selectedIds, onToggleSelect }: Props) {
  if (items.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map(item => (
        <PipelineCard
          key={item.job_id}
          item={item}
          onApprove={onApprove}
          onReject={onReject}
          onNavigate={onNavigate}
          onDelete={onDelete}
          onRegenerate={onRegenerate}
          selected={selectedIds.has(item.job_id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  )
}
