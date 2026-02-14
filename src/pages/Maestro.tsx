/**
 * Maestro — AI Content Orchestrator
 *
 * Manages N AI agents dynamically (loaded from DB).
 * Number of agents == number of brands.
 * Each agent generates content for EVERY brand (not just its birth brand).
 *
 * Agent cards, filters, and stats are all dynamic — no hardcoded names.
 * Always running. Auto-starts every deployment.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Bot,
  Play,
  Pause,
  Check,
  X,
  Sparkles,
  Loader2,
  Flame,
  Clock,
  AlertCircle,
  Filter,
  Activity,
  Shield,
  Music,
  BarChart3,
  Sun,
  Moon,
  Trash2,
  RotateCcw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { get, post, del } from '@/shared/api/client'

import type { Proposal, ProposalListResponse, MaestroStatus, InsightsResponse, TrendingItem } from '@/features/maestro/types'
import { getAgentMeta } from '@/features/maestro/constants'
import { timeAgo } from '@/features/maestro/utils'
import { ProposalCard, MaestroActivityPanel, InsightsPanel, TrendingPanel, StatCard, StatusPill } from '@/features/maestro/components'


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
  const [bursting, setBursting] = useState(false)
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
          `${result.job_ids?.length || 1} jobs created (${variants}) — generating for ${result.brands?.length || 1} brand${(result.brands?.length || 1) > 1 ? 's' : ''}`,
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
    toast.success(`Accepted ${accepted} proposals${failed > 0 ? ` (${failed} failed)` : ''} — 1 job per proposal`, { duration: 6000 })
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

  const stats = maestroStatus?.proposal_stats ?? null
  const agents = maestroStatus?.agents ?? {}
  const isPaused = maestroStatus?.is_paused ?? true
  // Dynamic agent IDs — driven by API, no hardcoded list
  const agentIds = Object.keys(agents).filter(id => id !== 'maestro')

  const handleTogglePause = async () => {
    setToggling(true)
    try {
      const endpoint = isPaused ? '/api/maestro/resume' : '/api/maestro/pause'
      const result = await post<any>(endpoint)
      if (result.status === 'error') {
        toast.error(result.message || 'Failed to persist state — check DB connection')
      } else if (result.status === 'resumed' || result.status === 'paused' || result.status === 'already_running' || result.status === 'already_paused') {
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

  // Smart burst: generates only REMAINING proposals for the day
  const todayReels = maestroStatus?.daily_config?.today_reels ?? 0
  const todayPosts = maestroStatus?.daily_config?.today_posts ?? 0
  const targetReels = maestroStatus?.daily_config?.total_reels ?? 30
  const targetPosts = maestroStatus?.daily_config?.total_posts ?? 10
  const remainingReels = Math.max(0, targetReels - todayReels)
  const remainingPosts = Math.max(0, targetPosts - todayPosts)
  const remainingTotal = remainingReels + remainingPosts
  const burstComplete = remainingTotal === 0

  const handleTriggerBurst = async () => {
    setBursting(true)
    try {
      const result = await post<any>('/api/maestro/trigger-burst')
      if (result.status === 'triggered') {
        const msg = result.remaining_reels != null
          ? `Generating ${result.remaining_reels} reels + ${result.remaining_posts} posts...`
          : `Burst triggered — generating proposals...`
        toast.success(msg, { duration: 6000 })
        // Poll
        const poll = setInterval(async () => {
          await Promise.all([fetchProposals(), fetchStatus()])
        }, 15000)
        setTimeout(() => {
          clearInterval(poll)
          fetchProposals()
          fetchStatus()
          setBursting(false)
        }, 300000)
      } else if (result.status === 'complete') {
        toast.success('All proposals for today are complete!', { icon: '✅', duration: 4000 })
        setBursting(false)
      } else {
        toast.error(result.error || 'Failed to trigger burst')
        setBursting(false)
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to trigger burst')
      setBursting(false)
    }
  }

  const handleClearProposals = async () => {
    if (!confirm('Clear all proposals? This cannot be undone.')) return
    try {
      const result = await del<any>('/api/maestro/proposals/clear')
      if (result.status === 'cleared') {
        toast.success(`Cleared ${result.deleted} proposals`)
        await Promise.all([fetchProposals(), fetchStatus()])
      } else {
        toast.error(result.error || 'Failed to clear')
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to clear proposals')
    }
  }

  const [resetting, setResetting] = useState(false)
  const handleResetAll = async () => {
    if (!confirm('Reset all? This clears all proposals and resets the daily burst limit.')) return
    setResetting(true)
    try {
      // Clear proposals + reset daily run in parallel
      const [clearResult] = await Promise.all([
        del<any>('/api/maestro/proposals/clear'),
        post<any>('/api/maestro/reset-daily-run'),
      ])
      toast.success(`Reset complete — cleared ${clearResult.deleted} proposals, burst limit reset`)
      await Promise.all([fetchProposals(), fetchStatus()])
    } catch (e: any) {
      toast.error(e?.message || 'Failed to reset')
    } finally {
      setResetting(false)
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
                  {isPaused ? 'Paused — press Resume to enable daily bursts' : `Running — daily burst orchestrating ${agentIds.length} AI agents`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Reset All button */}
              <button
                onClick={handleResetAll}
                disabled={resetting}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/30 hover:bg-red-500/50 rounded-xl border border-red-400/30 text-sm font-semibold transition-all disabled:opacity-50"
                title="Clear all proposals and reset daily burst limit"
              >
                {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Reset All
              </button>

              {/* Trigger Burst button — smart: generates only remaining */}
              <button
                onClick={handleTriggerBurst}
                disabled={burstComplete || bursting}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
                  burstComplete || bursting
                    ? 'bg-white/10 border-white/15 text-white/40 cursor-not-allowed'
                    : 'bg-white/20 hover:bg-white/30 border-white/25'
                }`}
                title={bursting ? 'Generating...' : burstComplete ? 'All proposals for today are complete' : `Generate ${remainingReels} reels + ${remainingPosts} posts`}
              >
                {bursting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {bursting ? 'Generating...' : burstComplete ? 'All Done Today ✅' : `Run Burst (${remainingTotal} remaining)`}
              </button>

              {/* Pause/Resume All toggle */}
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

          {/* Agent cards — dynamic grid */}
          <div className={`grid grid-cols-1 ${agentIds.length === 2 ? 'md:grid-cols-2' : agentIds.length >= 3 ? 'md:grid-cols-3' : ''} gap-3 mb-4`}>
            {agentIds.map((agName, idx) => {
              const ag = agents[agName]
              const meta = getAgentMeta(agName, idx)
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
              <StatusPill label="Jobs" value={String(maestroStatus.total_jobs_dispatched ?? 0)} icon={Sparkles} />
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
                {targetReels} reels + {targetPosts} posts = {targetReels + targetPosts} proposals/day &middot; Posts at 8AM + 2PM &middot; Burst at 12PM Lisbon
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
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <StatCard
            label="Reel Proposals"
            value={`${todayReels}/${targetReels}`}
            icon={Sparkles}
            color="purple"
          />
          <StatCard
            label="Post Proposals"
            value={`${todayPosts}/${targetPosts}`}
            icon={Clock}
            color="purple"
          />
          <StatCard label="Pending" value={stats.pending} icon={AlertCircle} color="yellow" />
          <StatCard label="Accepted" value={stats.accepted} icon={Check} color="green" />
          <StatCard label="Rejected" value={stats.rejected} icon={X} color="red" />
          <StatCard label="Total" value={stats.total} icon={Bot} color="gray" />
          {stats.total > 0 && (
            <button
              onClick={handleClearProposals}
              className="flex items-center justify-center gap-2 p-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl text-red-600 text-xs font-medium transition-colors"
              title="Clear all proposals"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          )}
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
              {['all', ...agentIds].map((a) => {
                const meta = a !== 'all' ? getAgentMeta(a, agentIds.indexOf(a)) : null
                return (
                  <button
                    key={a}
                    onClick={() => setAgentFilter(a)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      agentFilter === a
                        ? meta ? `${meta.bg.split(' ')[0]} ${meta.color}` : 'bg-orange-100 text-orange-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {a === 'all' ? 'All' : meta?.label}
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
                  ? `No ${agentFilter.charAt(0).toUpperCase() + agentFilter.slice(1)} proposals with this filter`
                  : 'Maestro is warming up...'}
              </p>
              <p className="text-sm mt-1">
                Proposals will appear here automatically as agents generate them
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
