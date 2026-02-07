import { get, post, put, del } from '@/shared/api'
import type { Job, BrandName } from '@/shared/types'

// Response types from the backend
interface BackendJob {
  job_id: string
  user_id?: string
  title: string
  content_lines: string[]
  brands: BrandName[]
  variant: 'light' | 'dark' | 'post'
  ai_prompt?: string
  cta_type: string
  status: string
  brand_outputs: Record<string, unknown>
  current_step?: string
  progress_percent?: number
  ai_background_path?: string
  created_at: string
  started_at?: string
  completed_at?: string
  error_message?: string
}

interface JobsListResponse {
  jobs: BackendJob[]
  total: number
}

interface JobCreateResponse {
  status: string
  job_id: string
  message: string
  job: BackendJob
}

// Transform backend job to frontend format
function transformJob(backendJob: BackendJob): Job {
  return {
    ...backendJob,
    id: backendJob.job_id,
  } as Job
}

// Job create request
export interface JobCreateRequest {
  title: string
  content_lines?: string[]
  brands: BrandName[]
  variant: 'light' | 'dark' | 'post'
  ai_prompt?: string
  cta_type?: string
  platforms?: string[]  // ['instagram', 'facebook', 'youtube']
}

// API functions
export const jobsApi = {
  list: async (): Promise<Job[]> => {
    const response = await get<JobsListResponse>('/jobs/')
    return response.jobs.map(transformJob)
  },
  
  get: async (id: string): Promise<Job> => {
    const job = await get<BackendJob>(`/jobs/${id}`)
    return transformJob(job)
  },
  
  create: async (data: JobCreateRequest): Promise<Job> => {
    const response = await post<JobCreateResponse>('/jobs/create', data)
    return transformJob(response.job)
  },
  
  update: async (id: string, data: Partial<Job>): Promise<Job> => {
    const job = await put<BackendJob>(`/jobs/${id}`, data)
    return transformJob(job)
  },
  
  delete: (id: string) => del<{ success: boolean }>(`/jobs/${id}`),
  
  cancel: async (id: string): Promise<Job> => {
    const job = await post<BackendJob>(`/jobs/${id}/cancel`)
    return transformJob(job)
  },
  
  regenerate: async (id: string): Promise<Job> => {
    const job = await post<BackendJob>(`/jobs/${id}/regenerate`)
    return transformJob(job)
  },
  
  regenerateBrand: async (id: string, brand: BrandName): Promise<Job> => {
    const job = await post<BackendJob>(`/jobs/${id}/regenerate/${brand}`)
    return transformJob(job)
  },
  
  getNextSlots: (id: string) => 
    get<Record<BrandName, { next_slot: string; formatted: string }>>(`/jobs/${id}/next-slots`),
  
  updateBrandStatus: async (id: string, brand: BrandName, status: string, scheduledTime?: string): Promise<Job> => {
    const job = await post<BackendJob>(`/jobs/${id}/brand/${brand}/status`, { 
      status, 
      scheduled_time: scheduledTime 
    })
    return transformJob(job)
  },
}
