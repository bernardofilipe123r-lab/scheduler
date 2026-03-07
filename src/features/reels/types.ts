/**
 * Types for TEXT-VIDEO reels feature.
 */

export type ContentFormat = 'text_based' | 'text_video'

export type TextVideoMode = 'manual' | 'semi_auto' | 'full_auto'

export interface ImagePlan {
  source_type: 'web_search' | 'ai_generate'
  query: string
  fallback_query?: string
}

export interface RawStory {
  headline: string
  summary: string
  source_url: string
  source_name: string
  published_at?: string
  relevance_score: number
  category?: string
  fingerprint?: string
}

export interface PolishedStory {
  reel_text: string
  reel_lines: string[]
  thumbnail_title: string
  thumbnail_title_lines: string[]
  images: ImagePlan[]
  thumbnail_image: ImagePlan
  caption: string
  hashtags: string[]
  story_category: string
  story_fingerprint: string
  source_headline: string
  source_url: string
  source_name: string
}

export interface DesignSettings {
  id?: string
  user_id?: string
  // Thumbnail
  thumbnail_image_ratio: number
  thumbnail_title_color: string
  thumbnail_title_font: string
  thumbnail_title_size: number
  thumbnail_title_max_lines: number
  thumbnail_title_padding: number
  thumbnail_logo_size: number
  thumbnail_divider_style: string
  thumbnail_divider_thickness: number
  thumbnail_overlay_opacity: number
  // Reel text
  reel_text_color: string
  reel_text_font: string
  reel_text_size: number
  reel_text_position: string
  reel_text_bg_opacity: number
  reel_text_shadow: boolean
  reel_text_font_bold: boolean
  // Reel frame layout
  reel_section_gap: number
  reel_gap_header_text: number
  reel_gap_text_media: number
  reel_logo_size: number
  reel_header_scale: number
  reel_padding_top: number
  reel_padding_bottom: number
  reel_padding_left: number
  reel_padding_right: number
  reel_image_height: number
  reel_avg_word_count: number
  reel_brand_name_color: string
  reel_brand_name_size: number
  reel_handle_color: string
  reel_handle_size: number
  // Slideshow
  image_duration: number
  image_fade_duration: number
  reel_total_duration: number
  black_fade_duration: number
  show_logo: boolean
  show_handle: boolean
  // Music
  reel_music_enabled: boolean
}

export interface DiscoverRequest {
  niche: string
  category?: string
  recency?: 'recent' | 'trending' | 'mixed'
  count?: number
}

export interface PolishRequest {
  raw_story: RawStory
  niche: string
}

export interface SourceImagesRequest {
  image_plans: ImagePlan[]
}

export interface TextVideoGenerateRequest {
  mode: TextVideoMode
  brands: string[]
  platforms: string[]
  music_source?: string
  // full_auto
  niche?: string
  count?: number
  // semi_auto
  raw_story?: RawStory
  // manual
  reel_text?: string
  reel_lines?: string[]
  thumbnail_title?: string
  image_paths?: string[]
  image_queries?: string[]
  ai_image_prompts?: string[]
}

export interface TextVideoJob {
  job_id: string
  status: string
  brand_outputs: Record<string, {
    status: string
    reel_id?: string
    thumbnail_path?: string
    video_path?: string
    caption?: string
    content_format?: string
    error?: string
    progress_message?: string
    progress_percent?: number
  }>
}

export interface StoryPoolEntry {
  id: string
  headline: string
  summary: string
  source_url: string
  source_name: string
  category: string
  fingerprint: string
  used: boolean
  created_at: string
}
