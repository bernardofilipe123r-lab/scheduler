/**
 * Toby — Autonomous AI Content Strategist
 *
 * Toby runs autonomously in the background, like a human content
 * strategist always working. The user can only:
 *   - See his status (running/paused, uptime, last thought)
 *   - Pause / Resume him
 *   - Review proposals (accept/reject)
 *   - View insights & trending
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
  ExternalLink,
  Info,
  Filter,
  Activity,
  Brain,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { get, post } from '@/shared/api/client'

// ─── Types ───────────────────────────────────────────────────
interface Proposal {
  id: number
  proposal_id: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  content_type: string
  strategy: 'explore' | 'iterate' | 'double_down' | 'trending'
  reasoning: string
  title: string
  content_lines: string[] | null
  image_prompt: string | null
  caption: string | null
  topic_bucket: string | null
  source_type: string | null
  source_title: string | null
  source_performance_score: number | null
  source_account: string | null
  quality_score: number | null
  reviewed_at: string | null
  accepted_job_id: string | null
  created_at: string
}

interface ProposalListResponse {
  count: number
  proposals: Proposal[]
}

interface TobyStats {
  total: number
  today: number
  pending: number
  accepted: number
  rejected: number
  daily_limit: number
  strategies?: Record<string, { total: number; accepted: number; rate: number }>
}

interface ActivityEntry {
  time: string
  action: string
  detail: string
  emoji: string
}

interface TobyDaemonStatus {
  is_running: boolean
  is_paused: boolean
  started_at: string | null
  paused_at: string | null
  uptime_seconds: number
  uptime_human: string
  last_thought: string | null
  last_thought_at: string | null
  last_metrics_at: string | null
  last_scan_at: string | null
  last_proposals_at: string | null
  next_cycle_at: string | null
  total_cycles: number
  total_proposals_generated: number
  total_metrics_collected: number
  total_trends_found: number
  errors: number
  recent_activity: ActivityEntry[]
  proposal_stats: TobyStats
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

// ─── Strategy config ─────────────────────────────────────────
const STRATEGY_META: Record<string, { label: string; icon: typeof Lightbulb; color: string; bg: string; desc: string }> = {
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
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-600',
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
export function TobyPage() {
  // ── State ──
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [daemonStatus, setDaemonStatus] = useState<TobyDaemonStatus | null>(null)
  const [insights, setInsights] = useState<InsightsResponse | null>(null)
  const [trending, setTrending] = useState<TrendingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'proposals' | 'activity' | 'insights' | 'trending'>('proposals')

  // ── Data fetching ──
  const fetchProposals = useCallback(async () => {
    try {
      const statusParam = statusFilter === 'all' ? '' : `?status=${statusFilter}`
      const data = await get<ProposalListResponse>(`/api/toby/proposals${statusParam}`)
      setProposals(data.proposals || [])
    } catch (e: any) {
      console.error('Failed to fetch proposals:', e)
    }
  }, [statusFilter])

  const fetchStatus = useCallback(async () => {
    try {
      const data = await get<TobyDaemonStatus>('/api/toby/status')
      setDaemonStatus(data)
    } catch (e: any) {
      console.error('Failed to fetch Toby status:', e)
    }
  }, [])

  const fetchInsights = useCallback(async () => {
    try {
      const data = await get<InsightsResponse>('/api/toby/insights')
      if (!data.error) setInsights(data)
    } catch (e: any) {
      console.error('Failed to fetch insights:', e)
    }
  }, [])

  const fetchTrending = useCallback(async () => {
    try {
      const data = await get<{ count: number; trending: TrendingItem[] }>('/api/toby/trending')
      setTrending(data.trending || [])
    } catch (e: any) {
      console.error('Failed to fetch trending:', e)
    }
  }, [])

  // Initial load
  useEffect(() => {
    setLoading(true)
    Promise.all([fetchProposals(), fetchStatus(), fetchInsights(), fetchTrending()])
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh status every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // Refetch proposals on filter change
  useEffect(() => {
    fetchProposals()
  }, [fetchProposals])

  // ── Actions ──
  const handleToggle = async () => {
    if (!daemonStatus) return
    setToggling(true)
    try {
      if (daemonStatus.is_running) {
        await post<any>('/api/toby/pause')
        toast.success('Toby paused')
      } else {
        await post<any>('/api/toby/resume')
        toast.success('Toby resumed')
      }
      await fetchStatus()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to toggle Toby')
    } finally {
      setToggling(false)
    }
  }

  const handleAccept = async (proposalId: string) => {
    setAcceptingId(proposalId)
    try {
      const result = await post<any>(`/api/toby/proposals/${proposalId}/accept`)
      if (result.status === 'accepted') {
        toast.success(`Accepted: ${result.title || proposalId}`)
        await Promise.all([fetchProposals(), fetchStatus()])
      } else {
        toast.error(result.error || 'Accept failed')
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to accept')
    } finally {
      setAcceptingId(null)
    }
  }

  const handleReject = async (proposalId: string) => {
    setRejectingId(proposalId)
    try {
      const result = await post<any>(`/api/toby/proposals/${proposalId}/reject`, {
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

  const stats = daemonStatus?.proposal_stats || null
  const isRunning = daemonStatus?.is_running ?? false

  // ── Loading state ──
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
      {/*  TOBY STATUS HEADER                                      */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 rounded-2xl p-6 text-white relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 w-32 h-32 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute bottom-2 left-16 w-24 h-24 rounded-full bg-white/10 blur-xl" />
        </div>

        <div className="relative z-10">
          {/* Top row: name + toggle */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  Toby
                  {/* Alive pulse */}
                  <span className="relative flex items-center">
                    <span className={`inline-block w-3 h-3 rounded-full ${isRunning ? 'bg-green-400' : 'bg-yellow-400'}`} />
                    {isRunning && (
                      <span className="absolute inline-block w-3 h-3 rounded-full bg-green-400 animate-ping" />
                    )}
                  </span>
                </h1>
                <p className="text-white/70 text-sm">
                  {isRunning ? 'Autonomous AI content strategist — always thinking' : 'Paused — waiting to resume'}
                </p>
              </div>
            </div>

            {/* Pause / Resume toggle */}
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg ${
                isRunning
                  ? 'bg-white/20 hover:bg-white/30 text-white border border-white/20'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {toggling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isRunning ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isRunning ? 'Pause Toby' : 'Resume Toby'}
            </button>
          </div>

          {/* Status info row */}
          {daemonStatus && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatusPill
                label="Uptime"
                value={daemonStatus.uptime_human || '—'}
                icon={Clock}
              />
              <StatusPill
                label="Cycles"
                value={String(daemonStatus.total_cycles)}
                icon={Activity}
              />
              <StatusPill
                label="Generated"
                value={String(daemonStatus.total_proposals_generated)}
                icon={Sparkles}
              />
              <StatusPill
                label="Trends Found"
                value={String(daemonStatus.total_trends_found)}
                icon={Flame}
              />
              <StatusPill
                label="Metrics"
                value={String(daemonStatus.total_metrics_collected)}
                icon={BarChart3}
              />
            </div>
          )}

          {/* Last thought */}
          {daemonStatus?.last_thought && (
            <div className="mt-4 bg-white/10 rounded-xl px-4 py-3 border border-white/10">
              <div className="flex items-center gap-2 text-white/60 text-xs mb-1">
                <Brain className="w-3.5 h-3.5" />
                Last thought {daemonStatus.last_thought_at ? `— ${timeAgo(daemonStatus.last_thought_at)}` : ''}
              </div>
              <p className="text-sm text-white/90">{daemonStatus.last_thought}</p>
            </div>
          )}

          {/* Next cycle */}
          {daemonStatus?.next_cycle_at && isRunning && (
            <div className="mt-2 text-xs text-white/50 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Next thinking cycle: {timeAgo(daemonStatus.next_cycle_at)}
            </div>
          )}
        </div>
      </div>

      {/* ── Proposal stats bar ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Today" value={`${stats.today}/${stats.daily_limit}`} icon={Clock} color="purple" />
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
                ? 'border-violet-500 text-violet-600'
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
          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            {['pending', 'accepted', 'rejected', 'all'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  statusFilter === s
                    ? 'bg-violet-100 text-violet-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Proposal cards */}
          {proposals.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Bot className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">
                {isRunning ? 'Toby is thinking...' : 'No proposals yet'}
              </p>
              <p className="text-sm mt-1">
                {isRunning
                  ? 'New proposals will appear here automatically as Toby generates them'
                  : 'Resume Toby to start generating proposals'
                }
              </p>
              {isRunning && (
                <div className="mt-4 flex items-center justify-center gap-2 text-violet-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Working autonomously...</span>
                </div>
              )}
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
        <ActivityPanel
          activity={daemonStatus?.recent_activity || []}
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
//  STATUS PILL (header row)
// ═══════════════════════════════════════════════════════════════════
function StatusPill({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof Clock
}) {
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
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: string | number
  icon: typeof Clock
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
//  PROPOSAL CARD
// ═══════════════════════════════════════════════════════════════════
function ProposalCard({
  proposal: p,
  expanded,
  onToggle,
  onAccept,
  onReject,
  accepting,
  rejecting,
  showRejectInput,
  rejectNotes,
  onRejectNotesChange,
  onCancelReject,
}: {
  proposal: Proposal
  expanded: boolean
  onToggle: () => void
  onAccept: () => void
  onReject: () => void
  accepting: boolean
  rejecting: boolean
  showRejectInput: boolean
  rejectNotes: string
  onRejectNotesChange: (v: string) => void
  onCancelReject: () => void
}) {
  const strategy = STRATEGY_META[p.strategy] || STRATEGY_META.explore
  const StrategyIcon = strategy.icon

  return (
    <div className={`bg-white rounded-xl border ${p.status === 'pending' ? 'border-gray-200 shadow-sm' : 'border-gray-100'} overflow-hidden transition-shadow hover:shadow-md`}>
      {/* Header row */}
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={onToggle}>
        {/* Strategy badge */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${strategy.bg} ${strategy.color}`}>
          <StrategyIcon className="w-3.5 h-3.5" />
          {strategy.label}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{p.title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{p.proposal_id} · {timeAgo(p.created_at)}</p>
        </div>

        {/* Status pill */}
        <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[p.status]}`}>
          {p.status}
        </span>

        {/* Quality score */}
        {p.quality_score != null && (
          <span className={`text-xs font-mono ${p.quality_score >= 80 ? 'text-green-600' : p.quality_score >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
            Q{Math.round(p.quality_score)}
          </span>
        )}

        {/* Expand */}
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50/50">
          {/* Reasoning */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-violet-600 mb-1">
              <Info className="w-3.5 h-3.5" />
              Why Toby chose this
            </div>
            <p className="text-sm text-gray-700 leading-relaxed bg-white rounded-lg p-3 border border-gray-100">
              {p.reasoning}
            </p>
          </div>

          {/* Content preview */}
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

          {/* Source context (for non-explore strategies) */}
          {p.source_title && (
            <div className="flex items-start gap-2 bg-white rounded-lg p-3 border border-gray-100">
              <ExternalLink className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
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

          {/* Topic & meta */}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {p.topic_bucket && (
              <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-500">{p.topic_bucket}</span>
            )}
            <span>{p.content_type}</span>
          </div>

          {/* Actions for pending proposals */}
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

          {/* Show rejection notes if rejected */}
          {p.status === 'rejected' && p.reviewed_at && (
            <div className="flex items-center gap-2 text-xs text-gray-400 pt-1">
              <MessageSquare className="w-3.5 h-3.5" />
              Rejected {timeAgo(p.reviewed_at)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
//  ACTIVITY PANEL — Toby's autonomous activity log
// ═══════════════════════════════════════════════════════════════════
function ActivityPanel({
  activity,
  onRefresh,
}: {
  activity: ActivityEntry[]
  onRefresh: () => Promise<void>
}) {
  const [refreshing, setRefreshing] = useState(false)

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
    'Metrics collected': 'text-teal-600 bg-teal-50',
    'Trends discovered': 'text-red-600 bg-red-50',
    Resting: 'text-gray-500 bg-gray-50',
    Waiting: 'text-yellow-600 bg-yellow-50',
    Throttling: 'text-amber-600 bg-amber-50',
    Intel: 'text-purple-600 bg-purple-50',
    'Cycle complete': 'text-green-600 bg-green-50',
    Error: 'text-red-600 bg-red-50',
    Started: 'text-green-600 bg-green-50',
    Resumed: 'text-green-600 bg-green-50',
    Paused: 'text-yellow-600 bg-yellow-50',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Toby's autonomous decisions and actions — updated in real-time
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

      {activity.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Activity className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No activity yet</p>
          <p className="text-sm mt-1">Toby will start logging activity on his first cycle</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activity.map((entry, i) => {
            const colorClass = actionColors[entry.action] || 'text-gray-600 bg-gray-50'
            return (
              <div key={i} className="flex items-start gap-3 bg-white rounded-lg border border-gray-200 p-3">
                <span className="text-lg flex-shrink-0 mt-0.5">{entry.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colorClass}`}>
                      {entry.action}
                    </span>
                    <span className="text-xs text-gray-400">{timeAgo(entry.time)}</span>
                  </div>
                  {entry.detail && (
                    <p className="text-sm text-gray-700">{entry.detail}</p>
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
  insights,
  stats,
  onRefresh,
}: {
  insights: InsightsResponse | null
  stats: TobyStats | null
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
      {/* Refresh button */}
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

      {/* Strategy success rates */}
      {stats?.strategies && Object.keys(stats.strategies).length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Strategy Success Rates</h3>
          <div className="space-y-3">
            {Object.entries(stats.strategies).map(([key, s]) => {
              const meta = STRATEGY_META[key] || STRATEGY_META.explore
              const StratIcon = meta.icon
              const pct = s.total > 0 ? Math.round(s.rate * 100) : 0
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className={`flex items-center gap-1.5 w-32 ${meta.color}`}>
                    <StratIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">{meta.label}</span>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-violet-500 rounded-full h-2 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-16 text-right">
                    {s.accepted}/{s.total} ({pct}%)
                  </span>
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
            Underperformers — Toby can iterate on these
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
function TrendingPanel({
  items,
}: {
  items: TrendingItem[]
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Trending content discovered by Toby's autonomous scout — scans every 4 hours
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Flame className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No trending content found yet</p>
          <p className="text-sm mt-1">Toby scans for viral health/wellness content every 4 hours automatically</p>
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
