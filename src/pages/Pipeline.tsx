import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { GitPullRequestDraft } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  PipelineStats,
  PipelineToolbar,
  PipelineGrid,
  PostReviewBanner,
  EmptyState,
  usePipelineItems,
  usePipelineStats,
  useApprovePipelineItem,
  useRejectPipelineItem,
  useBulkApprovePipeline,
  useBulkRejectPipeline,
  useRegeneratePipeline,
  usePipelineFilters,
  pipelineKeys,
} from '@/features/pipeline'
import type { PipelineItem } from '@/features/pipeline'
import { useDeleteJob } from '@/features/jobs/hooks/use-jobs'
import { PipelineSkeleton } from '@/shared/components/Skeleton'

export function PipelinePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { filters, setStatus, setBrand, setContentType, resetFilters } = usePipelineFilters()
  const { data: statsData, isLoading: statsLoading } = usePipelineStats()
  const { data: pipelineData, isLoading: itemsLoading, isError: itemsError } = usePipelineItems(filters)
  const approve = useApprovePipelineItem()
  const reject = useRejectPipelineItem()
  const bulkApprove = useBulkApprovePipeline()
  const bulkReject = useBulkRejectPipeline()
  const regenerate = useRegeneratePipeline()
  const deleteJob = useDeleteJob()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const items = pipelineData?.items ?? []
  const pendingItems = useMemo(() => items.filter(i => i.lifecycle === 'pending_review'), [items])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === pendingItems.length && pendingItems.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingItems.map(i => i.job_id)))
    }
  }, [pendingItems, selectedIds.size])

  const handleApprove = useCallback((id: string, caption?: string) => {
    approve.mutate({ jobId: id, caption })
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }, [approve])

  const handleReject = useCallback((id: string) => {
    reject.mutate({ jobId: id })
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }, [reject])

  const handleBulkApprove = useCallback(() => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    bulkApprove.mutate(ids)
    setSelectedIds(new Set())
  }, [selectedIds, bulkApprove])

  const handleBulkReject = useCallback(() => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    bulkReject.mutate(ids)
    setSelectedIds(new Set())
  }, [selectedIds, bulkReject])

  const handleNavigate = useCallback((item: PipelineItem) => {
    navigate(`/job/${item.job_id}`)
  }, [navigate])

  const handleDelete = useCallback((id: string) => {
    deleteJob.mutate(id, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
        toast.success('Content deleted')
      },
    })
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }, [deleteJob, queryClient])

  const handleRegenerate = useCallback(() => {
    regenerate.mutate(3)
  }, [regenerate])

  const handleRegenerateItem = useCallback((id: string) => {
    // For single item regenerate, we delete + trigger Toby
    deleteJob.mutate(id, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
        regenerate.mutate(1)
      },
    })
  }, [deleteJob, queryClient, regenerate])

  const showAllReviewedBanner = filters.status === 'pending_review' && items.length === 0 && !itemsLoading && (statsData?.pending_review ?? 0) === 0 && (statsData?.scheduled ?? 0) > 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <GitPullRequestDraft className="w-6 h-6 text-gray-400" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500">All your content — review, schedule, and track</p>
        </div>
      </div>

      {/* Stats bar */}
      <PipelineStats stats={statsData} isLoading={statsLoading} />

      {/* Toolbar (filters + bulk actions) */}
      <PipelineToolbar
        filters={filters}
        onStatusChange={setStatus}
        onBrandChange={setBrand}
        onContentTypeChange={setContentType}
        onReset={resetFilters}
        selectedCount={selectedIds.size}
        onBulkApprove={handleBulkApprove}
        onBulkReject={handleBulkReject}
        onSelectAll={handleSelectAll}
        totalPending={pendingItems.length}
      />

      {/* Loading skeleton */}
      {itemsLoading && <PipelineSkeleton />}

      {/* Content grid */}
      {!itemsLoading && items.length > 0 && (
        <PipelineGrid
          items={items}
          onApprove={handleApprove}
          onReject={handleReject}
          onNavigate={handleNavigate}
          onDelete={handleDelete}
          onRegenerate={handleRegenerateItem}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      )}

      {/* Empty states */}
      {itemsError && !itemsLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-red-500 font-medium mb-1">Failed to load content</p>
          <p className="text-xs text-gray-400">Please refresh the page or try again later.</p>
        </div>
      )}
      {!itemsLoading && !itemsError && items.length === 0 && !showAllReviewedBanner && (
        <EmptyState status={filters.status} />
      )}

      {!itemsError && showAllReviewedBanner && (
        <PostReviewBanner onRegenerate={handleRegenerate} isRegenerating={regenerate.isPending} />
      )}
    </div>
  )
}
