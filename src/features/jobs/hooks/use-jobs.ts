import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { jobsApi } from '../api'
import type { Job, BrandName } from '@/shared/types'

// Query keys for caching
export const jobKeys = {
  all: ['jobs'] as const,
  lists: () => [...jobKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...jobKeys.lists(), filters] as const,
  details: () => [...jobKeys.all, 'detail'] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
  nextSlots: (id: string) => [...jobKeys.detail(id), 'next-slots'] as const,
}

export function useJobs() {
  return useQuery({
    queryKey: jobKeys.lists(),
    queryFn: jobsApi.list,
    refetchInterval: 10000,
    refetchOnMount: 'always', // Always refetch when component mounts
    staleTime: 0, // Data is always considered stale
  })
}

export function useJob(id: string) {
  return useQuery({
    queryKey: jobKeys.detail(id),
    queryFn: () => jobsApi.get(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const job = query.state.data
      if (job?.status === 'generating' || job?.status === 'pending') {
        return 3000
      }
      return 30000
    },
  })
}

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() })
    },
  })
}

export function useDeleteJobsByStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (status: string) => jobsApi.deleteByStatus(status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['scheduled'] })
    },
  })
}

export function useDeleteJobsByIds() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (jobIds: string[]) => jobsApi.deleteByIds(jobIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['scheduled'] })
    },
  })
}

export function useCancelJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: jobsApi.cancel,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() })
    },
  })
}

export function useRegenerateJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: jobsApi.regenerate,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) })
    },
  })
}

export function useRegenerateBrand() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, brand }: { id: string; brand: BrandName }) => 
      jobsApi.regenerateBrand(id, brand),
    onSuccess: (_, { id }) => {
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
    onSuccess: (_, { id }) => {
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
    onSuccess: (_, { id }) => {
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
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(id) })
    },
  })
}
