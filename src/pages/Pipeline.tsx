import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { GitPullRequestDraft } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import {
  PipelineStats,
  PipelineToolbar,
  PipelineGrid,
  PostReviewBanner,
  EmptyState,
  ReviewModal,
  BulkActionModal,
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reviewModalIndex, setReviewModalIndex] = useState<number | null>(null)
  const [bulkAction, setBulkAction] = useState<{ action: 'approve' | 'reject'; count: number } | null>(null)

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

  // Bulk actions now go through confirmation modal
  const handleBulkApproveRequest = useCallback(() => {
    if (selectedIds.size === 0) return
    setBulkAction({ action: 'approve', count: selectedIds.size })
  }, [selectedIds.size])

  const handleBulkRejectRequest = useCallback(() => {
    if (selectedIds.size === 0) return
    setBulkAction({ action: 'reject', count: selectedIds.size })
  }, [selectedIds.size])

  const handleBulkConfirm = useCallback(() => {
    if (!bulkAction) return
    const ids = Array.from(selectedIds)
    if (bulkAction.action === 'approve') {
      bulkApprove.mutate(ids)
    } else {
      bulkReject.mutate(ids)
    }
    setSelectedIds(new Set())
    setBulkAction(null)
  }, [bulkAction, selectedIds, bulkApprove, bulkReject])

  const handleEdit = useCallback((item: PipelineItem) => {
    navigate(`/job/${item.job_id}`)
  }, [navigate])

  const handleOpenReview = useCallback((item: PipelineItem) => {
    const idx = items.findIndex(i => i.job_id === item.job_id)
    if (idx >= 0) setReviewModalIndex(idx)
  }, [items])

  const handleRegenerate = useCallback(() => {
    regenerate.mutate(3)
  }, [regenerate])

  const handleRegenerateItem = useCallback((_id: string) => {
    queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
    regenerate.mutate(1)
  }, [queryClient, regenerate])

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
        onBulkApprove={handleBulkApproveRequest}
        onBulkReject={handleBulkRejectRequest}
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
          onEdit={handleEdit}
          onOpenReview={handleOpenReview}
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

      {/* Review modal (Tinder-style video review) */}
      <AnimatePresence>
        {reviewModalIndex !== null && items.length > 0 && (
          <ReviewModal
            items={items}
            initialIndex={reviewModalIndex}
            onApprove={(id) => handleApprove(id)}
            onReject={handleReject}
            onEdit={handleEdit}
            onClose={() => setReviewModalIndex(null)}
          />
        )}
      </AnimatePresence>

      {/* Bulk action confirmation modal */}
      <BulkActionModal
        isOpen={bulkAction !== null}
        action={bulkAction?.action ?? 'approve'}
        count={bulkAction?.count ?? 0}
        onConfirm={handleBulkConfirm}
        onCancel={() => setBulkAction(null)}
      />
    </div>
  )
}
