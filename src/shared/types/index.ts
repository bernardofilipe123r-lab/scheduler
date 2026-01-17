/**
 * Core type definitions for the application
 */

// Brand types
export type BrandName = 'healthycollege' | 'vitalitycollege' | 'longevitycollege'

// Status types
export type JobStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'cancelled'
export type BrandStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'scheduled'
export type ScheduleStatus = 'scheduled' | 'publishing' | 'published' | 'partial' | 'failed'

// Variant type
export type Variant = 'light' | 'dark'

// Brand output for a single brand in a job
export interface BrandOutput {
  status: BrandStatus
  reel_id?: string
  thumbnail_path?: string
  video_path?: string
  caption?: string
  scheduled_time?: string
  error?: string
}

// Job entity
export interface Job {
  id: string
  job_id: string
  user_id?: string
  title: string
  content_lines: string[]
  brands: BrandName[]
  variant: Variant
  ai_prompt?: string
  cta_type: string
  status: JobStatus
  brand_outputs: Record<BrandName, BrandOutput>
  current_step?: string
  progress_percent?: number
  ai_background_path?: string
  created_at: string
  started_at?: string
  completed_at?: string
  updated_at?: string
  error_message?: string
}

// Scheduled post entity
export interface ScheduledPost {
  id: string
  brand: BrandName
  job_id: string
  reel_id: string
  title: string
  scheduled_time: string
  thumbnail_path?: string
  video_path?: string
  caption?: string
  status: ScheduleStatus
  error?: string
  published_at?: string
  metadata?: {
    platforms?: string[]
    brand?: string
    post_ids?: Record<string, string>
    publish_results?: Record<string, {
      success: boolean
      post_id?: string
      account_id?: string
      brand_used?: string
      error?: string
    }>
  }
}

// Next slot info
export interface NextSlot {
  brand: BrandName
  next_slot: string
  formatted: string
}

// Request types
export interface GenerateReelRequest {
  title: string
  content_lines: string[]
  brands: BrandName[]
  variant: Variant
  ai_prompt?: string
  cta_type: string
}

export interface ScheduleRequest {
  brand: BrandName
  job_id: string
  reel_id: string
  scheduled_time?: string
  auto_schedule?: boolean
}
