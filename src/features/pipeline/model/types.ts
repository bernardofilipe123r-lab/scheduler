export type PipelineStatus = 'pending' | 'approved' | 'rejected'

export type ContentVariant = 'light' | 'dark' | 'format_b' | 'post' | 'threads'

export interface PipelineItem {
  job_id: string
  title: string
  caption: string | null
  variant: ContentVariant
  content_format: string
  content_lines: string[]
  brands: string[]
  platforms: string[]
  pipeline_status: PipelineStatus
  pipeline_reviewed_at: string | null
  pipeline_batch_id: string | null
  quality_score: number | null
  created_by: 'user' | 'toby'
  created_at: string
  status: string
  brand_outputs: Record<string, {
    status: string
    thumbnail_path?: string
    video_path?: string
    yt_thumbnail_path?: string
    reel_id?: string
    carousel_paths?: string[]
    caption?: string
  }>
}

export interface PipelineStats {
  pending: number
  approved: number
  rejected: number
  rate: number
}

export interface PipelineFilters {
  status: PipelineStatus | 'all'
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
