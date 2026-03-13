/**
 * Content DNA React Query hooks — list, CRUD, brand assignment.
 * Assign/unassign use optimistic updates so UI moves instantly.
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
  fetchDNATemplates,
  createDNAFromTemplate,
} from '../api/content-dna-api'
import type { ContentDNACreate, ContentDNAUpdate } from '../types'

export const CONTENT_DNA_KEY = ['content-dna'] as const
const BRANDS_KEY = ['brands'] as const
const DNA_TEMPLATES_KEY = ['content-dna-templates'] as const

interface BrandCacheItem {
  id: string
  content_dna_id?: string | null
  [key: string]: unknown
}

/** List all DNA profiles for the current user. */
export function useContentDNAProfiles(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...CONTENT_DNA_KEY],
    queryFn: fetchDNAProfiles,
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled,
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

/** Assign a brand to a DNA profile — optimistic: brand moves instantly in the UI. */
export function useAssignBrandToDNA() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ dnaId, brandId }: { dnaId: string; brandId: string }) =>
      assignBrandToDNA(dnaId, brandId),
    onMutate: async ({ dnaId, brandId }) => {
      await queryClient.cancelQueries({ queryKey: BRANDS_KEY })
      const prev = queryClient.getQueryData<BrandCacheItem[]>(BRANDS_KEY)
      if (prev) {
        queryClient.setQueryData<BrandCacheItem[]>(BRANDS_KEY, prev.map(b =>
          b.id === brandId ? { ...b, content_dna_id: dnaId } : b
        ))
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(BRANDS_KEY, ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONTENT_DNA_KEY })
      queryClient.invalidateQueries({ queryKey: BRANDS_KEY })
    },
  })
}

/** Unassign a brand from a DNA profile — optimistic: brand disappears instantly. */
export function useUnassignBrandFromDNA() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ dnaId, brandId }: { dnaId: string; brandId: string }) =>
      unassignBrandFromDNA(dnaId, brandId),
    onMutate: async ({ brandId }) => {
      await queryClient.cancelQueries({ queryKey: BRANDS_KEY })
      const prev = queryClient.getQueryData<BrandCacheItem[]>(BRANDS_KEY)
      if (prev) {
        queryClient.setQueryData<BrandCacheItem[]>(BRANDS_KEY, prev.map(b =>
          b.id === brandId ? { ...b, content_dna_id: null } : b
        ))
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(BRANDS_KEY, ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONTENT_DNA_KEY })
      queryClient.invalidateQueries({ queryKey: BRANDS_KEY })
    },
  })
}

/** List all active DNA templates (presets). */
export function useContentDNATemplates() {
  return useQuery({
    queryKey: [...DNA_TEMPLATES_KEY],
    queryFn: fetchDNATemplates,
    staleTime: 30 * 60 * 1000, // 30 min — templates rarely change
  })
}

/** Create a DNA profile from a template. */
export function useCreateDNAFromTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) => createDNAFromTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTENT_DNA_KEY })
    },
  })
}
