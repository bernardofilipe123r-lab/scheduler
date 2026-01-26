import { get, post, del, patch } from '@/shared/api'
import type { BrandName, ScheduledPost, NextSlot } from '@/shared/types'

interface GenerateViralRequest {
  topic: string
  brands?: BrandName[]
}

interface GenerateViralResponse {
  title: string
  content_lines: string[]
}

interface ScheduleReelRequest {
  brand: BrandName
  job_id: string
  reel_id: string
  scheduled_time?: string
}

interface AutoScheduleRequest {
  brand: BrandName
  reel_id: string
  variant: string
  caption?: string
  yt_title?: string  // YouTube-optimized title for Shorts
  user_id?: string
  video_path?: string
  thumbnail_path?: string
  scheduled_time?: string  // Optional custom schedule time (ISO string)
}

interface ScheduledResponse {
  total: number
  schedules: Array<{
    schedule_id: string
    reel_id: string
    scheduled_time: string
    status: string
    platforms: string[]
    brand: string
    variant: string
    caption?: string
    created_at?: string
    published_at?: string
    publish_error?: string
    metadata?: {
      platforms?: string[]
      brand?: string
      video_path?: string
      thumbnail_path?: string
      post_ids?: Record<string, string>
      publish_results?: Record<string, {
        success: boolean
        post_id?: string
        account_id?: string
        brand_used?: string
        error?: string
      }>
    }
  }>
}

// API functions
export const schedulingApi = {
  generateViral: (data: GenerateViralRequest) => 
    post<GenerateViralResponse>('/reels/generate-viral', data),
  
  generateCaptions: (data: { title: string; content_lines: string[]; brands: BrandName[] }) =>
    post<Record<BrandName, string>>('/reels/generate-captions', data),
  
  schedule: (data: ScheduleReelRequest) =>
    post<{ success: boolean; scheduled_time: string }>('/reels/schedule', data),
  
  autoSchedule: (data: AutoScheduleRequest) =>
    post<{ success: boolean; scheduled_for: string }>('/reels/schedule-auto', data),
  
  getScheduled: async (): Promise<ScheduledPost[]> => {
    const response = await get<ScheduledResponse>('/reels/scheduled')
    return response.schedules.map(s => ({
      id: s.schedule_id,
      brand: (s.metadata?.brand || s.brand) as BrandName,
      job_id: s.reel_id,
      reel_id: s.reel_id,
      title: s.caption || 'Scheduled Post',
      scheduled_time: s.scheduled_time,
      caption: s.caption,
      status: s.status as ScheduledPost['status'],
      error: s.publish_error,
      published_at: s.published_at,
      thumbnail_path: s.metadata?.thumbnail_path,
      video_path: s.metadata?.video_path,
      metadata: s.metadata,
    }))
  },
  
  deleteScheduled: (id: string) =>
    del<{ success: boolean }>(`/reels/scheduled/${id}`),
  
  retryFailed: (id: string) =>
    post<{ success: boolean }>(`/reels/scheduled/${id}/retry`),
  
  reschedule: (id: string, scheduledTime: string) =>
    patch<{ success: boolean; scheduled_time: string }>(`/reels/scheduled/${id}/reschedule`, { scheduled_time: scheduledTime }),
  
  publishNow: (id: string) =>
    post<{ success: boolean }>(`/reels/scheduled/${id}/publish-now`),
  
  getNextSlots: () =>
    get<Record<BrandName, NextSlot>>('/reels/next-slots'),
  
  getNextSlotForBrand: (brand: BrandName) =>
    get<NextSlot>(`/reels/next-slot/${brand}`),
}
