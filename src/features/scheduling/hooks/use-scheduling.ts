import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { schedulingApi } from '../api'

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
      queryClient.invalidateQueries({ queryKey: schedulingKeys.scheduled() })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

export function useAutoScheduleReel() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: schedulingApi.autoSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulingKeys.scheduled() })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

export function useScheduledPosts() {
  return useQuery({
    queryKey: schedulingKeys.scheduled(),
    queryFn: schedulingApi.getScheduled,
    refetchInterval: 30000,
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

export function useNextSlots() {
  return useQuery({
    queryKey: schedulingKeys.nextSlots(),
    queryFn: schedulingApi.getNextSlots,
    staleTime: 60000,
  })
}
