import { CheckCircle2, X, Pencil, Star, Loader2, Trash2, Download, Eye } from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { ContentPreview } from './ContentPreview'
import type { PipelineItem, LifecycleStage } from '../model/types'
import { getFirstBrandOutput } from '../model/types'

interface Props {
  item: PipelineItem
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onEdit: (item: PipelineItem) => void
  onDelete?: (id: string) => void
  onOpenReview: (item: PipelineItem) => void
  selected: boolean
  onToggleSelect: (id: string) => void
  autoSchedule?: boolean
}

const LIFECYCLE_BADGES: Record<LifecycleStage, { label: string; className: string }> = {
  pending_review: { label: 'Pending', className: 'bg-amber-400/90 text-white' },
  generating: { label: 'Generating', className: 'bg-blue-500/90 text-white' },
  scheduled: { label: 'Scheduled', className: 'bg-indigo-500/90 text-white' },
  published: { label: 'Published', className: 'bg-emerald-500/90 text-white' },
  rejected: { label: 'Rejected', className: 'bg-red-400/90 text-white' },
  failed: { label: 'Failed', className: 'bg-red-500/90 text-white' },
}

const VARIANT_DOTS: Record<string, string> = {
  threads: 'bg-purple-400',
  carousel: 'bg-pink-400',
  format_b: 'bg-red-400',
  dark: 'bg-red-400',
  light: 'bg-orange-400',
  post: 'bg-indigo-400',
}

function variantLabel(item: PipelineItem): string {
  if (item.variant === 'threads') return 'Thread'
  if (item.content_format === 'carousel') return 'Carousel'
  if (item.variant === 'format_b') return 'Reel B'
  if (item.variant === 'dark') return 'Reel A'
  if (item.variant === 'post') return 'Post'
  return item.variant
}

function variantDotColor(item: PipelineItem): string {
  if (item.variant === 'threads') return VARIANT_DOTS.threads
  if (item.content_format === 'carousel') return VARIANT_DOTS.carousel
  return VARIANT_DOTS[item.variant] ?? 'bg-gray-400'
}

function scoreColor(score: number): string {
  if (score >= 90) return 'bg-emerald-50 text-emerald-600'
  if (score >= 75) return 'bg-amber-50 text-amber-600'
  return 'bg-red-50 text-red-500'
}

function scoreStarColor(score: number): string {
  if (score >= 90) return 'text-emerald-400'
  if (score >= 75) return 'text-amber-400'
  return 'text-red-400'
}

export function PipelineCard({ item, onApprove, onReject, onEdit, onDelete, onOpenReview, selected, onToggleSelect, autoSchedule = true }: Props) {
  const lifecycle = item.lifecycle
  const isPending = lifecycle === 'pending_review'
  const isGenerating = lifecycle === 'generating'
  const badge = LIFECYCLE_BADGES[lifecycle]

  const handleDownload = () => {
    const output = getFirstBrandOutput(item)
    const url = output?.video_path ?? output?.carousel_paths?.[0] ?? output?.thumbnail_path
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `${item.title || item.job_id}.${url.includes('.mp4') ? 'mp4' : 'jpg'}`
    a.click()
  }

  return (
    <div
      className={clsx(
        'relative bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        selected && 'ring-2 ring-[#006d8f]/40',
      )}
    >
      {/* Preview area */}
      <div className="relative">
        {/* Checkbox (pending only) */}
        {isPending && (
          <label className="absolute top-3 left-3 z-10 cursor-pointer">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(item.job_id)}
              className="w-4 h-4 rounded-md border-gray-300/80 text-[#006d8f] focus:ring-[#006d8f] bg-white/80 backdrop-blur-sm shadow-sm"
            />
          </label>
        )}

        {/* Status badge */}
        <span className={clsx(
          'absolute top-3 right-3 z-10 text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm shadow-sm',
          badge.className,
        )}>
          {badge.label}
        </span>

        {/* Content preview */}
        <div
          className={clsx('aspect-[4/5] overflow-hidden', !isGenerating && 'cursor-pointer')}
          onClick={() => !isGenerating && onOpenReview(item)}
        >
          {isGenerating ? (
            <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin mb-2" />
              <span className="text-xs text-gray-400">Generating…</span>
            </div>
          ) : (
            <ContentPreview item={item} />
          )}
        </div>
      </div>

      {/* Card body */}
      <div className={clsx('p-3.5 space-y-2.5', !isGenerating && 'cursor-pointer')} onClick={() => !isGenerating && onOpenReview(item)}>
        {/* Type dot + label + quality score + count */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={clsx('w-1.5 h-1.5 rounded-full', variantDotColor(item))} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {variantLabel(item)}
            </span>
            {item.variant === 'format_b' && (item.image_source_mode || item.thumbnail_image_source_mode) && (
              <span className="text-[9px] font-medium text-gray-300 bg-gray-50 border border-gray-100 px-1 py-0.5 rounded">
                {item.image_source_mode === 'web' ? 'Pexels' : 'AI'}
                {' / '}
                {item.thumbnail_image_source_mode === 'web' ? 'Th:Pexels' : 'Th:AI'}
              </span>
            )}
          </div>
          {item.quality_score != null && (
            <div className={clsx('flex items-center gap-1 px-1.5 py-0.5 rounded-md', scoreColor(item.quality_score))}>
              <Star className={clsx('w-2.5 h-2.5 fill-current', scoreStarColor(item.quality_score))} />
              <span className="text-[10px] font-bold">{item.quality_score}</span>
            </div>
          )}
        </div>

        {/* Brand + time + source */}
        <div className="flex flex-col gap-0.5 pt-0.5">
          {item.brands.length > 0 && (
            <span className="text-[10px] font-medium bg-gray-50 text-gray-500 px-2 py-0.5 rounded-md border border-gray-100 self-start">
              {item.brands[0]}
            </span>
          )}
          <span className="text-[10px] text-gray-300">
            {format(new Date(item.created_at), 'MMM d, h:mm a')}
          </span>
          <span className={clsx(
            'text-[9px] font-semibold uppercase tracking-wide mt-0.5',
            item.created_by === 'toby' ? 'text-[#006d8f]' : 'text-gray-400',
          )}>
            {item.created_by === 'toby' ? '✦ Toby' : 'Manual'}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex border-t border-gray-50">
        {isPending && (
          <>
            <button
              onClick={() => autoSchedule ? onApprove(item.job_id) : handleDownload()}
              title={autoSchedule ? 'Accept' : 'Download'}
              className="flex-1 flex items-center justify-center py-2.5 text-emerald-500 hover:bg-emerald-50 transition-all rounded-bl-2xl"
            >
              {autoSchedule ? <CheckCircle2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            </button>
            <div className="w-px bg-gray-50" />
            <button
              onClick={() => onReject(item.job_id)}
              title="Decline"
              className="flex-1 flex items-center justify-center py-2.5 text-red-400 hover:bg-red-50 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-px bg-gray-50" />
            <button
              onClick={() => onEdit(item)}
              title="Edit"
              className="flex-1 flex items-center justify-center py-2.5 text-gray-400 hover:bg-gray-50 transition-all rounded-br-2xl"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </>
        )}

        {!isPending && (
          <>
            {!isGenerating && (
              <>
                <button
                  onClick={() => onOpenReview(item)}
                  title="View"
                  className="flex-1 flex items-center justify-center py-2.5 text-[#00435c] hover:bg-[#f0f7fa] transition-all rounded-bl-2xl"
                >
                  <Eye className="w-4 h-4" />
                </button>
                {onDelete && <div className="w-px bg-gray-50" />}
              </>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(item.job_id)}
                title="Delete"
                className={`flex-1 flex items-center justify-center py-2.5 text-gray-400 hover:bg-red-50 hover:text-red-400 transition-all ${isGenerating ? 'rounded-bl-2xl ' : ''}rounded-br-2xl`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
