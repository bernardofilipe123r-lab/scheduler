export type PipelineStatus = 'pending' | 'approved' | 'rejected'

/** Lifecycle stage computed by the backend from job + pipeline status + brand outputs */
export type LifecycleStage = 'pending_review' | 'generating' | 'scheduled' | 'published' | 'rejected' | 'failed'

export type ContentVariant = 'light' | 'dark' | 'format_b' | 'post' | 'threads'

export interface PipelineItem {
  job_id: string
  id?: number
  title: string
  caption: string | null
  variant: ContentVariant
  content_format: string
  content_lines: string[]
  brands: string[]
  platforms: string[]
  pipeline_status: PipelineStatus | null
  pipeline_reviewed_at: string | null
  pipeline_batch_id: string | null
  quality_score: number | null
  created_by: 'user' | 'toby'
  created_at: string
  status: string
  lifecycle: LifecycleStage
  brand_outputs: Record<string, {
    status: string
    thumbnail_path?: string
    video_path?: string
    yt_thumbnail_path?: string
    reel_id?: string
    carousel_paths?: string[]
    caption?: string
  }>
  progress_percent?: number | null
}

export interface PipelineStats {
  pending_review: number
  generating: number
  scheduled: number
  published: number
  rejected: number
  failed: number
  rate: number
  total: number
}

export interface PipelineFilters {
  status: LifecycleStage | 'all'
  brand: string | null
  content_type: 'all' | 'reels' | 'carousels' | 'threads'
  batch_id: string | null
}

export interface PipelineResponse {
  items: PipelineItem[]
  total: number
  page: number
  limit: number
}
