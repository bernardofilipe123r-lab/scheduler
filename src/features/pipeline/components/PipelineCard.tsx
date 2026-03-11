import { CheckCircle2, X, Eye, Star } from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { ContentPreview } from './ContentPreview'
import type { PipelineItem } from '../model/types'

interface Props {
  item: PipelineItem
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onOpen: (item: PipelineItem) => void
  selected: boolean
  onToggleSelect: (id: string) => void
}

const STATUS_STYLES = {
  pending: 'border-amber-200 bg-white',
  approved: 'border-emerald-200 bg-emerald-50/30',
  rejected: 'border-red-200 bg-red-50/30 opacity-60',
}

function variantLabel(item: PipelineItem): string {
  if (item.variant === 'threads') return 'Thread'
  if (item.content_format === 'carousel') return 'Carousel'
  if (item.variant === 'format_b') return 'Reel B'
  if (item.variant === 'dark') return 'Reel A'
  if (item.variant === 'post') return 'Post'
  return item.variant
}

export function PipelineCard({ item, onApprove, onReject, onOpen, selected, onToggleSelect }: Props) {
  const isPending = item.pipeline_status === 'pending'

  return (
    <div
      className={clsx(
        'relative rounded-xl border transition-all hover:shadow-md group',
        STATUS_STYLES[item.pipeline_status],
        selected && 'ring-2 ring-blue-400',
      )}
    >
      {/* Select checkbox */}
      {isPending && (
        <label className="absolute top-2 left-2 z-10 cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(item.job_id)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </label>
      )}

      {/* Preview */}
      <div className="p-2 cursor-pointer" onClick={() => onOpen(item)}>
        <ContentPreview item={item} />
      </div>

      {/* Meta */}
      <div className="px-3 pb-2 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {variantLabel(item)}
          </span>
          {item.quality_score != null && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
              <Star className="w-3 h-3" />
              {item.quality_score}
            </span>
          )}
        </div>

        <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-snug">
          {item.title}
        </p>

        {item.brands.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.brands.map(b => (
              <span key={b} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">
                {b}
              </span>
            ))}
          </div>
        )}

        <p className="text-[10px] text-gray-400">
          {format(new Date(item.created_at), 'MMM d, h:mm a')}
        </p>
      </div>

      {/* Actions */}
      {isPending && (
        <div className="flex border-t border-gray-100">
          <button
            onClick={() => onApprove(item.job_id)}
            className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition-colors rounded-bl-xl"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approve
          </button>
          <div className="w-px bg-gray-100" />
          <button
            onClick={() => onOpen(item)}
            className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Review
          </button>
          <div className="w-px bg-gray-100" />
          <button
            onClick={() => onReject(item.job_id)}
            className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors rounded-br-xl"
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
        </div>
      )}
    </div>
  )
}
