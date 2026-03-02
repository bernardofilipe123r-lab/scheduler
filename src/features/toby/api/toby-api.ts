import { get, post, patch } from '@/shared/api'
import type {
  TobyStatus,
  TobyConfig,
  TobyBrandConfig,
  TobyBufferStatus,
  TobyActivityItem,
  TobyExperiment,
  TobyInsights,
  TobyContentTag,
  TobyDiscoveryItem,
  TobyDiscoverySummary,
  TobyDNASuggestion,
} from '../types'

export const tobyApi = {
  getStatus: () =>
    get<TobyStatus>('/api/toby/status'),

  enable: () =>
    post<{ status: string; phase: string }>('/api/toby/enable'),

  disable: () =>
    post<{ status: string }>('/api/toby/disable'),

  reset: () =>
    post<{ status: string; phase: string }>('/api/toby/reset'),

  getActivity: (params?: { limit?: number; offset?: number; action_type?: string }) => {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    if (params?.action_type) qs.set('action_type', params.action_type)
    const query = qs.toString()
    return get<{ total: number; items: TobyActivityItem[] }>(`/api/toby/activity${query ? `?${query}` : ''}`)
  },

  getPublished: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return get<{ total: number; items: TobyContentTag[] }>(`/api/toby/published${query ? `?${query}` : ''}`)
  },

  getExperiments: (status?: string) => {
    const qs = status ? `?status=${status}` : ''
    return get<{ experiments: TobyExperiment[] }>(`/api/toby/experiments${qs}`)
  },

  getInsights: () =>
    get<TobyInsights>('/api/toby/insights'),

  getDiscovery: (limit?: number) => {
    const qs = limit ? `?limit=${limit}` : ''
    return get<{ items: TobyDiscoveryItem[] }>(`/api/toby/discovery${qs}`)
  },

  getDiscoverySummary: () =>
    get<TobyDiscoverySummary>('/api/toby/discovery/summary'),

  getBuffer: () =>
    get<TobyBufferStatus>('/api/toby/buffer'),

  getConfig: () =>
    get<TobyConfig>('/api/toby/config'),

  updateConfig: (data: Partial<TobyConfig>) =>
    patch<{ status: string; config: TobyConfig }>('/api/toby/config', data),

  getBrandConfigs: () =>
    get<{ brands: TobyBrandConfig[] }>('/api/toby/brand-config'),

  updateBrandConfig: (brandId: string, data: Partial<Omit<TobyBrandConfig, 'brand_id' | 'display_name'>>) =>
    patch<{ status: string; brand_config: TobyBrandConfig }>(`/api/toby/brand-config/${encodeURIComponent(brandId)}`, data),

  getDNASuggestions: () =>
    get<{ suggestions: TobyDNASuggestion[]; count: number }>('/api/toby/content-dna-suggestions'),

  resolveDNASuggestion: (id: string, action: 'accepted' | 'dismissed') =>
    post<{ status: string }>(`/api/toby/content-dna-suggestions/${encodeURIComponent(id)}`, { action }),
}
