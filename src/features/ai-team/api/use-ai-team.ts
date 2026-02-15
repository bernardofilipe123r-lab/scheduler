/**
 * AI Team API hooks for agent statuses, quotas, patterns, competitors, and learning cycles.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

export interface AgentStatus {
  agent_id: string
  display_name: string
  current_status: 'idle' | 'analyzing' | 'scraping' | 'generating' | 'working'
  learning_progress: { current: number; total: number } | null
  api_calls_this_hour: number
  last_activity: {
    action: string
    timestamp: string | null
    duration_seconds: number | null
  } | null
  survival_score: number
  generation: number
}

export interface QuotaService {
  used: number
  limit: number
  remaining: number
  reset_at?: string
  agent_breakdown?: Record<string, number>
  operation_breakdown?: Record<string, number>
  balance?: number
  account_type?: string
  rpm_limit?: number
  rpd_limit?: number | null
  currency?: string
  period?: string
  error?: string
  percentage?: number
  // DeepSeek-specific fields
  requests_used?: number
  requests_limit?: number
  tokens_used?: number
  tokens_limit?: number
}

export interface QuotaData {
  meta: QuotaService
  deapi: QuotaService
  deepseek: QuotaService
  history: Array<{
    hour: string
    service: string
    calls_made: number
    quota_limit: number
    agent_breakdown: Record<string, number>
    operation_breakdown: Record<string, number>
  }>
}

export interface LearnedPatternData {
  id: number
  pattern_type: string
  pattern_data: Record<string, unknown>
  confidence_score: number
  views_avg: number
  sample_size: number
  decay_weight: number
  learned_from_brands: string[]
  last_validated_at: string | null
  validation_count: number
}

export interface CompetitorData {
  id: number
  instagram_handle: string
  brand_id: string | null
  account_type: string
  priority: number
  active: boolean
  last_scraped_at: string | null
  posts_scraped_count: number
  avg_views: number
  notes: string | null
  created_at: string | null
}

export interface LearningCycleData {
  id: number
  agent_id: string
  cycle_type: string
  status: 'running' | 'completed' | 'failed'
  started_at: string | null
  completed_at: string | null
  duration_seconds: number | null
  api_calls_used: number
  items_processed: number
  patterns_discovered: number
  error_message: string | null
}

// ═══════════════════════════════════════════════════
// Query keys
// ═══════════════════════════════════════════════════

export const aiTeamKeys = {
  all: ['ai-team'] as const,
  agentStatuses: () => [...aiTeamKeys.all, 'agent-statuses'] as const,
  quotas: () => [...aiTeamKeys.all, 'quotas'] as const,
  patterns: (patternType?: string) => [...aiTeamKeys.all, 'patterns', patternType] as const,
  competitors: () => [...aiTeamKeys.all, 'competitors'] as const,
  learningCycles: (agentId?: string) => [...aiTeamKeys.all, 'learning-cycles', agentId] as const,
}

// ═══════════════════════════════════════════════════
// API functions
// ═══════════════════════════════════════════════════

async function fetchAgentStatuses(): Promise<AgentStatus[]> {
  return apiClient.get<AgentStatus[]>('/api/ai-team/agents/status')
}

async function fetchQuotas(): Promise<QuotaData> {
  return apiClient.get<QuotaData>('/api/ai-team/quotas')
}

async function fetchLearnedPatterns(patternType?: string): Promise<LearnedPatternData[]> {
  const params = new URLSearchParams()
  if (patternType) params.set('pattern_type', patternType)
  const qs = params.toString()
  return apiClient.get<LearnedPatternData[]>(`/api/ai-team/patterns${qs ? `?${qs}` : ''}`)
}

async function fetchCompetitors(): Promise<CompetitorData[]> {
  return apiClient.get<CompetitorData[]>('/api/ai-team/competitors')
}

async function addCompetitor(data: { instagram_handle: string; brand_id?: string; notes?: string }): Promise<CompetitorData> {
  return apiClient.post<CompetitorData>('/api/ai-team/competitors', data)
}

async function removeCompetitor(id: number): Promise<void> {
  await apiClient.delete(`/api/ai-team/competitors/${id}`)
}

async function fetchLearningCycles(agentId?: string): Promise<LearningCycleData[]> {
  const params = new URLSearchParams()
  if (agentId) params.set('agent_id', agentId)
  const qs = params.toString()
  return apiClient.get<LearningCycleData[]>(`/api/ai-team/learning-cycles${qs ? `?${qs}` : ''}`)
}

// ═══════════════════════════════════════════════════
// Hooks
// ═══════════════════════════════════════════════════

export function useAgentStatuses(enabled = true) {
  return useQuery({
    queryKey: aiTeamKeys.agentStatuses(),
    queryFn: fetchAgentStatuses,
    refetchInterval: enabled ? 15000 : false,
    enabled,
  })
}

export function useQuotas(enabled = true) {
  return useQuery({
    queryKey: aiTeamKeys.quotas(),
    queryFn: fetchQuotas,
    refetchInterval: enabled ? 30000 : false,
    enabled,
  })
}

export function useLearnedPatterns(patternType?: string) {
  return useQuery({
    queryKey: aiTeamKeys.patterns(patternType),
    queryFn: () => fetchLearnedPatterns(patternType),
  })
}

export function useCompetitors() {
  return useQuery({
    queryKey: aiTeamKeys.competitors(),
    queryFn: fetchCompetitors,
  })
}

export function useAddCompetitor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: addCompetitor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiTeamKeys.competitors() })
    },
  })
}

export function useRemoveCompetitor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: removeCompetitor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiTeamKeys.competitors() })
    },
  })
}

export function useLearningCycles(agentId?: string) {
  return useQuery({
    queryKey: aiTeamKeys.learningCycles(agentId),
    queryFn: () => fetchLearningCycles(agentId),
  })
}
