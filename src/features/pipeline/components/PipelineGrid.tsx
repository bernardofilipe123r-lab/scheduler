import { PipelineCard } from './PipelineCard'
import type { PipelineItem } from '../model/types'

interface Props {
  items: PipelineItem[]
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onOpen: (item: PipelineItem) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}

export function PipelineGrid({ items, onApprove, onReject, onOpen, selectedIds, onToggleSelect }: Props) {
  if (items.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {items.map(item => (
        <PipelineCard
          key={item.job_id}
          item={item}
          onApprove={onApprove}
          onReject={onReject}
          onOpen={onOpen}
          selected={selectedIds.has(item.job_id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  )
}
