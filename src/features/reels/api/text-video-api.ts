import { get, post, put } from '@/shared/api'
import type {
  DiscoverRequest,
  PolishRequest,
  SourceImagesRequest,
  TextVideoGenerateRequest,
  RawStory,
  PolishedStory,
  DesignSettings,
  StoryPoolEntry,
} from '../types'

const BASE = '/api/content/text-video'

interface DiscoverResponse {
  stories: RawStory[]
}

interface PolishResponse {
  polished: PolishedStory
}

interface SourceImagesResponse {
  image_urls: string[]
}

interface GenerateResponse {
  job_id: string
  status: string
  message: string
  job: {
    job_id: string
    status: string
    brands: string[]
    [key: string]: unknown
  }
}

interface StoryPoolResponse {
  stories: StoryPoolEntry[]
}

interface DesignResponse extends DesignSettings {}

export const textVideoApi = {
  discover: async (data: DiscoverRequest): Promise<RawStory[]> => {
    const res = await post<DiscoverResponse>(`${BASE}/discover`, data)
    return res.stories
  },

  polish: async (data: PolishRequest): Promise<PolishedStory> => {
    const res = await post<PolishResponse>(`${BASE}/polish`, data)
    return res.polished
  },

  sourceImages: async (data: SourceImagesRequest): Promise<string[]> => {
    const res = await post<SourceImagesResponse>(`${BASE}/source-images`, data)
    return res.image_urls
  },

  uploadImages: async (files: File[]): Promise<string[]> => {
    const fd = new FormData()
    files.forEach(f => fd.append('files', f))
    const res = await post<{ paths: string[] }>(`${BASE}/upload-images`, fd)
    return res.paths
  },

  generate: async (data: TextVideoGenerateRequest): Promise<{ job_id: string; status: string }> => {
    const res = await post<GenerateResponse>(`${BASE}/generate`, data)
    return { job_id: res.job_id, status: res.status }
  },

  getStoryPool: async (brandId: string): Promise<StoryPoolEntry[]> => {
    const res = await get<StoryPoolResponse>(`${BASE}/story-pool?brand_id=${encodeURIComponent(brandId)}`)
    return res.stories
  },

  getDesign: async (): Promise<DesignSettings> => {
    return get<DesignResponse>(`${BASE}/design`)
  },

  updateDesign: async (data: Partial<DesignSettings>): Promise<DesignSettings> => {
    return put<DesignResponse>(`${BASE}/design`, data)
  },
}
