import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatBApi } from './format-b-api'
import type {
  DiscoverRequest,
  PolishRequest,
  SourceImagesRequest,
  FormatBGenerateRequest,
} from '../types'

export const formatBKeys = {
  all: ['format-b'] as const,
  storyPool: (brandId: string) => [...formatBKeys.all, 'story-pool', brandId] as const,
  design: () => [...formatBKeys.all, 'design'] as const,
}

export function useDiscoverStories() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DiscoverRequest) => formatBApi.discover(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: formatBKeys.all }),
  })
}

export function usePolishStory() {
  return useMutation({
    mutationFn: (data: PolishRequest) => formatBApi.polish(data),
  })
}

export function useSourceImages() {
  return useMutation({
    mutationFn: (data: SourceImagesRequest) => formatBApi.sourceImages(data),
  })
}

export function useUploadImages() {
  return useMutation({
    mutationFn: (files: File[]) => formatBApi.uploadImages(files),
  })
}

export function useGenerateFormatB() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: FormatBGenerateRequest) => formatBApi.generate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: formatBKeys.all })
    },
  })
}

export function useStoryPool(brandId: string) {
  return useQuery({
    queryKey: formatBKeys.storyPool(brandId),
    queryFn: () => formatBApi.getStoryPool(brandId),
    enabled: !!brandId,
    staleTime: 60_000,
  })
}

export function useDesignSettings() {
  return useQuery({
    queryKey: formatBKeys.design(),
    queryFn: formatBApi.getDesign,
    staleTime: 300_000,
  })
}

export function useUpdateDesign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: formatBApi.updateDesign,
    onSuccess: () => qc.invalidateQueries({ queryKey: formatBKeys.design() }),
  })
}
