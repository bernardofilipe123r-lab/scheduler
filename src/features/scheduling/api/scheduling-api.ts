import { get, post, del } from '@/shared/api'
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
    error?: string
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
      brand: s.brand as BrandName,
      job_id: s.reel_id,
      reel_id: s.reel_id,
      title: s.caption || 'Scheduled Post',
      scheduled_time: s.scheduled_time,
      caption: s.caption,
      status: s.status as ScheduledPost['status'],
    }))
  },
  
  deleteScheduled: (id: string) =>
    del<{ success: boolean }>(`/reels/scheduled/${id}`),
  
  getNextSlots: () =>
    get<Record<BrandName, NextSlot>>('/reels/next-slots'),
  
  getNextSlotForBrand: (brand: BrandName) =>
    get<NextSlot>(`/reels/next-slot/${brand}`),
}
