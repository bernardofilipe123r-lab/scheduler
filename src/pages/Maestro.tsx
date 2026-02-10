/**
 * Maestro — AI Content Orchestrator
 *
 * Maestro manages two AI agents:
 *   - Toby (Explorer) — creative risk-taker, finds novel content
 *   - Lexi (Optimizer) — data-driven, optimises proven patterns
 *
 * Always running. No pause/resume. Auto-starts every deployment.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Bot,
  Play,
  Pause,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  Eye,
  Heart,
  BarChart3,
  Lightbulb,
  Repeat2,
  Flame,
  Clock,
  AlertCircle,
  MessageSquare,
  Info,
  Filter,
  Activity,
  Brain,
  Zap,
  Shield,
  Music,
  Target,
  FlaskConical,
  LineChart,
  Sun,
  Moon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { get, post } from '@/shared/api/client'

// ─── Types ───────────────────────────────────────────────────

interface Proposal {
  id: number
  proposal_id: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  agent_name: string
  content_type: string
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

interface ProposalListResponse {
  count: number
  proposals: Proposal[]
}

interface AgentStats {
  total: number
  pending: number
  accepted: number
  rejected: number
  today: number
  acceptance_rate: number
}

interface ProposalStats {
  total: number
  pending: number
  accepted: number
  rejected: number
  agents: Record<string, AgentStats>
}

interface AgentState {
  name: string
  proposals_today: number
  total_proposals: number
  last_thought: string | null
  last_thought_at: string | null
  errors: number
}

interface ActivityEntry {
  time: string
  agent: string
  action: string
  detail: string
  emoji: string
  level?: 'action' | 'detail' | 'api' | 'data'
}

interface MaestroStatus {
  is_running: boolean
  is_paused: boolean
  started_at: string | null
  uptime_seconds: number
  uptime_human: string
  current_agent: string | null
  current_phase: string | null
  last_daily_run: string | null
  last_daily_run_human: string
  total_cycles: number
  total_proposals_generated: number
  total_metrics_collected: number
  total_trends_found: number
  errors: number
  agents: Record<string, AgentState>
  recent_activity: ActivityEntry[]
  proposal_stats: ProposalStats
  daily_config?: {
    proposals_per_agent: number
    total_reels_per_day: number
    variants: string[]
    brands: string[]
    jobs_per_day: number
  }
}

interface PerformanceSummary {
  total_tracked: number
  avg_views: number
  avg_engagement_rate: number
  avg_performance_score: number
  top_topic: string | null
}

interface Performer {
  title: string
  brand: string
  performance_score: number
  views: number
  engagement_rate: number
  topic_bucket: string | null
}

interface InsightsResponse {
  summary: PerformanceSummary
  top_performers: Performer[]
  underperformers: Performer[]
  error?: string
}

interface TrendingItem {
  ig_media_id: string
  source_account: string | null
  caption: string | null
  like_count: number
  comments_count: number
  discovery_method: string
  media_type: string | null
  discovered_at: string
}

// ─── Strategy config (Toby + Lexi) ──────────────────────────

const STRATEGY_META: Record<string, { label: string; icon: typeof Lightbulb; color: string; bg: string; desc: string }> = {
  // Toby strategies
  explore: {
    label: 'Explore',
    icon: Lightbulb,
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
    desc: 'New topic or unique angle',
  },
  iterate: {
    label: 'Iterate',
    icon: Repeat2,
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-200',
    desc: 'Better version of underperformer',
  },
  double_down: {
    label: 'Double Down',
    icon: TrendingUp,
    color: 'text-green-600',
    bg: 'bg-green-50 border-green-200',
    desc: 'Variation of top performer',
  },
  trending: {
    label: 'Trending',
    icon: Flame,
    color: 'text-red-500',
    bg: 'bg-red-50 border-red-200',
    desc: 'Adapted from external viral content',
  },
  // Lexi strategies
  analyze: {
    label: 'Analyze',
    icon: LineChart,
    color: 'text-violet-600',
    bg: 'bg-violet-50 border-violet-200',
    desc: 'Pattern-matched from top performers',
  },
  refine: {
    label: 'Refine',
    icon: Target,
    color: 'text-cyan-600',
    bg: 'bg-cyan-50 border-cyan-200',
    desc: 'A/B test improving one variable',
  },
  systematic: {
    label: 'Systematic',
    icon: FlaskConical,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50 border-indigo-200',
    desc: 'Structured content experiment',
  },
  compound: {
    label: 'Compound',
    icon: TrendingUp,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 border-emerald-200',
    desc: 'Extending a winning series',
  },
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-600',
}

const AGENT_META: Record<string, { label: string; color: string; bg: string; icon: typeof Brain; gradient: string; role: string }> = {
  toby: {
    label: 'Toby',
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-300',
    icon: Brain,
    gradient: 'from-amber-500 to-orange-500',
    role: 'Explorer',
  },
  lexi: {
    label: 'Lexi',
    color: 'text-violet-600',
    bg: 'bg-violet-50 border-violet-300',
    icon: LineChart,
    gradient: 'from-violet-500 to-purple-500',
    role: 'Optimizer',
  },
}

// ─── Helpers ─────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}


// ═══════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export function MaestroPage() {

  // ── State ──
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [maestroStatus, setMaestroStatus] = useState<MaestroStatus | null>(null)
  const [insights, setInsights] = useState<InsightsResponse | null>(null)
  const [trending, setTrending] = useState<TrendingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [activeTab, setActiveTab] = useState<'proposals' | 'activity' | 'insights' | 'trending'>('proposals')

  // ── Data fetching ──
  const fetchProposals = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (agentFilter !== 'all') params.set('agent', agentFilter)
      const qs = params.toString()
      const data = await get<ProposalListResponse>(`/api/maestro/proposals${qs ? `?${qs}` : ''}`)
      setProposals(data.proposals || [])
    } catch (e) {
      console.error('Failed to fetch proposals:', e)
    }
  }, [statusFilter, agentFilter])

  const fetchStatus = useCallback(async () => {
    try {
      const data = await get<MaestroStatus>('/api/maestro/status')
      setMaestroStatus(data)
    } catch (e) {
      console.error('Failed to fetch Maestro status:', e)
    }
  }, [])

  const fetchInsights = useCallback(async () => {
    try {
      const data = await get<InsightsResponse>('/api/maestro/insights')
      if (!data.error) setInsights(data)
    } catch (e) {
      console.error('Failed to fetch insights:', e)
    }
  }, [])

  const fetchTrending = useCallback(async () => {
    try {
      const data = await get<{ count: number; trending: TrendingItem[] }>('/api/maestro/trending')
      setTrending(data.trending || [])
    } catch (e) {
      console.error('Failed to fetch trending:', e)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchProposals(), fetchStatus(), fetchInsights(), fetchTrending()])
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh status every 30s
  useEffect(() => {
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // Refetch proposals on filter change
  useEffect(() => {
    fetchProposals()
  }, [fetchProposals])

  // ── Actions ──
  const handleAccept = async (proposalId: string) => {
    setAcceptingId(proposalId)
    try {
      const result = await post<any>(`/api/maestro/proposals/${proposalId}/accept`)
      if (result.status === 'accepted' && result.job_id) {
        const variants = result.variants?.join(' + ') || 'dark + light'
        toast.success(
          `${result.job_ids?.length || 1} jobs created (${variants}) — generating for ${result.brands?.length || 5} brands`,
          { duration: 5000 }
        )
        await Promise.all([fetchProposals(), fetchStatus()])
      } else if (result.error) {
        toast.error(result.error)
      } else {
        toast.error('Accept failed — no job created')
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to accept')
    } finally {
      setAcceptingId(null)
    }
  }

  const handleAcceptAll = async () => {
    const pending = proposals.filter((p) => p.status === 'pending')
    if (pending.length === 0) {
      toast('No pending proposals to accept')
      return
    }
    setAcceptingId('__all__')
    let accepted = 0
    let failed = 0
    for (const p of pending) {
      try {
        const result = await post<any>(`/api/maestro/proposals/${p.proposal_id}/accept`)
        if (result.status === 'accepted') {
          accepted++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }
    toast.success(`Accepted ${accepted} proposals${failed > 0 ? ` (${failed} failed)` : ''} — jobs creating for all brands`, { duration: 6000 })
    await Promise.all([fetchProposals(), fetchStatus()])
    setAcceptingId(null)
  }

  const handleReject = async (proposalId: string) => {
    setRejectingId(proposalId)
    try {
      const result = await post<any>(`/api/maestro/proposals/${proposalId}/reject`, {
        notes: rejectNotes || undefined,
      })
      if (result.status === 'rejected') {
        toast.success('Proposal rejected')
        setShowRejectInput(null)
        setRejectNotes('')
        await Promise.all([fetchProposals(), fetchStatus()])
      } else {
        toast.error(result.error || 'Reject failed')
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to reject')
    } finally {
      setRejectingId(null)
    }
  }

  const handleOptimizeNow = async () => {
    setOptimizing(true)
    try {
      const result = await post<any>('/api/maestro/optimize-now')
      if (result.status === 'started') {
        toast.success('⚡ Optimize Now triggered — Toby (10) + Lexi (10) generating...', { duration: 6000 })
        // Poll for new proposals every 15s while they generate
        const poll = setInterval(async () => {
          await Promise.all([fetchProposals(), fetchStatus()])
        }, 15000)
        // Stop polling after 5 minutes
        setTimeout(() => {
          clearInterval(poll)
          setOptimizing(false)
          fetchProposals()
          fetchStatus()
        }, 300000)
      } else {
        toast.error(result.error || 'Failed to start')
        setOptimizing(false)
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to trigger Optimize Now')
      setOptimizing(false)
    }
  }

  const stats = maestroStatus?.proposal_stats ?? null
  const agents = maestroStatus?.agents ?? {}
  const isPaused = maestroStatus?.is_paused ?? true

  const handleTogglePause = async () => {
    setToggling(true)
    try {
      const endpoint = isPaused ? '/api/maestro/resume' : '/api/maestro/pause'
      const result = await post<any>(endpoint)
      if (result.status === 'resumed' || result.status === 'paused' || result.status === 'already_running' || result.status === 'already_paused') {
        toast.success(
          isPaused
            ? `Maestro resumed${result.burst_triggered ? ' — daily burst triggered!' : ''}`
            : 'Maestro paused — no more daily bursts until resumed',
          { duration: 5000 }
        )
        await fetchStatus()
      } else {
        toast.error(result.error || 'Toggle failed')
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to toggle Maestro')
    } finally {
      setToggling(false)
    }
  }

  const handleTriggerBurst = async () => {
    try {
      const result = await post<any>('/api/maestro/trigger-burst')
      if (result.status === 'triggered') {
        toast.success('Daily burst triggered — 6 reels (dark + light) generating for all brands', { duration: 6000 })
        // Poll for updates
        const poll = setInterval(async () => {
          await Promise.all([fetchProposals(), fetchStatus()])
        }, 15000)
        setTimeout(() => {
          clearInterval(poll)
          fetchProposals()
          fetchStatus()
        }, 300000)
      } else {
        toast.error(result.error || 'Failed to trigger burst')
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to trigger burst')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ══════════════════════════════════════════════════════════ */}
      {/*  MAESTRO STATUS HEADER                                   */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className={`${isPaused ? 'bg-gradient-to-r from-gray-600 via-gray-500 to-gray-600' : 'bg-gradient-to-r from-amber-600 via-orange-500 to-rose-500'} rounded-2xl p-6 text-white relative overflow-hidden`}>
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 w-32 h-32 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute bottom-2 left-16 w-24 h-24 rounded-full bg-white/10 blur-xl" />
        </div>

        <div className="relative z-10">
          {/* Top row: name + status badge */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20">
                <Music className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  Maestro
                  <span className="relative flex items-center">
                    <span className={`inline-block w-3 h-3 rounded-full ${isPaused ? 'bg-yellow-400' : 'bg-green-400'}`} />
                    {!isPaused && <span className="absolute inline-block w-3 h-3 rounded-full bg-green-400 animate-ping" />}
                  </span>
                </h1>
                <p className="text-white/70 text-sm">
                  {isPaused ? 'Paused — press Resume to enable daily bursts' : 'Running — daily burst orchestrating Toby & Lexi'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Trigger Burst button */}
              <button
                onClick={handleTriggerBurst}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl border border-white/25 text-sm font-semibold transition-all"
                title="Manually trigger the daily burst (ignores pause & last-run)"
              >
                <Sparkles className="w-4 h-4" />
                Trigger Burst
              </button>

              {/* Optimize Now button */}
              <button
                onClick={handleOptimizeNow}
                disabled={optimizing}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl border border-white/25 text-sm font-semibold transition-all disabled:opacity-60"
              >
                {optimizing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {optimizing ? 'Generating...' : 'Optimize Now'}
              </button>

              {/* Pause/Resume toggle */}
              <button
                onClick={handleTogglePause}
                disabled={toggling}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl border text-sm font-bold transition-all ${
                  isPaused
                    ? 'bg-green-500/80 hover:bg-green-500 border-green-400/50 text-white'
                    : 'bg-red-500/80 hover:bg-red-500 border-red-400/50 text-white'
                } disabled:opacity-60`}
              >
                {toggling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isPaused ? (
                  <Play className="w-4 h-4" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
                {toggling ? '...' : isPaused ? 'Resume' : 'Pause'}
              </button>
            </div>
          </div>

          {/* Agent cards — side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {(['toby', 'lexi'] as const).map((agName) => {
              const ag = agents[agName]
              const meta = AGENT_META[agName]
              const isActive = maestroStatus?.current_agent === agName
              const AgIcon = meta.icon

              return (
                <div
                  key={agName}
                  className={`bg-white/10 backdrop-blur-sm rounded-xl p-4 border transition-all ${
                    isActive ? 'border-white/40 ring-1 ring-white/20' : 'border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}>
                      <AgIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{meta.label}</span>
                        <span className="text-xs text-white/50">{meta.role}</span>
                        {isActive && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-white/20 rounded text-white uppercase tracking-wider">
                            Thinking
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold text-white">{ag?.proposals_today ?? 0}</div>
                      <div className="text-[10px] text-white/40">Today</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white">{ag?.total_proposals ?? 0}</div>
                      <div className="text-[10px] text-white/40">Total</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white">{ag?.errors ?? 0}</div>
                      <div className="text-[10px] text-white/40">Errors</div>
                    </div>
                  </div>

                  {ag?.last_thought && (
                    <div className="mt-2 text-xs text-white/50 truncate">
                      {ag.last_thought_at && <span>{timeAgo(ag.last_thought_at)} — </span>}
                      {ag.last_thought}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Status row */}
          {maestroStatus && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatusPill label="Uptime" value={maestroStatus.uptime_human || '—'} icon={Clock} />
              <StatusPill label="Cycles" value={String(maestroStatus.total_cycles)} icon={Activity} />
              <StatusPill label="Generated" value={String(maestroStatus.total_proposals_generated)} icon={Sparkles} />
              <StatusPill label="Trends" value={String(maestroStatus.total_trends_found)} icon={Flame} />
              <StatusPill label="Metrics" value={String(maestroStatus.total_metrics_collected)} icon={BarChart3} />
            </div>
          )}

          {/* Schedule info */}
          {maestroStatus && (
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-white/50">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Last burst: {maestroStatus.last_daily_run_human || 'never'}
              </span>
              {maestroStatus.current_phase && (
                <span className="flex items-center gap-1.5 text-white/80 font-medium">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {maestroStatus.current_phase === 'generating' ? 'Generating proposals...' : 'Processing jobs...'}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Sun className="w-3 h-3" />
                <Moon className="w-3 h-3" />
                {maestroStatus.daily_config?.total_reels_per_day ?? 6} reels/day &middot; 3 dark + 3 light &middot; 5 brands
              </span>
              <span className="flex items-center gap-1.5">
                <Shield className="w-3 h-3" />
                State persisted in DB — survives deploys
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Proposal stats bar ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            label="Today"
            value={`${(stats.agents?.toby?.today ?? 0) + (stats.agents?.lexi?.today ?? 0)}/15`}
            icon={Clock}
            color="purple"
          />
          <StatCard label="Pending" value={stats.pending} icon={AlertCircle} color="yellow" />
          <StatCard label="Accepted" value={stats.accepted} icon={Check} color="green" />
          <StatCard label="Rejected" value={stats.rejected} icon={X} color="red" />
          <StatCard label="Total" value={stats.total} icon={Bot} color="gray" />
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {(['proposals', 'activity', 'insights', 'trending'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'proposals' && `Proposals${stats?.pending ? ` (${stats.pending})` : ''}`}
            {tab === 'activity' && 'Activity'}
            {tab === 'insights' && 'Performance'}
            {tab === 'trending' && `Trending (${trending.length})`}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  PROPOSALS TAB                                             */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'proposals' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Status filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              {['pending', 'accepted', 'rejected', 'all'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    statusFilter === s
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {/* Agent filter */}
            <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
              <span className="text-xs text-gray-400">Agent:</span>
              {['all', 'toby', 'lexi'].map((a) => {
                const agMeta = a !== 'all' ? AGENT_META[a] : null
                return (
                  <button
                    key={a}
                    onClick={() => setAgentFilter(a)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      agentFilter === a
                        ? a === 'toby' ? 'bg-amber-100 text-amber-700'
                          : a === 'lexi' ? 'bg-violet-100 text-violet-700'
                          : 'bg-orange-100 text-orange-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {a === 'all' ? 'All' : agMeta?.label}
                  </button>
                )
              })}
            </div>

            {/* Accept All button — only shown when there are pending proposals */}
            {proposals.some((p) => p.status === 'pending') && statusFilter === 'pending' && (
              <div className="ml-auto">
                <button
                  onClick={handleAcceptAll}
                  disabled={acceptingId === '__all__'}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
                >
                  {acceptingId === '__all__' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Accept All ({proposals.filter((p) => p.status === 'pending').length})
                </button>
              </div>
            )}
          </div>

          {/* Proposal cards */}
          {proposals.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Music className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">
                {agentFilter !== 'all'
                  ? `No ${agentFilter === 'toby' ? 'Toby' : 'Lexi'} proposals with this filter`
                  : 'Maestro is warming up...'}
              </p>
              <p className="text-sm mt-1">
                Proposals will appear here automatically as Toby and Lexi generate them
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 text-orange-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Working autonomously...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {proposals.map((p) => (
                <ProposalCard
                  key={p.proposal_id}
                  proposal={p}
                  expanded={expandedId === p.proposal_id}
                  onToggle={() => setExpandedId(expandedId === p.proposal_id ? null : p.proposal_id)}
                  onAccept={() => handleAccept(p.proposal_id)}
                  onReject={() => {
                    if (showRejectInput === p.proposal_id) {
                      handleReject(p.proposal_id)
                    } else {
                      setShowRejectInput(p.proposal_id)
                      setRejectNotes('')
                    }
                  }}
                  accepting={acceptingId === p.proposal_id}
                  rejecting={rejectingId === p.proposal_id}
                  showRejectInput={showRejectInput === p.proposal_id}
                  rejectNotes={rejectNotes}
                  onRejectNotesChange={setRejectNotes}
                  onCancelReject={() => { setShowRejectInput(null); setRejectNotes('') }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  ACTIVITY TAB                                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'activity' && (
        <MaestroActivityPanel
          activity={maestroStatus?.recent_activity || []}
          onRefresh={fetchStatus}
        />
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  INSIGHTS TAB                                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'insights' && (
        <InsightsPanel
          insights={insights}
          stats={stats}
          onRefresh={async () => {
            await Promise.all([fetchInsights(), fetchStatus()])
          }}
        />
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  TRENDING TAB                                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'trending' && (
        <TrendingPanel items={trending} />
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
//  STATUS PILL
// ═══════════════════════════════════════════════════════════════════

function StatusPill({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock }) {
  return (
    <div className="bg-white/10 rounded-xl px-3 py-2 border border-white/10">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-white/60" />
        <div>
          <div className="text-sm font-semibold text-white">{value}</div>
          <div className="text-xs text-white/50">{label}</div>
        </div>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
//  STAT CARD
// ═══════════════════════════════════════════════════════════════════

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string; value: string | number; icon: typeof Clock
  color: 'purple' | 'yellow' | 'green' | 'red' | 'gray'
}) {
  const colors = {
    purple: 'bg-violet-50 text-violet-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    gray: 'bg-gray-50 text-gray-600',
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
//  PROPOSAL CARD — with agent badge
// ═══════════════════════════════════════════════════════════════════

function ProposalCard({
  proposal: p, expanded, onToggle, onAccept, onReject,
  accepting, rejecting, showRejectInput, rejectNotes, onRejectNotesChange, onCancelReject,
}: {
  proposal: Proposal; expanded: boolean; onToggle: () => void
  onAccept: () => void; onReject: () => void
  accepting: boolean; rejecting: boolean
  showRejectInput: boolean; rejectNotes: string
  onRejectNotesChange: (v: string) => void; onCancelReject: () => void
}) {
  const strategy = STRATEGY_META[p.strategy] || STRATEGY_META.explore
  const StrategyIcon = strategy.icon
  const agentMeta = AGENT_META[p.agent_name] || AGENT_META.toby

  return (
    <div className={`bg-white rounded-xl border ${p.status === 'pending' ? 'border-gray-200 shadow-sm' : 'border-gray-100'} overflow-hidden transition-shadow hover:shadow-md`}>
      {/* Header row */}
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={onToggle}>
        {/* Agent badge */}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded border ${agentMeta.bg} ${agentMeta.color}`}>
          {agentMeta.label.charAt(0)}
        </span>

        {/* Strategy badge */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${strategy.bg} ${strategy.color}`}>
          <StrategyIcon className="w-3.5 h-3.5" />
          {strategy.label}
        </div>

        {/* Content type badge */}
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${p.content_type === 'post' ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-purple-50 text-purple-600 border border-purple-200'}`}>
          {p.content_type === 'post' ? '📄 Post' : '🎬 Reel'}
        </span>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{p.title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{p.proposal_id} · {timeAgo(p.created_at)}</p>
        </div>

        {/* Status */}
        <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[p.status]}`}>
          {p.status}
        </span>

        {/* Quality */}
        {p.quality_score != null && (
          <span className={`text-xs font-mono ${p.quality_score >= 80 ? 'text-green-600' : p.quality_score >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
            Q{Math.round(p.quality_score)}
          </span>
        )}

        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50/50">
          {/* Reasoning */}
          <div>
            <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${agentMeta.color}`}>
              <Info className="w-3.5 h-3.5" />
              Why {agentMeta.label} chose this
            </div>
            <p className="text-sm text-gray-700 leading-relaxed bg-white rounded-lg p-3 border border-gray-100">
              {p.reasoning}
            </p>
          </div>

          {/* Reel content lines */}
          {p.content_lines && p.content_lines.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Content Lines</div>
              <ul className="space-y-1">
                {p.content_lines.map((line, i) => (
                  <li key={i} className="text-sm text-gray-700 bg-white rounded px-3 py-1.5 border border-gray-100">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Post slides */}
          {p.slide_texts && p.slide_texts.length > 0 && (
            <div>
              <div className="text-xs font-medium text-blue-600 mb-1">📄 Carousel Slides</div>
              <div className="space-y-2">
                {p.slide_texts.map((text, i) => (
                  <div key={i} className="bg-white rounded-lg p-3 border border-blue-100">
                    <div className="text-xs font-semibold text-blue-500 mb-1">Slide {i + 2}</div>
                    <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Image prompt */}
          {p.image_prompt && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Image Prompt</div>
              <p className="text-sm text-gray-600 italic bg-white rounded-lg p-3 border border-gray-100">
                {p.image_prompt}
              </p>
            </div>
          )}

          {/* Caption */}
          {p.caption && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Caption</div>
              <p className="text-sm text-gray-600 bg-white rounded-lg p-3 border border-gray-100 whitespace-pre-wrap">
                {p.caption}
              </p>
            </div>
          )}

          {/* Source context */}
          {p.source_title && (
            <div className="flex items-start gap-2 bg-white rounded-lg p-3 border border-gray-100">
              <div>
                <div className="text-xs font-medium text-gray-500">
                  {p.source_type === 'own_content' ? 'Based on our content' :
                   p.source_type === 'competitor' ? `From @${p.source_account}` :
                   'From trending'}
                </div>
                <p className="text-sm text-gray-700 mt-0.5">{p.source_title}</p>
                {p.source_performance_score != null && (
                  <span className="text-xs text-gray-400">Score: {Math.round(p.source_performance_score)}</span>
                )}
              </div>
            </div>
          )}

          {/* Topic */}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {p.topic_bucket && (
              <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-500">{p.topic_bucket}</span>
            )}
          </div>

          {/* Actions for pending */}
          {p.status === 'pending' && (
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={(e) => { e.stopPropagation(); onAccept() }}
                disabled={accepting}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Accept — Create for all brands
              </button>

              {showRejectInput ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    placeholder="Reason (optional)..."
                    value={rejectNotes}
                    onChange={(e) => onRejectNotesChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onReject() }}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); onReject() }}
                    disabled={rejecting}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50"
                  >
                    {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reject'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onCancelReject() }}
                    className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onReject() }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Reject
                </button>
              )}
            </div>
          )}

          {p.status === 'accepted' && p.accepted_job_id && (
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <a
                href={`/jobs/${p.accepted_job_id}`}
                onClick={(e) => { e.stopPropagation() }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <Eye className="w-4 h-4" />
                View Job {p.accepted_job_id}
              </a>
              <span className="text-xs text-gray-400">Accepted {p.reviewed_at ? timeAgo(p.reviewed_at) : ''}</span>
            </div>
          )}

          {p.status === 'rejected' && p.reviewed_at && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <MessageSquare className="w-3.5 h-3.5" />
                Rejected {timeAgo(p.reviewed_at)}
              </div>
              {p.reviewer_notes && (
                <div className="text-xs text-red-500 italic pl-5">
                  &ldquo;{p.reviewer_notes}&rdquo;
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
//  ACTIVITY PANEL — with agent tags
// ═══════════════════════════════════════════════════════════════════

type ActivityFilter = 'all' | 'actions' | 'api' | 'data'
type AgentActivityFilter = 'all' | 'maestro' | 'toby' | 'lexi'

function MaestroActivityPanel({
  activity, onRefresh,
}: {
  activity: ActivityEntry[]; onRefresh: () => Promise<void>
}) {
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [agentActivityFilter, setAgentActivityFilter] = useState<AgentActivityFilter>('all')
  const [expanded, setExpanded] = useState(true)

  const handleRefresh = async () => {
    setRefreshing(true)
    await onRefresh()
    setRefreshing(false)
  }

  const actionColors: Record<string, string> = {
    Thinking: 'text-violet-600 bg-violet-50',
    Generating: 'text-blue-600 bg-blue-50',
    Generated: 'text-green-600 bg-green-50',
    Observing: 'text-indigo-600 bg-indigo-50',
    Scouting: 'text-orange-600 bg-orange-50',
    Dispatching: 'text-amber-600 bg-amber-50',
    'Metrics collected': 'text-teal-600 bg-teal-50',
    'Trends discovered': 'text-red-600 bg-red-50',
    Resting: 'text-gray-500 bg-gray-50',
    Waiting: 'text-yellow-600 bg-yellow-50',
    Throttling: 'text-amber-600 bg-amber-50',
    Intel: 'text-purple-600 bg-purple-50',
    Planning: 'text-indigo-600 bg-indigo-50',
    'Cycle complete': 'text-green-600 bg-green-50',
    Error: 'text-red-600 bg-red-50',
    Started: 'text-green-600 bg-green-50',
    Analyze: 'text-violet-600 bg-violet-50',
    Refine: 'text-cyan-600 bg-cyan-50',
    Systematic: 'text-indigo-600 bg-indigo-50',
    Compound: 'text-emerald-600 bg-emerald-50',
  }

  // Double filter: by level AND by agent
  const filtered = activity.filter((e) => {
    const levelOk =
      filter === 'all' ? true :
      filter === 'actions' ? (!e.level || e.level === 'action') :
      filter === 'api' ? e.level === 'api' :
      filter === 'data' ? e.level === 'data' : true
    const agentOk = agentActivityFilter === 'all' || e.agent === agentActivityFilter
    return levelOk && agentOk
  })

  const filterButtons: { key: ActivityFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: '📋' },
    { key: 'actions', label: 'Actions', icon: '🤖' },
    { key: 'api', label: 'API Calls', icon: '🌐' },
    { key: 'data', label: 'Data', icon: '📊' },
  ]

  const agentBadge = (agent: string) => {
    const meta = AGENT_META[agent]
    if (meta) {
      return (
        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${meta.bg} ${meta.color} uppercase`}>
          {meta.label}
        </span>
      )
    }
    return (
      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-orange-50 border-orange-200 text-orange-600 uppercase border">
        Maestro
      </span>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Full transparency — every decision, API call, and data point from both agents
        </p>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {/* Filter row: level + agent */}
      <div className="flex flex-wrap gap-2 items-center">
        {filterButtons.map((fb) => (
          <button
            key={fb.key}
            onClick={() => setFilter(fb.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              filter === fb.key
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <span>{fb.icon}</span>
            {fb.label}
          </button>
        ))}

        <div className="w-px h-6 bg-gray-200 mx-1" />

        {(['all', 'maestro', 'toby', 'lexi'] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAgentActivityFilter(a)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              agentActivityFilter === a
                ? a === 'toby' ? 'bg-amber-500 text-white border-amber-500'
                  : a === 'lexi' ? 'bg-violet-500 text-white border-violet-500'
                  : a === 'maestro' ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {a === 'all' ? 'All Agents' : a.charAt(0).toUpperCase() + a.slice(1)}
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          {expanded ? 'Compact' : 'Expanded'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Activity className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No activity yet</p>
          <p className="text-sm mt-1">Maestro will start logging on the first cycle</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((entry, i) => {
            const level = entry.level || 'action'
            const colorClass = actionColors[entry.action] || 'text-gray-600 bg-gray-50'

            if (level === 'action') {
              return (
                <div key={i} className="flex items-start gap-3 bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                  <span className="text-lg flex-shrink-0 mt-0.5">{entry.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {agentBadge(entry.agent)}
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${colorClass}`}>
                        {entry.action}
                      </span>
                      <span className="text-xs text-gray-400">{timeAgo(entry.time)}</span>
                    </div>
                    {entry.detail && expanded && (
                      <p className="text-sm text-gray-700 font-medium">{entry.detail}</p>
                    )}
                  </div>
                </div>
              )
            }

            if (level === 'api') {
              const isError = entry.action.includes('Error') || entry.emoji === '❌'
              const isResponse = entry.action.includes('Response') || entry.emoji === '✅'
              const barColor = isError ? 'border-l-red-400' : isResponse ? 'border-l-green-400' : 'border-l-blue-400'
              const bgColor = isError ? 'bg-red-50/50' : isResponse ? 'bg-green-50/30' : 'bg-blue-50/30'

              return (
                <div key={i} className={`flex items-start gap-2.5 ml-6 border-l-2 ${barColor} ${bgColor} rounded-r-lg p-2 pl-3`}>
                  <span className="text-sm flex-shrink-0">{entry.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {agentBadge(entry.agent)}
                      <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 rounded">
                        API
                      </span>
                      <span className="text-xs font-medium text-gray-600">{entry.action}</span>
                      <span className="text-[11px] text-gray-400">{timeAgo(entry.time)}</span>
                    </div>
                    {entry.detail && expanded && (
                      <p className="text-xs text-gray-600 mt-0.5 font-mono break-all">{entry.detail}</p>
                    )}
                  </div>
                </div>
              )
            }

            if (level === 'data') {
              return (
                <div key={i} className="flex items-start gap-2.5 ml-6 border-l-2 border-l-amber-300 bg-amber-50/30 rounded-r-lg p-2 pl-3">
                  <span className="text-sm flex-shrink-0">{entry.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {agentBadge(entry.agent)}
                      <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 rounded">
                        DATA
                      </span>
                      <span className="text-xs text-gray-700 font-medium">{entry.detail || entry.action}</span>
                      <span className="text-[11px] text-gray-400 ml-auto">{timeAgo(entry.time)}</span>
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div key={i} className="flex items-start gap-2.5 ml-6 border-l-2 border-l-gray-200 bg-gray-50/50 rounded-r-lg p-2 pl-3">
                <span className="text-sm flex-shrink-0">{entry.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {agentBadge(entry.agent)}
                    <span className="text-xs font-medium text-gray-500">{entry.action}</span>
                    <span className="text-[11px] text-gray-400">{timeAgo(entry.time)}</span>
                  </div>
                  {entry.detail && expanded && (
                    <p className="text-xs text-gray-600 mt-0.5">{entry.detail}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
//  INSIGHTS PANEL
// ═══════════════════════════════════════════════════════════════════

function InsightsPanel({
  insights, stats, onRefresh,
}: {
  insights: InsightsResponse | null; stats: ProposalStats | null
  onRefresh: () => Promise<void>
}) {
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await onRefresh()
    setRefreshing(false)
  }

  if (!insights || insights.error) {
    return (
      <div className="text-center py-16 text-gray-400">
        <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">No performance data yet</p>
        <p className="text-sm mt-1">Collect metrics from your published content first</p>
      </div>
    )
  }

  const { summary, top_performers, underperformers } = insights

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs text-gray-500">Tracked Posts</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{summary.total_tracked}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs text-gray-500">Avg Views</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {summary.avg_views >= 1000 ? `${(summary.avg_views / 1000).toFixed(1)}k` : Math.round(summary.avg_views)}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs text-gray-500">Avg Engagement</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{(summary.avg_engagement_rate * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs text-gray-500">Top Topic</div>
          <div className="text-lg font-bold text-gray-900 mt-1">{summary.top_topic || 'N/A'}</div>
        </div>
      </div>

      {/* Agent competition — acceptance rates */}
      {stats?.agents && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Agent Competition</h3>
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(stats.agents).map(([name, ag]) => {
              const meta = AGENT_META[name] || AGENT_META.toby
              const AgIcon = meta.icon
              return (
                <div key={name} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}>
                      <AgIcon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <span className="font-bold text-gray-900">{meta.label}</span>
                      <span className="text-xs text-gray-400 ml-1">{meta.role}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold text-gray-900">{ag.total}</div>
                      <div className="text-[10px] text-gray-400">Total</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-green-600">{ag.accepted}</div>
                      <div className="text-[10px] text-gray-400">Accepted</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-orange-600">{ag.acceptance_rate}%</div>
                      <div className="text-[10px] text-gray-400">Win Rate</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top performers */}
      {top_performers.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            Top Performers
          </h3>
          <div className="space-y-2">
            {top_performers.map((perf, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-green-50/50 rounded-lg">
                <span className="text-sm font-bold text-green-600 w-6">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{perf.title}</p>
                  <p className="text-xs text-gray-500">{perf.brand} · {perf.topic_bucket || 'N/A'}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{perf.views >= 1000 ? `${(perf.views / 1000).toFixed(1)}k` : perf.views}</span>
                  <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{(perf.engagement_rate * 100).toFixed(1)}%</span>
                  <span className="font-mono font-bold text-green-600">{Math.round(perf.performance_score)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Underperformers */}
      {underperformers.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-amber-500" />
            Underperformers — agents can iterate on these
          </h3>
          <div className="space-y-2">
            {underperformers.map((perf, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-amber-50/30 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{perf.title}</p>
                  <p className="text-xs text-gray-500">{perf.brand} · {perf.topic_bucket || 'N/A'}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{perf.views >= 1000 ? `${(perf.views / 1000).toFixed(1)}k` : perf.views}</span>
                  <span className="font-mono text-amber-600">{Math.round(perf.performance_score)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
//  TRENDING PANEL
// ═══════════════════════════════════════════════════════════════════

function TrendingPanel({ items }: { items: TrendingItem[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Trending content discovered by Maestro&apos;s autonomous scout — scans every 4 hours
      </p>

      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Flame className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No trending content found yet</p>
          <p className="text-sm mt-1">Maestro scans for viral health/wellness content every 4 hours</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <div key={item.ig_media_id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-orange-400 rounded-lg flex items-center justify-center flex-shrink-0">
                {item.media_type === 'VIDEO' ? (
                  <Play className="w-5 h-5 text-white" />
                ) : (
                  <Sparkles className="w-5 h-5 text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {item.source_account && (
                    <span className="text-xs font-medium text-gray-900">@{item.source_account}</span>
                  )}
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    item.discovery_method === 'hashtag_search'
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-purple-50 text-purple-600'
                  }`}>
                    {item.discovery_method === 'hashtag_search' ? 'Hashtag' : 'Competitor'}
                  </span>
                </div>
                <p className="text-sm text-gray-700 line-clamp-2">{item.caption || 'No caption'}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{item.like_count.toLocaleString()}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{item.comments_count.toLocaleString()}</span>
                  <span>{timeAgo(item.discovered_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
