import { useQuery, useMutation } from '@tanstack/react-query'
import { threadsApi } from './threads-api'

export function useFormatTypes() {
  return useQuery({
    queryKey: ['threads', 'format-types'],
    queryFn: threadsApi.getFormatTypes,
    staleTime: 5 * 60_000,
  })
}

export function useGenerateSingle() {
  return useMutation({
    mutationFn: threadsApi.generateSingle,
  })
}

export function useGenerateChain() {
  return useMutation({
    mutationFn: threadsApi.generateChain,
  })
}

export function useGenerateBulk() {
  return useMutation({
    mutationFn: threadsApi.generateBulk,
  })
}

export function usePublishSingle() {
  return useMutation({
    mutationFn: threadsApi.publishSingle,
  })
}

export function usePublishChain() {
  return useMutation({
    mutationFn: threadsApi.publishChain,
  })
}

export function useScheduleThread() {
  return useMutation({
    mutationFn: threadsApi.schedule,
  })
}

export function useAutoScheduleThread() {
  return useMutation({
    mutationFn: threadsApi.autoSchedule,
  })
}
