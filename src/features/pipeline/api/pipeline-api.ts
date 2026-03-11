import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, patch } from '@/shared/api/client'
import toast from 'react-hot-toast'
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

  return useQuery({
    queryKey: pipelineKeys.list(filters),
    queryFn: () => get<PipelineResponse>(`/api/pipeline?${qs}`),
    staleTime: 30_000,
  })
}

export function usePipelineStats() {
  return useQuery({
    queryKey: pipelineKeys.stats(),
    queryFn: () => get<PipelineStats>('/api/pipeline/stats'),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

export function useApprovePipelineItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, caption }: { jobId: string; caption?: string }) =>
      post(`/api/pipeline/${jobId}/approve`, { caption }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      toast.success('Content approved and scheduled!')
    },
    onError: () => {
      toast.error('Failed to approve — please try again')
    },
  })
}

export function useRejectPipelineItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, reason }: { jobId: string; reason?: string }) =>
      post(`/api/pipeline/${jobId}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      toast('Content rejected', { icon: '🗑️' })
    },
    onError: () => {
      toast.error('Failed to reject — please try again')
    },
  })
}

export function useBulkApprovePipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobIds: string[]) =>
      post('/api/pipeline/bulk-approve', { job_ids: jobIds }),
    onSuccess: (_: unknown, jobIds: string[]) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      toast.success(`${jobIds.length} items approved and scheduled!`)
    },
    onError: () => {
      toast.error('Bulk approve failed — please try again')
    },
  })
}

export function useBulkRejectPipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobIds: string[]) =>
      post('/api/pipeline/bulk-reject', { job_ids: jobIds }),
    onSuccess: (_: unknown, jobIds: string[]) => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
      toast(`${jobIds.length} items rejected`, { icon: '🗑️' })
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
