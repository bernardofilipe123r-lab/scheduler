import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { schedulingApi } from '../api'
import { useAdaptivePoll } from '@/shared/hooks/use-adaptive-poll'

// Query keys
export const schedulingKeys = {
  all: ['scheduling'] as const,
  scheduled: () => [...schedulingKeys.all, 'scheduled'] as const,
  nextSlots: () => [...schedulingKeys.all, 'next-slots'] as const,
}

export function useGenerateViral() {
  return useMutation({
    mutationFn: schedulingApi.generateViral,
  })
}

export function useGenerateCaptions() {
  return useMutation({
    mutationFn: schedulingApi.generateCaptions,
  })
}

export function useScheduleReel() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: schedulingApi.schedule,
    onSuccess: () => {
      // Invalidate all scheduling and jobs queries
      queryClient.invalidateQueries({ queryKey: schedulingKeys.all })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

export function useAutoScheduleReel() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: schedulingApi.autoSchedule,
    onSuccess: () => {
      // Invalidate all scheduling and jobs queries
      queryClient.invalidateQueries({ queryKey: schedulingKeys.all })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

export function useScheduledPosts(
  refetchIntervalOverride?: number,
  params?: { from_date?: string; to_date?: string; compact?: boolean },
) {
  const adaptiveInterval = useAdaptivePoll({
    active: 10_000,      // publishing in progress — check often
    idle: 120_000,       // 2 min
    background: 600_000, // tab hidden — 10 min
  })

  return useQuery({
    queryKey: [...schedulingKeys.scheduled(), params],
    queryFn: () => schedulingApi.getScheduled(params),
    refetchInterval: refetchIntervalOverride ?? adaptiveInterval,
    refetchOnMount: 'always',
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  })
}

export function useDeleteScheduled() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: schedulingApi.deleteScheduled,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulingKeys.scheduled() })
    },
  })
}

export function useDeleteScheduledForDay() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (params: { date: string; variant?: 'reel' | 'post' }) => schedulingApi.deleteScheduledForDay(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulingKeys.scheduled() })
    },
  })
}

export function useRetryFailed() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: schedulingApi.retryFailed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulingKeys.all })
    },
  })
}

export function useReschedule() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, scheduledTime }: { id: string; scheduledTime: string }) =>
      schedulingApi.reschedule(id, scheduledTime),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulingKeys.all })
    },
  })
}

export function usePublishNow() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: schedulingApi.publishNow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulingKeys.all })
    },
  })
}

export function useNextSlots() {
  return useQuery({
    queryKey: schedulingKeys.nextSlots(),
    queryFn: schedulingApi.getNextSlots,
    staleTime: 60000,
  })
}
