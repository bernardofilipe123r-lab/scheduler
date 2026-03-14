import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
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
} from '@/features/pipeline'
import type { PipelineItem } from '@/features/pipeline'
import { useTobyConfig } from '@/features/toby'
import { PipelineSkeleton } from '@/shared/components/Skeleton'

export function PipelinePage() {
  const navigate = useNavigate()
  const { filters, setStatus, setBrand, setContentType, setPage, resetFilters } = usePipelineFilters()
  const { data: statsData, isLoading: statsLoading } = usePipelineStats()
  const { data: pipelineData, isLoading: itemsLoading, isFetching: itemsFetching, isError: itemsError, isPlaceholderData } = usePipelineItems(filters)
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
  const pendingCount = statsData?.pending_review ?? 0
  const totalItems = pipelineData?.total ?? 0
  const currentPage = filters.page
  const pageSize = filters.limit
  // Show skeleton on initial tab load (no data/placeholder). Also show when
  // optimistic updates empty the page but more items exist — prevents empty-state
  // flash during refetch/step-back. Works across ALL tabs, not just pending.
  const isShowingSkeleton = itemsLoading || (allItems.length === 0 && totalItems > 0 && !itemsError)
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const canGoPrev = currentPage > 1
  const canGoNext = currentPage < totalPages

  const visiblePageItems = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, idx) => idx + 1)
    }

    const pages: number[] = [1]
    const middleStart = Math.max(2, currentPage - 1)
    const middleEnd = Math.min(totalPages - 1, currentPage + 1)

    if (middleStart > 2) pages.push(-1)
    for (let p = middleStart; p <= middleEnd; p++) pages.push(p)
    if (middleEnd < totalPages - 1) pages.push(-2)

    pages.push(totalPages)
    return pages
  }, [currentPage, totalPages])

  // Keep selection scoped to currently visible items only.
  useEffect(() => {
    const visibleIds = new Set(items.map(i => i.job_id))
    setSelectedIds(prev => {
      const next = new Set(Array.from(prev).filter(id => visibleIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [items])

  // If current page becomes empty after mutations/refetches, step back one page.
  // Uses allItems (pre-search) to avoid false step-back when search matches nothing.
  useEffect(() => {
    if (
      pipelineData &&
      !itemsLoading &&
      !itemsFetching &&
      allItems.length === 0 &&
      pipelineData.total > 0 &&
      filters.page > 1
    ) {
      setPage(filters.page - 1)
    }
  }, [filters.page, allItems.length, itemsFetching, itemsLoading, pipelineData, setPage])

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
        onSearch={(q) => {
          setSearchQuery(q)
          if (filters.page !== 1) setPage(1)
        }}
      />

      {/* Loading skeleton — show on initial load OR when refetching an empty batch that still has items */}
      {isShowingSkeleton && <PipelineSkeleton status={filters.status} />}

      {/* Content grid */}
      {!isShowingSkeleton && items.length > 0 && (
        <>
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-gray-500">
                {itemsFetching && isPlaceholderData ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                    Loading page {currentPage}…
                  </span>
                ) : (
                  <>Showing page {currentPage} of {totalPages} ({totalItems} total)</>
                )}
              </p>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => canGoPrev && setPage(currentPage - 1)}
                  disabled={!canGoPrev}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {visiblePageItems.map((pageValue, idx) => {
                  if (pageValue < 0) {
                    return (
                      <span key={`ellipsis-${idx}`} className="px-2 text-xs text-gray-400">...</span>
                    )
                  }

                  const isActive = pageValue === currentPage
                  return (
                    <button
                      key={pageValue}
                      onClick={() => setPage(pageValue)}
                      className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition-colors ${
                        isActive
                          ? 'bg-[#00435c] text-white'
                          : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {pageValue}
                    </button>
                  )
                })}

                <button
                  onClick={() => canGoNext && setPage(currentPage + 1)}
                  disabled={!canGoNext}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
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
