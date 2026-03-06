import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { textVideoApi } from './text-video-api'
import type {
  DiscoverRequest,
  PolishRequest,
  SourceImagesRequest,
  TextVideoGenerateRequest,
} from '../types'

export const textVideoKeys = {
  all: ['text-video'] as const,
  storyPool: (brandId: string) => [...textVideoKeys.all, 'story-pool', brandId] as const,
  design: () => [...textVideoKeys.all, 'design'] as const,
}

export function useDiscoverStories() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DiscoverRequest) => textVideoApi.discover(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: textVideoKeys.all }),
  })
}

export function usePolishStory() {
  return useMutation({
    mutationFn: (data: PolishRequest) => textVideoApi.polish(data),
  })
}

export function useSourceImages() {
  return useMutation({
    mutationFn: (data: SourceImagesRequest) => textVideoApi.sourceImages(data),
  })
}

export function useUploadImages() {
  return useMutation({
    mutationFn: (files: File[]) => textVideoApi.uploadImages(files),
  })
}

export function useGenerateTextVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TextVideoGenerateRequest) => textVideoApi.generate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: textVideoKeys.all })
    },
  })
}

export function useStoryPool(brandId: string) {
  return useQuery({
    queryKey: textVideoKeys.storyPool(brandId),
    queryFn: () => textVideoApi.getStoryPool(brandId),
    enabled: !!brandId,
    staleTime: 60_000,
  })
}

export function useDesignSettings() {
  return useQuery({
    queryKey: textVideoKeys.design(),
    queryFn: textVideoApi.getDesign,
    staleTime: 300_000,
  })
}

export function useUpdateDesign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: textVideoApi.updateDesign,
    onSuccess: () => qc.invalidateQueries({ queryKey: textVideoKeys.design() }),
  })
}
