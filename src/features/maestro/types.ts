export interface Proposal {
  id: number
  proposal_id: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  agent_name: string
  content_type: string
  brand: string | null
  variant: string | null
  strategy: string
  reasoning: string
  title: string
  content_lines: string[] | null
  slide_texts: string[] | null
  image_prompt: string | null
  caption: string | null
  topic_bucket: string | null
  source_type: string | null
  source_title: string | null
  source_performance_score: number | null
  source_account: string | null
  quality_score: number | null
  reviewed_at: string | null
  reviewer_notes: string | null
  accepted_job_id: string | null
  created_at: string
}

export interface ProposalListResponse {
  count: number
  proposals: Proposal[]
}

export interface AgentStats {
  total: number
  pending: number
  accepted: number
  rejected: number
  today: number
  acceptance_rate: number
}

export interface ProposalStats {
  total: number
  pending: number
  accepted: number
  rejected: number
  agents: Record<string, AgentStats>
}

export interface AgentState {
  name: string
  proposals_today: number
  total_proposals: number
  last_thought: string | null
  last_thought_at: string | null
  errors: number
}

export interface ActivityEntry {
  time: string
  agent: string
  action: string
  detail: string
  emoji: string
  level?: 'action' | 'detail' | 'api' | 'data'
}

export interface MaestroStatus {
  is_running: boolean
  is_paused: boolean
  posts_paused?: boolean
  started_at: string | null
  uptime_seconds: number
  uptime_human: string
  current_agent: string | null
  current_phase: string | null
  last_daily_run: string | null
  last_daily_run_human: string
  total_cycles: number
  total_proposals_generated: number
  total_jobs_dispatched: number
  total_metrics_collected: number
  total_trends_found: number
  errors: number
  agents: Record<string, AgentState>
  recent_activity: ActivityEntry[]
  proposal_stats: ProposalStats
  daily_config?: {
    proposals_per_brand_per_agent?: number
    total_proposals: number
    total_reels?: number
    total_posts?: number
    today_reels?: number
    today_posts?: number
    reels_per_brand?: number
    posts_per_brand?: number
    posts_paused?: boolean
    variants?: string[]
    brands?: string[]
    agents?: { id: string; name: string; variant: string; proposals_per_brand: number }[]
    total_agents?: number
    total_brands?: number
    jobs_per_day: number
  }
}

export interface PerformanceSummary {
  total_tracked: number
  avg_views: number
  avg_engagement_rate: number
  avg_performance_score: number
  top_topic: string | null
}

export interface Performer {
  title: string
  brand: string
  performance_score: number
  views: number
  engagement_rate: number
  topic_bucket: string | null
}

export interface InsightsResponse {
  summary: PerformanceSummary
  top_performers: Performer[]
  underperformers: Performer[]
  error?: string
}

export interface TrendingItem {
  ig_media_id: string
  source_account: string | null
  caption: string | null
  like_count: number
  comments_count: number
  discovery_method: string
  media_type: string | null
  discovered_at: string
}
