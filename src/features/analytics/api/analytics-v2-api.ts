/**
 * Analytics V2 API — types and fetchers for Overview, Posts, Answers, Audience tabs.
 */
import { get, post } from '@/shared/api'

// ── Overview ──

export interface OverviewPeriod {
  days: number
  start: string
  end: string
}

export interface OverviewTotals {
  followers: number
  views: number
  likes: number
}

export interface OverviewChanges {
  followers_pct: number | null
  views_pct: number | null
  likes_pct: number | null
}

export interface DailyPoint {
  date: string
  followers: number
  views: number
  likes: number
}

export interface BrandTotal {
  brand: string
  followers: number
  views: number
  likes: number
}

export interface ChannelRow {
  brand: string
  platform: string
  followers: number
  views: number
  likes: number
  last_fetched_at: string | null
}

export interface OverviewResponse {
  period: OverviewPeriod
  current: OverviewTotals
  previous: OverviewTotals
  changes: OverviewChanges
  daily: DailyPoint[]
  brands: BrandTotal[]
  channels: ChannelRow[]
}

export async function fetchOverview(params: {
  brand?: string
  platform?: string
  days?: number
}): Promise<OverviewResponse> {
  const sp = new URLSearchParams()
  if (params.brand) sp.set('brand', params.brand)
  if (params.platform) sp.set('platform', params.platform)
  if (params.days) sp.set('days', params.days.toString())
  const q = sp.toString()
  return get<OverviewResponse>(`/api/analytics/v2/overview${q ? `?${q}` : ''}`)
}

// ── Posts ──

export interface PostItem {
  id: number
  ig_media_id: string
  brand: string
  platform: string | null
  content_type: string
  title: string | null
  caption: string | null
  topic_bucket: string | null
  views: number
  likes: number
  comments: number
  saves: number
  shares: number
  reach: number
  engagement_rate: number | null
  performance_score: number | null
  percentile_rank: number | null
  published_at: string | null
  metrics_fetched_at: string | null
}

export interface PostsSummary {
  total_posts: number
  total_views: number
  total_likes: number
  total_comments: number
  total_saves: number
  total_shares: number
  total_reach: number
  avg_engagement_rate: number
  avg_performance_score: number
}

export interface PostsResponse {
  summary: PostsSummary
  posts: PostItem[]
  pagination: { limit: number; offset: number; total: number }
}

export async function fetchPosts(params: {
  brand?: string
  content_type?: string
  sort_by?: string
  sort_dir?: string
  days?: number
  limit?: number
  offset?: number
}): Promise<PostsResponse> {
  const sp = new URLSearchParams()
  if (params.brand) sp.set('brand', params.brand)
  if (params.content_type) sp.set('content_type', params.content_type)
  if (params.sort_by) sp.set('sort_by', params.sort_by)
  if (params.sort_dir) sp.set('sort_dir', params.sort_dir)
  if (params.days) sp.set('days', params.days.toString())
  if (params.limit) sp.set('limit', params.limit.toString())
  if (params.offset) sp.set('offset', params.offset.toString())
  const q = sp.toString()
  return get<PostsResponse>(`/api/analytics/v2/posts${q ? `?${q}` : ''}`)
}

// ── Answers ──

export interface DayData {
  day: string
  day_short: string
  avg_engagement_rate: number
  avg_views: number
  post_count: number
}

export interface HourData {
  hour: number
  display: string
  avg_engagement_rate: number
  avg_views: number
  post_count: number
}

export interface TypeData {
  content_type: string
  avg_engagement_rate: number
  avg_views: number
  post_count: number
}

export interface TopicData {
  topic: string
  avg_engagement_rate: number
  avg_views: number
  post_count: number
}

export interface FrequencyData {
  posts_per_day: number
  label: string
  avg_engagement_rate: number
  day_count: number
}

export interface AnswersResponse {
  has_data: boolean
  message?: string
  total_posts_analyzed: number
  best_time?: {
    day: DayData | null
    hour: HourData | null
    summary: string
  }
  best_type?: TypeData | null
  best_frequency?: FrequencyData | null
  by_day?: DayData[]
  by_hour?: HourData[]
  by_type?: TypeData[]
  by_topic?: TopicData[]
  by_frequency?: FrequencyData[]
}

export async function fetchAnswers(params: {
  brand?: string
  days?: number
}): Promise<AnswersResponse> {
  const sp = new URLSearchParams()
  if (params.brand) sp.set('brand', params.brand)
  if (params.days) sp.set('days', params.days.toString())
  const q = sp.toString()
  return get<AnswersResponse>(`/api/analytics/v2/answers${q ? `?${q}` : ''}`)
}

// ── Audience ──

export interface AudienceBrand {
  brand: string
  platform: string
  gender_age: Record<string, number>
  top_cities: Record<string, number>
  top_countries: Record<string, number>
  top_gender: string | null
  top_age_range: string | null
  top_city: string | null
  total_audience: number
  fetched_at: string | null
}

export interface AudienceResponse {
  brands: AudienceBrand[]
  has_data: boolean
}

export async function fetchAudience(params?: {
  brand?: string
}): Promise<AudienceResponse> {
  const sp = new URLSearchParams()
  if (params?.brand) sp.set('brand', params.brand)
  const q = sp.toString()
  return get<AudienceResponse>(`/api/analytics/v2/audience${q ? `?${q}` : ''}`)
}

export async function refreshAudience(brand?: string): Promise<{ updated: string[]; errors: string[] }> {
  const sp = new URLSearchParams()
  if (brand) sp.set('brand', brand)
  const q = sp.toString()
  return post(`/api/analytics/v2/audience/refresh${q ? `?${q}` : ''}`)
}

// ── Cumulative ──

export interface CumulativePoint {
  date: string
  period: string
  followers: number
  views: number
  likes: number
}

export interface CumulativeResponse {
  months: number
  data_points: number
  timeline: CumulativePoint[]
}

export async function fetchCumulative(params?: {
  brand?: string
  platform?: string
  months?: number
}): Promise<CumulativeResponse> {
  const sp = new URLSearchParams()
  if (params?.brand) sp.set('brand', params.brand)
  if (params?.platform) sp.set('platform', params.platform)
  if (params?.months) sp.set('months', params.months.toString())
  const q = sp.toString()
  return get<CumulativeResponse>(`/api/analytics/v2/cumulative${q ? `?${q}` : ''}`)
}

// ── Social Platform Health ──

export interface SocialHealthIssue {
  platform: string
  name: string
  status: string
  detail: string
}

export interface SocialHealthResponse {
  ok: boolean
  issues: SocialHealthIssue[]
}

export async function fetchSocialHealth(): Promise<SocialHealthResponse> {
  return get<SocialHealthResponse>('/api/system/social-health')
}
