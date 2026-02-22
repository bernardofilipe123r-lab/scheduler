import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tobyApi } from '../api'
import type { TobyConfig } from '../types'

export const tobyKeys = {
  all: ['toby'] as const,
  status: () => [...tobyKeys.all, 'status'] as const,
  activity: (filters?: Record<string, unknown>) => [...tobyKeys.all, 'activity', filters] as const,
  published: (page?: number) => [...tobyKeys.all, 'published', page] as const,
  experiments: (status?: string) => [...tobyKeys.all, 'experiments', status] as const,
  insights: () => [...tobyKeys.all, 'insights'] as const,
  discovery: () => [...tobyKeys.all, 'discovery'] as const,
  buffer: () => [...tobyKeys.all, 'buffer'] as const,
  config: () => [...tobyKeys.all, 'config'] as const,
}

export function useTobyStatus() {
  return useQuery({
    queryKey: tobyKeys.status(),
    queryFn: tobyApi.getStatus,
    refetchInterval: 15_000,
    staleTime: 5_000,
  })
}

export function useTobyEnable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tobyApi.enable,
    onSuccess: () => qc.invalidateQueries({ queryKey: tobyKeys.all }),
  })
}

export function useTobyDisable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tobyApi.disable,
    onSuccess: () => qc.invalidateQueries({ queryKey: tobyKeys.all }),
  })
}

export function useTobyReset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tobyApi.reset,
    onSuccess: () => qc.invalidateQueries({ queryKey: tobyKeys.all }),
  })
}

export function useTobyActivity(params?: { limit?: number; offset?: number; action_type?: string }) {
  return useQuery({
    queryKey: tobyKeys.activity(params as Record<string, unknown>),
    queryFn: () => tobyApi.getActivity(params),
    staleTime: 15_000,
  })
}

export function useTobyPublished(page = 0) {
  return useQuery({
    queryKey: tobyKeys.published(page),
    queryFn: () => tobyApi.getPublished({ limit: 20, offset: page * 20 }),
    staleTime: 30_000,
  })
}

export function useTobyExperiments(status?: string) {
  return useQuery({
    queryKey: tobyKeys.experiments(status),
    queryFn: () => tobyApi.getExperiments(status),
    staleTime: 30_000,
  })
}

export function useTobyInsights() {
  return useQuery({
    queryKey: tobyKeys.insights(),
    queryFn: tobyApi.getInsights,
    staleTime: 60_000,
  })
}

export function useTobyDiscovery() {
  return useQuery({
    queryKey: tobyKeys.discovery(),
    queryFn: () => tobyApi.getDiscovery(),
    staleTime: 60_000,
  })
}

export function useTobyBuffer() {
  return useQuery({
    queryKey: tobyKeys.buffer(),
    queryFn: tobyApi.getBuffer,
    staleTime: 15_000,
  })
}

export function useTobyConfig() {
  return useQuery({
    queryKey: tobyKeys.config(),
    queryFn: tobyApi.getConfig,
    staleTime: 60_000,
  })
}

export function useUpdateTobyConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<TobyConfig>) => tobyApi.updateConfig(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tobyKeys.config() })
      qc.invalidateQueries({ queryKey: tobyKeys.status() })
    },
  })
}
