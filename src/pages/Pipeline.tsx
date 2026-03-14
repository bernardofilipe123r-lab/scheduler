import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
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
  useDeletePipelineItem,
  usePipelineFilters,
  pipelineKeys,
} from '@/features/pipeline'
import type { PipelineItem } from '@/features/pipeline'
import { useTobyConfig } from '@/features/toby'
import { PipelineSkeleton } from '@/shared/components/Skeleton'

export function PipelinePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { filters, setStatus, setBrand, setContentType, resetFilters } = usePipelineFilters()
  const { data: statsData, isLoading: statsLoading } = usePipelineStats()
  const { data: pipelineData, isLoading: itemsLoading, isFetching: itemsFetching, isError: itemsError } = usePipelineItems(filters)
  const { data: tobyConfig } = useTobyConfig()
  const autoSchedule = tobyConfig?.auto_schedule ?? true
  const approve = useApprovePipelineItem()
  const reject = useRejectPipelineItem()
  const bulkApprove = useBulkApprovePipeline()
  const bulkReject = useBulkRejectPipeline()
  const deletePipeline = useDeletePipelineItem()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reviewModalIndex, setReviewModalIndex] = useState<number | null>(null)
  const [bulkAction, setBulkAction] = useState<{ action: 'approve' | 'reject'; count: number } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const prevGeneratingCount = useRef<number | null>(null)

  // Continuous auto-switch: when generating tab empties out and pending_review has items, switch automatically.
  // Also shows a toast when items finish generating so user knows content is ready.
  useEffect(() => {
    if (!statsData) return
    const prev = prevGeneratingCount.current
    const curr = statsData.generating

    // Detect transition: items just finished generating
    if (prev !== null && prev > 0 && curr === 0 && statsData.pending_review > 0) {
      if (filters.status === 'generating') {
        setStatus('pending_review')
        toast.success(`${statsData.pending_review} item${statsData.pending_review > 1 ? 's' : ''} ready for review!`, { duration: 4000 })
      }
    }

    // Also handle the case where user lands on generating tab but nothing is generating
    if (prev === null && curr === 0 && statsData.pending_review > 0 && filters.status === 'generating') {
      setStatus('pending_review')
    }

    // Notify about failures
    if (prev !== null && prev > 0 && statsData.failed > 0) {
      const newlyFailed = Math.max(0, prev - curr - (statsData.pending_review - (prevGeneratingCount.current === null ? 0 : 0)))
      if (newlyFailed > 0 && curr === 0) {
        toast.error(`${statsData.failed} item${statsData.failed > 1 ? 's' : ''} failed to generate`, { duration: 5000 })
      }
    }

    prevGeneratingCount.current = curr
  }, [statsData, filters.status, setStatus])

  const allItems = useMemo(() => pipelineData?.items ?? [], [pipelineData])

  // Client-side search filter
  const items = useMemo(() => {
    if (!searchQuery.trim()) return allItems
    const q = searchQuery.toLowerCase()
    return allItems.filter(i =>
      (i.title ?? '').toLowerCase().includes(q) ||
      (i.caption ?? '').toLowerCase().includes(q) ||
      i.brands.some(b => b.toLowerCase().includes(q)),
    )
  }, [allItems, searchQuery])

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

  const handleDelete = useCallback((id: string) => {
    deletePipeline.mutate(id)
  }, [deletePipeline])

  const handleOpenReview = useCallback((item: PipelineItem) => {
    const idx = items.findIndex(i => i.job_id === item.job_id)
    if (idx >= 0) setReviewModalIndex(idx)
  }, [items])

  const showAllReviewedBanner = filters.status === 'pending_review' && items.length === 0 && !itemsLoading && (statsData?.pending_review ?? 0) === 0 && (statsData?.scheduled ?? 0) > 0
  // Show skeleton only on initial load OR refetching when we know there are still items to show
  const isShowingSkeleton = itemsLoading || (itemsFetching && items.length === 0 && (statsData?.pending_review ?? 0) > 0)
  const pendingCount = statsData?.pending_review ?? 0

  // When bulk approve/reject empties the visible batch but more items exist,
  // force a refetch to load the next batch automatically.
  useEffect(() => {
    if (
      !itemsLoading &&
      !itemsFetching &&
      items.length === 0 &&
      filters.status === 'pending_review' &&
      (statsData?.pending_review ?? 0) > 0
    ) {
      queryClient.refetchQueries({ queryKey: pipelineKeys.list(filters) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, itemsLoading, itemsFetching, statsData?.pending_review, filters.status])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Pipeline</h1>
          <p className="text-sm text-gray-400 mt-1">Review, schedule, and track your content</p>
        </div>
        {pendingCount > 0 && (
          <button
            onClick={() => setStatus('pending_review')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#00435c] text-white text-sm font-medium rounded-xl hover:bg-[#002d3f] transition-colors shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            Review All
            <span className="bg-white/20 text-white text-xs font-semibold px-1.5 py-0.5 rounded-md">
              {pendingCount}
            </span>
          </button>
        )}
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
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
      />

      {/* Loading skeleton — show on initial load OR when refetching an empty batch that still has items */}
      {isShowingSkeleton && <PipelineSkeleton status={filters.status} />}

      {/* Content grid */}
      {!isShowingSkeleton && items.length > 0 && (
        <PipelineGrid
          items={items}
          onApprove={handleApprove}
          onReject={handleReject}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onOpenReview={handleOpenReview}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          autoSchedule={autoSchedule}
        />
      )}

      {/* Empty states */}
      {itemsError && !itemsLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-red-500 font-medium mb-1">Failed to load content</p>
          <p className="text-xs text-gray-400">Please refresh the page or try again later.</p>
        </div>
      )}
      {!isShowingSkeleton && !itemsError && items.length === 0 && !showAllReviewedBanner && (
        <EmptyState status={filters.status} />
      )}

      {!itemsError && !itemsLoading && showAllReviewedBanner && (
        <PostReviewBanner
          contentBreakdown={statsData?.content_breakdown}
          scheduledUntil={statsData?.scheduled_until}
        />
      )}

      {/* Review modal */}
      <AnimatePresence>
        {reviewModalIndex !== null && items.length > 0 && (
          <ReviewModal
            items={items}
            initialIndex={reviewModalIndex}
            onApprove={(id) => handleApprove(id)}
            onReject={handleReject}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onClose={() => setReviewModalIndex(null)}
            autoSchedule={autoSchedule}
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
