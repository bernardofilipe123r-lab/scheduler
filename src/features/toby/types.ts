export type TobyPhase = 'bootstrap' | 'learning' | 'optimizing'

export interface TobyConfig {
  buffer_days: number
  explore_ratio: number
  reel_slots_per_day: number
  post_slots_per_day: number
  reels_enabled: boolean
  posts_enabled: boolean
  daily_budget_cents?: number
}

export interface TobyBrandConfig {
  brand_id: string
  display_name: string
  enabled: boolean
  reel_slots_per_day: number
  post_slots_per_day: number
}

export interface TobyBufferBrand {
  brand_id: string
  display_name: string
  total: number
  filled: number
  reels: number
  posts: number
}

export interface TobyBufferStatus {
  health: 'healthy' | 'low' | 'critical'
  total_slots: number
  filled_slots: number
  fill_percent: number
  empty_slots: Array<{
    brand_id: string
    date: string
    time: string
    content_type: string
  }>
  brand_breakdown: TobyBufferBrand[]
  brand_count: number
  reel_slots_per_day: number
  post_slots_per_day: number
  buffer_days: number
}

export interface TobyLiveAction {
  key: string
  label: string
  description: string
  status: 'due' | 'scheduled' | 'idle'
  minutes_until?: number
}

export interface TobyLiveInfo {
  current_action: TobyLiveAction | null
  next_actions: TobyLiveAction[]
  last_activity: TobyActivityItem | null
}

export interface TobyTimestamps {
  last_buffer_check_at: string | null
  last_metrics_check_at: string | null
  last_analysis_at: string | null
  last_discovery_at: string | null
}

export interface TobyStats {
  total_created: number
  total_scored: number
  total_published: number
}

export interface TobyPhaseRequirements {
  // Bootstrap requirements
  scored_posts_needed?: number
  scored_posts_current?: number
  scored_posts_progress?: number
  min_days?: number
  days_elapsed?: number
  // Learning requirements (v3.0 confidence-gated)
  confidence_target?: number
  confidence_current?: number
  confidence_progress?: number
}

export interface TobyTopStrategy {
  dimension: string
  value: string
  avg_score: number
  sample_count: number
}

export interface TobyPhaseProgress {
  current_phase: TobyPhase
  days_in_phase: number
  uptime_hours: number
  scored_posts: number
  learning_confidence: number
  requirements: TobyPhaseRequirements
  overall_progress: number
  next_phase: TobyPhase | null
  estimated_days_remaining: number
  estimated_posts_remaining?: number
}

export interface TobyRecentTick {
  id: number
  user_id: string
  action_type: string
  description: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface TobyStatus {
  enabled: boolean
  phase: TobyPhase
  phase_started_at: string | null
  enabled_at: string | null
  buffer: TobyBufferStatus | null
  active_experiments: number
  config: TobyConfig
  live: TobyLiveInfo
  timestamps: TobyTimestamps
  intervals?: {
    buffer: number
    metrics: number
    analysis: number
    discovery: number
  }
  stats: TobyStats
  phase_progress: TobyPhaseProgress | null
  recent_ticks: TobyRecentTick[]
  // v3.0 continuous learning fields
  learning_confidence: number
  posts_learned_from: number
  current_top_strategies: TobyTopStrategy[]
}

export interface TobyActivityItem {
  id: number
  user_id: string
  action_type: string
  description: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface TobyExperiment {
  id: number
  user_id: string
  experiment_type: string
  variant_a: string
  variant_b: string
  samples_a: number
  samples_b: number
  mean_score_a: number
  mean_score_b: number
  winner: string | null
  confidence: number
  status: 'active' | 'completed' | 'cancelled'
  started_at: string
  completed_at: string | null
  metadata: Record<string, unknown>
}

export interface TobyInsight {
  dimension: string
  strategy: string
  mean_score: number
  sample_count: number
  confidence_low?: number
  confidence_high?: number
  beta_mean?: number
}

export interface TobyInsights {
  top_strategies: Record<string, TobyInsight[]>
  total_scored_posts: number
}

export interface TobyContentTag {
  id: number
  schedule_id: string
  user_id: string
  personality_id: string
  hook_strategy: string
  topic_bucket: string
  title_format: string
  visual_style: string
  toby_score: number | null
  created_at: string
  schedule?: Record<string, unknown>
}

export interface TobyDiscoveryItem {
  id: number
  ig_media_id: string
  source_account: string | null
  caption: string | null
  media_type: string | null
  like_count: number
  comments_count: number
  discovery_method: string | null
  used_for_proposal: boolean
  discovered_at: string | null
}

export interface TobyDiscoverySource {
  account: string
  method: string
  count: number
  top_likes: number
}

export interface TobyDNASuggestion {
  id: string
  user_id: string
  brand_id: string | null
  recommendation_type: string
  dimension: string | null
  current_value: string | null
  suggested_value: string | null
  evidence: Record<string, unknown>
  confidence: number
  status: string
  created_at: string | null
  resolved_at: string | null
}

export interface TobyDiscoverySummary {
  total: number
  by_method: Record<string, number>
  top_sources: TobyDiscoverySource[]
  recent_highlights: TobyDiscoveryItem[]
  last_scan_at: string | null
}
