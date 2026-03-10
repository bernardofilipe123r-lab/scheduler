/**
 * Thread Job Detail — displays text-only thread content per brand.
 * Supports single posts and thread chains stored in brand_outputs.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Trash2, RefreshCw, Calendar, Loader2,
  Check, Clock, MessageSquare,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  useDeleteJob,
  useRegenerateJob,
  useUpdateBrandStatus,
} from '@/features/jobs'
import { useAutoScheduleReel } from '@/features/scheduling'
import { BrandBadge, getBrandLabel, getBrandColor } from '@/features/brands'
import { StatusBadge, Modal } from '@/shared/components'
import type { Job, BrandName } from '@/shared/types'

interface Props {
  job: Job
}

export function ThreadsJobDetail({ job }: Props) {
  const navigate = useNavigate()
  const deleteJob = useDeleteJob()
  const regenerateJob = useRegenerateJob()
  const updateBrandStatus = useUpdateBrandStatus()
  const autoSchedule = useAutoScheduleReel()

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [schedulingBrand, setSchedulingBrand] = useState<string | null>(null)

  const isGenerating = job.status === 'generating' || job.status === 'pending'

  const handleDelete = async () => {
    try {
      await deleteJob.mutateAsync(job.job_id)
      toast.success('Job deleted')
      navigate('/jobs')
    } catch {
      toast.error('Failed to delete job')
    }
  }

  const handleRegenerate = async () => {
    try {
      await regenerateJob.mutateAsync(job.job_id)
      toast.success('Regenerating thread content...')
    } catch {
      toast.error('Failed to regenerate')
    }
  }

  const handleAutoSchedule = async (brand: string) => {
    setSchedulingBrand(brand)
    try {
      const output = job.brand_outputs[brand as BrandName]
      if (!output?.reel_id && !output?.caption) {
        // For threads, we need to schedule via the threads API
        // Use updateBrandStatus to mark as scheduled
        await updateBrandStatus.mutateAsync({
          id: job.job_id,
          brand: brand as BrandName,
          status: 'scheduled',
        })
        toast.success(`${getBrandLabel(brand)} scheduled`)
        return
      }
      await autoSchedule.mutateAsync({
        brand: brand as BrandName,
        reel_id: output.reel_id || `threads_${brand}_${job.job_id}`,
        variant: 'threads',
      })
      toast.success(`${getBrandLabel(brand)} auto-scheduled`)
    } catch {
      toast.error('Failed to schedule')
    } finally {
      setSchedulingBrand(null)
    }
  }

  const handleDismiss = async (brand: string) => {
    try {
      await updateBrandStatus.mutateAsync({
        id: job.job_id,
        brand: brand as BrandName,
        status: 'dismissed',
      })
      toast.success(`${getBrandLabel(brand)} dismissed`)
    } catch {
      toast.error('Failed to dismiss')
    }
  }

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-1">
        <button
          onClick={() => navigate('/jobs')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors py-1.5"
        >
          <ArrowLeft className="w-[18px] h-[18px]" />
          Back
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleRegenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 px-3 py-[7px] text-[13px] font-medium text-gray-500 bg-white border border-gray-200 rounded-[7px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate
          </button>
          <button
            onClick={() => setDeleteModalOpen(true)}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 px-3 py-[7px] text-[13px] font-medium text-rose-600 bg-white border border-rose-200 rounded-[7px] hover:bg-rose-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>

      {/* Hero card */}
      <div className="bg-white rounded-[10px] border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">#{job.job_id}</span>
          <StatusBadge status={job.status} size="md" />
          <span className="text-xs font-medium bg-stone-50 text-stone-600 px-2.5 py-1 rounded-full flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            Thread
          </span>
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-1">{job.title}</h1>
        <p className="text-xs text-gray-400">
          Created {format(new Date(job.created_at), 'MMM d, yyyy h:mm a')}
          {job.content_count && job.content_count > 1 && ` · ${job.content_count} per brand`}
        </p>

        {/* Progress */}
        {isGenerating && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-stone-600" />
              {job.current_step || 'Generating...'}
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-stone-600 rounded-full transition-all duration-700"
                style={{ width: `${job.progress_percent || 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Brand outputs */}
      <div className="space-y-3">
        {(job.brands || []).map(brand => {
          const output = job.brand_outputs?.[brand as BrandName]
          const brandColor = getBrandColor(brand)
          const brandLabel = getBrandLabel(brand)
          const caption = output?.caption || ''
          const isChain = (output as any)?.is_chain === true
          const chainParts: string[] = (output as any)?.chain_parts || []
          const formatType: string = (output as any)?.format_type || ''
          const status = output?.status || 'pending'

          return (
            <div
              key={brand}
              className="bg-white rounded-[10px] border border-gray-200 shadow-sm overflow-hidden"
            >
              {/* Brand header */}
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrandBadge brand={brand as BrandName} size="sm" />
                  <span className="text-sm font-semibold text-gray-900">{brandLabel}</span>
                  {formatType && (
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {formatType.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {status === 'completed' && (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <Check className="w-3.5 h-3.5" />
                      Ready
                    </span>
                  )}
                  {status === 'scheduled' && (
                    <span className="flex items-center gap-1 text-xs font-medium text-blue-600">
                      <Clock className="w-3.5 h-3.5" />
                      Scheduled
                    </span>
                  )}
                  {status === 'generating' && (
                    <span className="flex items-center gap-1 text-xs font-medium text-stone-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generating
                    </span>
                  )}
                  {status === 'failed' && (
                    <span className="text-xs font-medium text-rose-600">{output?.error || 'Failed'}</span>
                  )}
                </div>
              </div>

              {/* Content area */}
              <div className="px-5 py-4">
                {status === 'pending' || status === 'generating' ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {output?.progress_message || 'Generating thread content...'}
                  </div>
                ) : status === 'failed' ? (
                  <p className="text-sm text-rose-500">{output?.error || 'Generation failed'}</p>
                ) : (
                  <div className="space-y-3">
                    {isChain && chainParts.length > 0 ? (
                      <>
                        <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Thread Chain ({chainParts.length} parts)</p>
                        <div className="space-y-2">
                          {chainParts.map((part: string, idx: number) => (
                            <div
                              key={idx}
                              className="text-sm text-gray-700 bg-gray-50 rounded-lg px-4 py-3 border-l-[3px]"
                              style={{ borderColor: brandColor }}
                            >
                              <span className="text-[10px] text-gray-400 font-mono mr-2">#{idx + 1}</span>
                              {part}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div
                        className="text-sm text-gray-700 bg-gray-50 rounded-lg px-4 py-3 border-l-[3px] whitespace-pre-wrap"
                        style={{ borderColor: brandColor }}
                      >
                        {caption}
                      </div>
                    )}

                    {/* Actions */}
                    {status === 'completed' && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleAutoSchedule(brand)}
                          disabled={schedulingBrand === brand}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-stone-800 rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors"
                        >
                          {schedulingBrand === brand ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Calendar className="w-3.5 h-3.5" />
                          )}
                          Auto Schedule
                        </button>
                        <button
                          onClick={() => handleDismiss(brand)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          Dismiss
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(isChain ? chainParts.join('\n\n') : caption)
                            toast.success('Copied to clipboard')
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Delete confirmation modal */}
      <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Job">
        <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete this thread job? This cannot be undone.</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setDeleteModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteJob.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors"
          >
            {deleteJob.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
