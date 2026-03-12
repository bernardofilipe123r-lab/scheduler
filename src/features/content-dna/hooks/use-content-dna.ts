/**
 * Content DNA React Query hooks — list, CRUD, brand assignment.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchDNAProfiles,
  fetchDNAProfile,
  createDNAProfile,
  updateDNAProfile,
  deleteDNAProfile,
  assignBrandToDNA,
  unassignBrandFromDNA,
} from '../api/content-dna-api'
import type { ContentDNACreate, ContentDNAUpdate } from '../types'

export const CONTENT_DNA_KEY = ['content-dna'] as const
const BRANDS_KEY = ['brands'] as const

/** List all DNA profiles for the current user. */
export function useContentDNAProfiles() {
  return useQuery({
    queryKey: [...CONTENT_DNA_KEY],
    queryFn: fetchDNAProfiles,
    staleTime: 5 * 60 * 1000,
  })
}

/** Get a single DNA profile by ID. */
export function useContentDNAProfile(dnaId: string | undefined) {
  return useQuery({
    queryKey: [...CONTENT_DNA_KEY, dnaId],
    queryFn: () => fetchDNAProfile(dnaId!),
    enabled: !!dnaId,
    staleTime: 5 * 60 * 1000,
  })
}

/** Create a new DNA profile. */
export function useCreateContentDNA() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ContentDNACreate) => createDNAProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTENT_DNA_KEY })
    },
  })
}

/** Update an existing DNA profile. */
export function useUpdateContentDNA() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ dnaId, data }: { dnaId: string; data: ContentDNAUpdate }) =>
      updateDNAProfile(dnaId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTENT_DNA_KEY })
    },
  })
}

/** Delete a DNA profile (must have zero brands attached). */
export function useDeleteContentDNA() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dnaId: string) => deleteDNAProfile(dnaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTENT_DNA_KEY })
    },
  })
}

/** Assign a brand to a DNA profile. Invalidates both DNA and brands queries. */
export function useAssignBrandToDNA() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ dnaId, brandId }: { dnaId: string; brandId: string }) =>
      assignBrandToDNA(dnaId, brandId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTENT_DNA_KEY })
      queryClient.invalidateQueries({ queryKey: BRANDS_KEY })
    },
  })
}

/** Unassign a brand from a DNA profile (sets content_dna_id to null). */
export function useUnassignBrandFromDNA() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ dnaId, brandId }: { dnaId: string; brandId: string }) =>
      unassignBrandFromDNA(dnaId, brandId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTENT_DNA_KEY })
      queryClient.invalidateQueries({ queryKey: BRANDS_KEY })
    },
  })
}
