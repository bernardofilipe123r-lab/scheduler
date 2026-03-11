import { useState, useCallback, useMemo } from 'react'
import { GitPullRequestDraft } from 'lucide-react'
import {
  PipelineStats,
  PipelineToolbar,
  PipelineGrid,
  PipelineDetailModal,
  PostReviewBanner,
  EmptyState,
  usePipelineItems,
  usePipelineStats,
  useApprovePipelineItem,
  useRejectPipelineItem,
  useBulkApprovePipeline,
  useBulkRejectPipeline,
  useEditPipelineItem,
  useRegeneratePipeline,
  usePipelineFilters,
} from '@/features/pipeline'
import type { PipelineItem } from '@/features/pipeline'

export function PipelinePage() {
  const { filters, setStatus, setBrand, setContentType, resetFilters } = usePipelineFilters()
  const { data: statsData, isLoading: statsLoading } = usePipelineStats()
  const { data: pipelineData, isLoading: itemsLoading } = usePipelineItems(filters)
  const approve = useApprovePipelineItem()
  const reject = useRejectPipelineItem()
  const bulkApprove = useBulkApprovePipeline()
  const bulkReject = useBulkRejectPipeline()
  const edit = useEditPipelineItem()
  const regenerate = useRegeneratePipeline()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailItem, setDetailItem] = useState<PipelineItem | null>(null)

  const items = pipelineData?.items ?? []
  const pendingItems = useMemo(() => items.filter(i => i.pipeline_status === 'pending'), [items])

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
    setDetailItem(null)
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }, [approve])

  const handleReject = useCallback((id: string) => {
    reject.mutate({ jobId: id })
    setDetailItem(null)
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

  const handleEdit = useCallback((id: string, caption: string, title: string) => {
    edit.mutate({ jobId: id, caption, title })
  }, [edit])

  const handleRegenerate = useCallback(() => {
    regenerate.mutate(3)
  }, [regenerate])

  // Show "all reviewed" banner when filtering pending + 0 results + stats show some approved
  const showAllReviewedBanner = filters.status === 'pending' && items.length === 0 && !itemsLoading && (statsData?.approved ?? 0) > 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <GitPullRequestDraft className="w-6 h-6 text-gray-400" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500">Review and approve content before it goes live</p>
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
      {itemsLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-64 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Content grid */}
      {!itemsLoading && items.length > 0 && (
        <PipelineGrid
          items={items}
          onApprove={handleApprove}
          onReject={handleReject}
          onOpen={setDetailItem}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      )}

      {/* Empty states */}
      {!itemsLoading && items.length === 0 && !showAllReviewedBanner && (
        <EmptyState status={filters.status} />
      )}

      {showAllReviewedBanner && (
        <PostReviewBanner onRegenerate={handleRegenerate} isRegenerating={regenerate.isPending} />
      )}

      {/* Detail modal */}
      {detailItem && (
        <PipelineDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onEdit={handleEdit}
        />
      )}
    </div>
  )
}
