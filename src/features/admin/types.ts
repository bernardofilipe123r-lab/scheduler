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

export interface AffectedUserInfo {
  user_id: string
  brands: string
}

export interface ErrorDigestEntry {
  human_summary: string
  error_pattern: string
  category: string
  count: number
  affected_users: string[]
  affected_user_info: AffectedUserInfo[]
  affected_user_count: number
  first_seen: string | null
  last_seen: string | null
  technical_error: string
  http_path: string | null
  http_status: number | null
  priority: 'critical' | 'high' | 'medium' | 'low'
  brands: string[]
}

export interface ErrorDigestResponse {
  hours: number
  current_deployment: boolean
  deployment_id: string
  total_errors: number
  unique_patterns: number
  digest: ErrorDigestEntry[]
}

export interface DeepSeekBalanceInfo {
  currency: string
  total_balance: string
  granted_balance: string
  topped_up_balance: string
}

export interface CreditsResponse {
  deepseek?: {
    available?: boolean
    balance_infos?: DeepSeekBalanceInfo[]
    error?: string
  }
  deapi?: {
    data?: { balance?: number }
    balance_usd?: number
    currency?: string
    credits?: number
    remaining?: number
    balance?: number
    error?: string
    detail?: string
    [key: string]: unknown
  }
  freepik?: {
    configured?: boolean
    daily_limit?: number
    total_budget_eur?: number
    spent_eur?: number
    remaining_eur?: number
    total_calls?: number
    error?: string
  }
  pexels?: {
    configured?: boolean
    monthly_limit?: number
    used_this_month?: number
    remaining?: number
    cost_per_search?: number
    total_cost_usd?: number
    error?: string
  }
  image_source_mode?: string
  thumbnail_image_source_mode?: string
}

export interface ApiUsageEntry {
  label: string
  local_count: number
  limit: number
  period: 'daily' | 'monthly'
  remaining: number
  usage_pct: number
  live?: Record<string, unknown>
}

export interface DbStats {
  database_size_bytes?: number
  database_size_mb?: number
  active_connections?: number
  total_connections?: number
  top_tables?: Array<{ schema: string; table: string; row_count: number }>
  error?: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SupabaseUsageResponse {
  db_stats: DbStats
  usage: Record<string, any> | null
  infrastructure: Record<string, any> | null
  error: string | null
}
/* eslint-enable @typescript-eslint/no-explicit-any */
