// Shared types for the Admin user-detail area

export interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  is_admin: boolean
  is_super_admin: boolean
  is_blocked: boolean
  created_at: string | null
  last_sign_in_at: string | null
}

export interface Brand {
  id: string
  display_name: string
  short_name: string
  active: boolean
  instagram_handle: string | null
  facebook_page_name: string | null
  youtube_channel_name: string | null
  posts_per_day: number | null
  schedule_offset: number | null
  baseline_for_content: boolean
  colors: {
    primary?: string
    accent?: string
    text?: string
    color_name?: string
  }
  has_instagram: boolean
  has_facebook: boolean
  instagram_business_account_id: string | null
  facebook_page_id: string | null
  logo_path: string | null
  created_at: string | null
  updated_at: string | null
}

export interface NicheConfig {
  id: string
  niche_name: string
  niche_description: string
  content_brief: string
  target_audience: string
  audience_description: string
  content_tone: string[]
  tone_avoid: string[]
  topic_categories: string[]
  topic_keywords: string[]
  topic_avoid: string[]
  content_philosophy: string
  hook_themes: string[]
  brand_personality: string | null
  brand_focus_areas: string[]
  parent_brand_name: string
  competitor_accounts: string[]
  discovery_hashtags: string[]
  cta_options: string[]
  hashtags: string[]
  carousel_cta_options: string[]
  carousel_cta_topic: string
  image_style_description: string
  image_palette_keywords: string[]
  citation_style: string
  citation_source_types: string[]
  carousel_cover_overlay_opacity: number
  carousel_content_overlay_opacity: number
  follow_section_text: string
  save_section_text: string
  disclaimer_text: string
  created_at: string | null
  updated_at: string | null
}

export interface LogEntry {
  id: number
  timestamp: string
  level: string
  category: string
  source: string | null
  message: string
  details: Record<string, unknown> | null
  request_id: string | null
  deployment_id: string | null
  duration_ms: number | null
  http_method: string | null
  http_path: string | null
  http_status: number | null
}

export interface LogsResponse {
  logs: LogEntry[]
  total: number
  page: number
  page_size: number
  total_pages: number
}
