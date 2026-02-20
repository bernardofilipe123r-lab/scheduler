import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { jobsApi } from '../api'
import type { Job, BrandName, BrandStatus } from '@/shared/types'

// Query keys for caching
export const jobKeys = {
  all: ['jobs'] as const,
  lists: () => [...jobKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...jobKeys.lists(), filters] as const,
  details: () => [...jobKeys.all, 'detail'] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
  nextSlots: (id: string) => [...jobKeys.detail(id), 'next-slots'] as const,
}

// ── Helpers for optimistic cache mutations ──────────────────────────────

/** Remove a job from every cached list query. */
function optimisticRemoveFromLists(
  queryClient: ReturnType<typeof useQueryClient>,
  jobId: string,
) {
  queryClient.setQueriesData<Job[]>(
    { queryKey: jobKeys.lists() },
    (old) => old?.filter((j) => j.id !== jobId),
  )
}

/** Patch a job inside every cached list query. */
function optimisticPatchInLists(
  queryClient: ReturnType<typeof useQueryClient>,
  jobId: string,
  patch: Partial<Job>,
) {
  queryClient.setQueriesData<Job[]>(
    { queryKey: jobKeys.lists() },
    (old) => old?.map((j) => (j.id === jobId ? { ...j, ...patch } : j)),
  )
}

/** Patch the detail cache for a single job. */
function optimisticPatchDetail(
  queryClient: ReturnType<typeof useQueryClient>,
  jobId: string,
  patch: Partial<Job>,
) {
  queryClient.setQueryData<Job>(
    jobKeys.detail(jobId),
    (old) => old ? { ...old, ...patch } : old,
  )
}

// ── Queries ─────────────────────────────────────────────────────────────

export function useJobs() {
  return useQuery({
    queryKey: jobKeys.lists(),
    queryFn: jobsApi.list,
    // Realtime subscription handles instant updates; poll as safety fallback
    refetchInterval: 30000,
    refetchOnMount: 'always',
    staleTime: 2000,
  })
}

export function useJob(id: string) {
  return useQuery({
    queryKey: jobKeys.detail(id),
    queryFn: () => jobsApi.get(id),
    enabled: !!id,
    // Realtime subscription handles instant updates; poll as safety fallback
    refetchInterval: 30000,
  })
}

// ── Mutations (optimistic where it matters) ─────────────────────────────

export function useCreateJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: jobsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() })
    },
  })
}

export function useUpdateJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Job> }) => 
      jobsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() })
    },
  })
}

export function useDeleteJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: jobsApi.delete,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: jobKeys.lists() })
      const prev = queryClient.getQueriesData<Job[]>({ queryKey: jobKeys.lists() })
      optimisticRemoveFromLists(queryClient, id)
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      // Rollback to snapshots
      ctx?.prev?.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['scheduled'] })
    },
  })
}

export function useDeleteJobsByStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (status: string) => jobsApi.deleteByStatus(status),
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: jobKeys.lists() })
      const prev = queryClient.getQueriesData<Job[]>({ queryKey: jobKeys.lists() })
      queryClient.setQueriesData<Job[]>(
        { queryKey: jobKeys.lists() },
        (old) => old?.filter((j) => j.status !== status),
      )
      return { prev }
    },
    onError: (_err, _status, ctx) => {
      ctx?.prev?.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['scheduled'] })
    },
  })
}

export function useDeleteJobsByIds() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (jobIds: string[]) => jobsApi.deleteByIds(jobIds),
    onMutate: async (jobIds) => {
      await queryClient.cancelQueries({ queryKey: jobKeys.lists() })
      const prev = queryClient.getQueriesData<Job[]>({ queryKey: jobKeys.lists() })
      const idSet = new Set(jobIds)
      queryClient.setQueriesData<Job[]>(
        { queryKey: jobKeys.lists() },
        (old) => old?.filter((j) => !idSet.has(j.id)),
      )
      return { prev }
    },
    onError: (_err, _ids, ctx) => {
      ctx?.prev?.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['scheduled'] })
    },
  })
}

export function useCancelJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: jobsApi.cancel,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: jobKeys.detail(id) })
      await queryClient.cancelQueries({ queryKey: jobKeys.lists() })
      const prevDetail = queryClient.getQueryData<Job>(jobKeys.detail(id))
      const prevLists = queryClient.getQueriesData<Job[]>({ queryKey: jobKeys.lists() })
      const patch = { status: 'cancelled' } as Partial<Job>
      optimisticPatchDetail(queryClient, id, patch)
      optimisticPatchInLists(queryClient, id, patch)
      return { prevDetail, prevLists }
    },
    onError: (_err, id, ctx) => {
      if (ctx?.prevDetail) queryClient.setQueryData(jobKeys.detail(id), ctx.prevDetail)
      ctx?.prevLists?.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: (_, __, id) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() })
    },
  })
}

export function useRegenerateJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: jobsApi.regenerate,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: jobKeys.detail(id) })
      await queryClient.cancelQueries({ queryKey: jobKeys.lists() })
      const prevDetail = queryClient.getQueryData<Job>(jobKeys.detail(id))
      const prevLists = queryClient.getQueriesData<Job[]>({ queryKey: jobKeys.lists() })
      const patch = { status: 'generating', progress_percent: 0 } as Partial<Job>
      optimisticPatchDetail(queryClient, id, patch)
      optimisticPatchInLists(queryClient, id, patch)
      return { prevDetail, prevLists }
    },
    onError: (_err, id, ctx) => {
      if (ctx?.prevDetail) queryClient.setQueryData(jobKeys.detail(id), ctx.prevDetail)
      ctx?.prevLists?.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: (_, __, id) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() })
    },
  })
}

export function useRegenerateBrand() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, brand }: { id: string; brand: BrandName }) => 
      jobsApi.regenerateBrand(id, brand),
    onMutate: async ({ id, brand }) => {
      await queryClient.cancelQueries({ queryKey: jobKeys.detail(id) })
      const prevDetail = queryClient.getQueryData<Job>(jobKeys.detail(id))
      if (prevDetail) {
        const updatedOutputs = { ...prevDetail.brand_outputs }
        if (updatedOutputs[brand]) {
          updatedOutputs[brand] = { ...updatedOutputs[brand], status: 'generating' }
        }
        queryClient.setQueryData<Job>(jobKeys.detail(id), {
          ...prevDetail,
          brand_outputs: updatedOutputs,
        })
      }
      return { prevDetail }
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.prevDetail) queryClient.setQueryData(jobKeys.detail(id), ctx.prevDetail)
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) })
    },
  })
}

export function useJobNextSlots(id: string) {
  return useQuery({
    queryKey: jobKeys.nextSlots(id),
    queryFn: () => jobsApi.getNextSlots(id),
    enabled: !!id,
  })
}

export function useUpdateBrandStatus() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, brand, status, scheduledTime }: { 
      id: string
      brand: BrandName
      status: string
      scheduledTime?: string
    }) => jobsApi.updateBrandStatus(id, brand, status, scheduledTime),
    onMutate: async ({ id, brand, status, scheduledTime }) => {
      await queryClient.cancelQueries({ queryKey: jobKeys.detail(id) })
      const prevDetail = queryClient.getQueryData<Job>(jobKeys.detail(id))
      if (prevDetail) {
        const updatedOutputs = { ...prevDetail.brand_outputs }
        if (updatedOutputs[brand]) {
          updatedOutputs[brand] = {
            ...updatedOutputs[brand],
            status: status as BrandStatus,
            ...(scheduledTime ? { scheduled_time: scheduledTime } : {}),
          }
        }
        queryClient.setQueryData<Job>(jobKeys.detail(id), {
          ...prevDetail,
          brand_outputs: updatedOutputs,
        })
      }
      return { prevDetail }
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.prevDetail) queryClient.setQueryData(jobKeys.detail(id), ctx.prevDetail)
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: ['scheduled'] })
    },
  })
}

export function useUpdateBrandContent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, brand, data }: {
      id: string
      brand: BrandName
      data: { title?: string; caption?: string; slide_texts?: string[] }
    }) => jobsApi.updateBrandContent(id, brand, data),
    onMutate: async ({ id, brand, data }) => {
      await queryClient.cancelQueries({ queryKey: jobKeys.detail(id) })
      const prevDetail = queryClient.getQueryData<Job>(jobKeys.detail(id))
      if (prevDetail) {
        const updatedOutputs = { ...prevDetail.brand_outputs }
        if (updatedOutputs[brand]) {
          updatedOutputs[brand] = { ...updatedOutputs[brand], ...data }
        }
        queryClient.setQueryData<Job>(jobKeys.detail(id), {
          ...prevDetail,
          brand_outputs: updatedOutputs,
        })
      }
      return { prevDetail }
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.prevDetail) queryClient.setQueryData(jobKeys.detail(id), ctx.prevDetail)
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) })
    },
  })
}

export function useRegenerateBrandImage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, brand, aiPrompt }: {
      id: string
      brand: BrandName
      aiPrompt?: string
    }) => jobsApi.regenerateBrandImage(id, brand, aiPrompt),
    onMutate: async ({ id, brand }) => {
      await queryClient.cancelQueries({ queryKey: jobKeys.detail(id) })
      const prevDetail = queryClient.getQueryData<Job>(jobKeys.detail(id))
      if (prevDetail) {
        const updatedOutputs = { ...prevDetail.brand_outputs }
        if (updatedOutputs[brand]) {
          updatedOutputs[brand] = { ...updatedOutputs[brand], status: 'generating' }
        }
        queryClient.setQueryData<Job>(jobKeys.detail(id), {
          ...prevDetail,
          brand_outputs: updatedOutputs,
        })
      }
      return { prevDetail }
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.prevDetail) queryClient.setQueryData(jobKeys.detail(id), ctx.prevDetail)
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) })
    },
  })
}

export function useRetryJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: jobsApi.retry,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: jobKeys.detail(id) })
      await queryClient.cancelQueries({ queryKey: jobKeys.lists() })
      const prevDetail = queryClient.getQueryData<Job>(jobKeys.detail(id))
      const prevLists = queryClient.getQueriesData<Job[]>({ queryKey: jobKeys.lists() })
      // Mark job as generating and flip failed brands to generating
      if (prevDetail) {
        const updatedOutputs = { ...prevDetail.brand_outputs }
        for (const brand of Object.keys(updatedOutputs) as BrandName[]) {
          if (updatedOutputs[brand]?.status === 'failed' || updatedOutputs[brand]?.status === 'pending') {
            updatedOutputs[brand] = { ...updatedOutputs[brand], status: 'generating' }
          }
        }
        const patch = { status: 'generating', error_message: undefined, brand_outputs: updatedOutputs } as Partial<Job>
        queryClient.setQueryData<Job>(jobKeys.detail(id), { ...prevDetail, ...patch })
      }
      optimisticPatchInLists(queryClient, id, { status: 'generating' } as Partial<Job>)
      return { prevDetail, prevLists }
    },
    onError: (_err, id, ctx) => {
      if (ctx?.prevDetail) queryClient.setQueryData(jobKeys.detail(id), ctx.prevDetail)
      ctx?.prevLists?.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: (_, __, id) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() })
    },
  })
}
