export type TobyPhase = 'bootstrap' | 'learning' | 'optimizing'

export interface TobyConfig {
  buffer_days: number
  explore_ratio: number
  reel_slots_per_day: number
  post_slots_per_day: number
  daily_budget_cents?: number
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
  stats: TobyStats
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
  user_id: string
  platform: string
  content_type: string
  title: string
  url: string
  engagement_score: number
  discovered_at: string
  metadata: Record<string, unknown>
}
