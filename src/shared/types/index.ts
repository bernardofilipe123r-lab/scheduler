/**
 * Core type definitions for the application
 */

// Brand types — dynamic: any brand ID string from the database
// Known brands kept as a type hint, but accepts any string for new brands
export type BrandName = string

// Status types
export type JobStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'cancelled'
export type BrandStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'scheduled'
export type ScheduleStatus = 'scheduled' | 'publishing' | 'published' | 'partial' | 'failed'

// Variant type
export type Variant = 'light' | 'dark' | 'post'

// Brand output for a single brand in a job
export interface BrandOutput {
  status: BrandStatus
  reel_id?: string
  thumbnail_path?: string
  yt_thumbnail_path?: string  // Clean AI image for YouTube (no text)
  video_path?: string
  caption?: string
  yt_title?: string  // YouTube-optimized title (searchable, clickable, no numbers)
  content_lines?: string[]  // Differentiated content for this brand
  scheduled_time?: string
  error?: string
  progress_message?: string
  progress_percent?: number
  background_data?: string  // base64 data URL for post background
  title?: string            // Per-brand unique title (posts)
  ai_prompt?: string        // Per-brand image prompt (posts)
  slide_texts?: string[]    // Carousel text slide content (posts)
}

// Job entity
export interface Job {
  id: string
  job_id: string
  user_id?: string
  title: string
  content_lines: string[]
  brands: BrandName[]
  platforms?: string[]  // ['instagram', 'facebook', 'youtube']
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
    variant?: string
    video_path?: string
    thumbnail_path?: string
    title?: string
    slide_texts?: string[]
    carousel_image_paths?: string[]
    job_id?: string
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
