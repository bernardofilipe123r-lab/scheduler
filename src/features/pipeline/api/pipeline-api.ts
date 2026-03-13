import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, patch, del } from '@/shared/api/client'
import toast from 'react-hot-toast'
import { jobKeys } from '@/features/jobs/hooks/use-jobs'
import type { PipelineFilters, PipelineResponse, PipelineStats, PipelineItem } from '../model/types'

export const pipelineKeys = {
  all: ['pipeline'] as const,
  list: (filters: PipelineFilters) => [...pipelineKeys.all, 'list', filters] as const,
  stats: () => [...pipelineKeys.all, 'stats'] as const,
}

export function usePipelineItems(filters: PipelineFilters) {
  const params: Record<string, string> = {}
  if (filters.status) params.status = filters.status
  if (filters.brand) params.brand = filters.brand
  if (filters.content_type && filters.content_type !== 'all') params.content_type = filters.content_type
  if (filters.batch_id) params.batch_id = filters.batch_id

  const qs = new URLSearchParams(params).toString()
  const isGenerating = filters.status === 'generating'

  return useQuery({
    queryKey: pipelineKeys.list(filters),
    queryFn: () => get<PipelineResponse>(`/api/pipeline?${qs}`),
    staleTime: 0,
    refetchInterval: isGenerating ? 5_000 : false,
  })
}

export function usePipelineStats() {
  return useQuery({
    queryKey: pipelineKeys.stats(),
    queryFn: () => get<PipelineStats>('/api/pipeline/stats'),
    staleTime: 15_000,
    refetchInterval: 15_000,
  })
}

function findItemLifecycle(queryClient: ReturnType<typeof useQueryClient>, jobId: string): string | undefined {
  const cached = queryClient.getQueriesData<PipelineResponse>({ queryKey: [...pipelineKeys.all, 'list'] })
  for (const [, data] of cached) {
    const item = data?.items?.find(i => i.job_id === jobId)
    if (item) return item.lifecycle
  }
  return undefined
}

export function useApprovePipelineItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, caption }: { jobId: string; caption?: string }) =>
      post(`/api/pipeline/${jobId}/approve`, { caption }),
    onMutate: async ({ jobId }) => {
      await queryClient.cancelQueries({ queryKey: pipelineKeys.all })
      const lifecycle = findItemLifecycle(queryClient, jobId)
      // Remove from all cached lists
      queryClient.setQueriesData<PipelineResponse>(
        { queryKey: pipelineKeys.all },
        (old) => old && Array.isArray(old.items) ? { ...old, items: old.items.filter(i => i.job_id !== jobId) } : old,
      )
      // Optimistically update stats immediately
      queryClient.setQueryData<PipelineStats>(pipelineKeys.stats(), (old) => {
        if (!old) return old
        const next = { ...old }
        if (lifecycle === 'pending_review') next.pending_review = Math.max(0, next.pending_review - 1)
        next.scheduled = (next.scheduled ?? 0) + 1
        return next
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      queryClient.invalidateQueries({ queryKey: jobKeys.all })
      toast.success('Content approved and scheduled!')
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      toast.error('Failed to schedule — please try again')
    },
  })
}

export function useRejectPipelineItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, reason }: { jobId: string; reason?: string }) =>
      post(`/api/pipeline/${jobId}/reject`, { reason }),
    onMutate: async ({ jobId }) => {
      await queryClient.cancelQueries({ queryKey: pipelineKeys.all })
      const lifecycle = findItemLifecycle(queryClient, jobId)
      queryClient.setQueriesData<PipelineResponse>(
        { queryKey: pipelineKeys.all },
        (old) => old && Array.isArray(old.items) ? { ...old, items: old.items.filter(i => i.job_id !== jobId) } : old,
      )
      queryClient.setQueryData<PipelineStats>(pipelineKeys.stats(), (old) => {
        if (!old) return old
        const next = { ...old }
        if (lifecycle === 'pending_review') next.pending_review = Math.max(0, next.pending_review - 1)
        next.rejected = (next.rejected ?? 0) + 1
        return next
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      queryClient.invalidateQueries({ queryKey: jobKeys.all })
      toast('Content rejected', { icon: '🗑️' })
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      toast.error('Failed to reject — please try again')
    },
  })
}

export function useBulkApprovePipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobIds: string[]) =>
      post('/api/pipeline/bulk-approve', { job_ids: jobIds }),
    onMutate: async (jobIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: pipelineKeys.all })
      const idSet = new Set(jobIds)
      queryClient.setQueriesData<PipelineResponse>(
        { queryKey: pipelineKeys.all },
        (old) => old && Array.isArray(old.items) ? { ...old, items: old.items.filter(i => !idSet.has(i.job_id)) } : old,
      )
      queryClient.setQueryData<PipelineStats>(pipelineKeys.stats(), (old) => {
        if (!old) return old
        return { ...old, pending_review: Math.max(0, old.pending_review - jobIds.length), scheduled: (old.scheduled ?? 0) + jobIds.length }
      })
    },
    onSuccess: (_: unknown, jobIds: string[]) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      toast.success(`${jobIds.length} items approved and scheduled!`)
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      toast.error('Bulk approve failed — please try again')
    },
  })
}

export function useBulkRejectPipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobIds: string[]) =>
      post('/api/pipeline/bulk-reject', { job_ids: jobIds }),
    onMutate: async (jobIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: pipelineKeys.all })
      const idSet = new Set(jobIds)
      queryClient.setQueriesData<PipelineResponse>(
        { queryKey: pipelineKeys.all },
        (old) => old && Array.isArray(old.items) ? { ...old, items: old.items.filter(i => !idSet.has(i.job_id)) } : old,
      )
      queryClient.setQueryData<PipelineStats>(pipelineKeys.stats(), (old) => {
        if (!old) return old
        return { ...old, pending_review: Math.max(0, old.pending_review - jobIds.length), rejected: (old.rejected ?? 0) + jobIds.length }
      })
    },
    onSuccess: (_: unknown, jobIds: string[]) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      toast(`${jobIds.length} items rejected`, { icon: '🗑️' })
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
    },
  })
}

export function useEditPipelineItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, caption, title }: { jobId: string; caption?: string; title?: string }) =>
      patch<PipelineItem>(`/api/pipeline/${jobId}/edit`, { caption, title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      toast.success('Changes saved')
    },
  })
}

export function useRegeneratePipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (count: number) =>
      post('/api/pipeline/regenerate', { count }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      toast.success('Toby will generate more content shortly!')
    },
  })
}

export function useDeletePipelineItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) =>
      del(`/api/pipeline/${jobId}`),
    onMutate: async (jobId) => {
      await queryClient.cancelQueries({ queryKey: pipelineKeys.all })
      const lifecycle = findItemLifecycle(queryClient, jobId)
      queryClient.setQueriesData<PipelineResponse>(
        { queryKey: pipelineKeys.all },
        (old) => old && Array.isArray(old.items) ? { ...old, items: old.items.filter(i => i.job_id !== jobId) } : old,
      )
      queryClient.setQueryData<PipelineStats>(pipelineKeys.stats(), (old) => {
        if (!old) return old
        const next = { ...old }
        if (lifecycle === 'pending_review') next.pending_review = Math.max(0, next.pending_review - 1)
        else if (lifecycle === 'scheduled') next.scheduled = Math.max(0, (next.scheduled ?? 1) - 1)
        else if (lifecycle === 'published') next.published = Math.max(0, (next.published ?? 1) - 1)
        else if (lifecycle === 'rejected') next.rejected = Math.max(0, (next.rejected ?? 1) - 1)
        return next
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      queryClient.invalidateQueries({ queryKey: jobKeys.all })
      toast.success('Content deleted')
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      toast.error('Failed to delete — please try again')
    },
  })
}
