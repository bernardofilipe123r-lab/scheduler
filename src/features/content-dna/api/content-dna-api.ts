/**
 * Content DNA API client — CRUD + brand assignment.
 */
import { apiClient } from '@/shared/api/client'
import type { ContentDNAProfile, ContentDNACreate, ContentDNAUpdate } from '../types'

// --- Fetch functions ---

export async function fetchDNAProfiles(): Promise<{ profiles: ContentDNAProfile[]; count: number }> {
  return apiClient.get<{ profiles: ContentDNAProfile[]; count: number }>('/api/content-dna')
}

export async function fetchDNAProfile(dnaId: string): Promise<{ profile: ContentDNAProfile }> {
  return apiClient.get<{ profile: ContentDNAProfile }>(`/api/content-dna/${dnaId}`)
}

export async function createDNAProfile(data: ContentDNACreate): Promise<{ profile: ContentDNAProfile }> {
  return apiClient.post<{ profile: ContentDNAProfile }>('/api/content-dna', data)
}

export async function updateDNAProfile(dnaId: string, data: ContentDNAUpdate): Promise<{ profile: ContentDNAProfile }> {
  return apiClient.put<{ profile: ContentDNAProfile }>(`/api/content-dna/${dnaId}`, data)
}

export async function deleteDNAProfile(dnaId: string): Promise<{ deleted: boolean; id: string }> {
  return apiClient.delete<{ deleted: boolean; id: string }>(`/api/content-dna/${dnaId}`)
}

export async function assignBrandToDNA(dnaId: string, brandId: string): Promise<{
  brand_id: string
  brand_name: string
  content_dna_id: string
  content_dna_name: string
}> {
  return apiClient.post(`/api/content-dna/${dnaId}/assign-brand`, { brand_id: brandId })
}

export async function unassignBrandFromDNA(dnaId: string, brandId: string): Promise<{
  brand_id: string
  unassigned: boolean
}> {
  return apiClient.post(`/api/content-dna/${dnaId}/unassign-brand`, { brand_id: brandId })
}
