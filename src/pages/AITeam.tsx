import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { get, post } from '@/shared/api/client'
import {
  Dna, Trophy, Skull, Sparkles, Zap, Shield, AlertTriangle, ChevronDown,
  ChevronUp, TrendingUp, FlaskConical, Copy, Eye,
  Heart, Activity, Loader2, Crown,
  Flame, Target, Swords, Stethoscope, CheckCircle2, XCircle, AlertCircle,
  Bot, Brain, Calendar, Info, Gauge, Pause, Play, Clock, Timer, ExternalLink, ChevronRight, X
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuotas, useAgentStatuses, type AgentStatus, type QuotaData } from '@/features/ai-team'
import { CompetitorSection } from '@/features/ai-team/components/CompetitorSection'
import { PageLoader } from '@/shared/components'
import { useAuth } from '@/features/auth/AuthContext'

// ── Types ──

interface AgentStats7d {
  posts: number
  views: number
  engagement_rate: number
  best_strategy: string | null
}

interface Agent {
  agent_id: string
  display_name: string
  personality: string
  temperature: number
  variant: string
  proposal_prefix: string
  strategy_names: string[]
  strategy_weights: Record<string, number>
  risk_tolerance: string
  proposals_per_brand: number
  content_types: string[]
  active: boolean
  is_builtin: boolean
  survival_score: number
  lifetime_views: number
  lifetime_proposals: number
  lifetime_accepted: number
  generation: number
  mutation_count: number
  parent_agent_id: string | null
  last_mutation_at: string | null
  created_at: string | null
  updated_at: string | null
  tier: 'thriving' | 'surviving' | 'struggling'
  stats_7d: AgentStats7d
}

interface PerformanceSnapshot {
  id: number
  agent_id: string
  period: string
  published_count: number
  total_views: number
  avg_views: number
  total_likes: number
  total_comments: number
  avg_engagement_rate: number
  strategy_breakdown: Record<string, { count: number; avg_views: number; total_views: number }> | null
  best_strategy: string | null
  worst_strategy: string | null
  avg_examiner_score: number | null
  survival_score: number
  created_at: string | null
}

interface EvolutionEvent {
  id: number
  agent_id: string
  mutation_type: string
  description: string
  old_value: any
  new_value: any
  trigger: string
  confidence: number | null
  survival_score_at: number | null
  created_at: string | null
}

interface GenePoolEntry {
  id: number
  source_agent_id: string
  source_agent_name: string
  personality: string
  temperature: number
  variant: string
  strategy_names: string[]
  strategy_weights: Record<string, number>
  risk_tolerance: string
  survival_score: number
  lifetime_views: number
  generation: number
  reason: string
  times_inherited: number
  created_at: string | null
}

interface DiagnosticCheck {
  name: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
  duration_ms: number
}

interface DiagnosticReport {
  id: number
  status: 'healthy' | 'degraded' | 'critical'
  total_checks: number
  passed: number
  warnings: number
  failures: number
  checks: DiagnosticCheck[]
  active_agents: number
  avg_survival_score: number
  gene_pool_size: number
  pending_jobs: number
  failed_jobs_24h: number
  total_scheduled: number
  created_at: string | null
}

interface CycleInfo {
  interval_minutes?: number
  schedule?: string
  description: string
  last_run: string | null
  is_complete?: boolean
}

interface MaestroStatus {
  is_running: boolean
  is_paused: boolean
  uptime_human: string
  total_cycles: number
  total_proposals_generated: number
  current_phase: string | null
  errors: number
  started_at: string | null
  cycles?: Record<string, CycleInfo>
}

// ── Helpers ──

const TIER_CONFIG = {
  thriving: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: Crown, label: 'Thriving' },
  surviving: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Shield, label: 'Surviving' },
  struggling: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: AlertTriangle, label: 'Struggling' },
}

const MUTATION_ICONS: Record<string, typeof Dna> = {
  weight_shift: TrendingUp,
  temperature: Flame,
  death: Skull,
  spawn: Sparkles,
  manual_mutation: FlaskConical,
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function survivalBar(score: number) {
  const pct = Math.min(100, Math.max(0, score))
  let color = 'bg-emerald-500'
  if (pct < 30) color = 'bg-red-500'
  else if (pct < 60) color = 'bg-amber-500'
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-bold tabular-nums w-8 text-right">{Math.round(pct)}</span>
    </div>
  )
}

function StrategyWeights({ weights }: { weights: Record<string, number> }) {
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1])
  const maxW = sorted[0]?.[1] || 1
  return (
    <div className="space-y-1">
      {sorted.map(([name, w]) => (
        <div key={name} className="flex items-center gap-2 text-xs">
          <span className="w-20 text-gray-600 uppercase font-mono truncate">{name}</span>
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-400 rounded-full"
              style={{ width: `${(w / maxW) * 100}%` }}
            />
          </div>
          <span className="w-10 text-right text-gray-500 tabular-nums">{(w * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  )
}


// ── Main Page ──

export function AITeamPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.id === '7c7bdcc7-ad79-4554-8d32-e5ef02608e84' || user?.email === 'filipe@healthycollege.co'
  const [agents, setAgents] = useState<Agent[]>([])
  const [events, setEvents] = useState<EvolutionEvent[]>([])
  const [genePool, setGenePool] = useState<GenePoolEntry[]>([])
  const [diagnostics, setDiagnostics] = useState<DiagnosticReport | null>(null)
  const [maestroStatus, setMaestroStatus] = useState<MaestroStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [agentPerf, setAgentPerf] = useState<Record<string, PerformanceSnapshot[]>>({})
  const [agentLearnings, setAgentLearnings] = useState<Record<string, EvolutionEvent[]>>({})
  const [activeTab, setActiveTab] = useState<'overview' | 'leaderboard' | 'timeline' | 'gene-pool' | 'health' | 'quotas' | 'competitors'>('overview')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Test Maestro modal state
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testContentType, setTestContentType] = useState<'posts' | 'reels' | 'both'>('both')
  const [testPosts, setTestPosts] = useState(2)
  const [testReels, setTestReels] = useState(2)
  const [testBrands, setTestBrands] = useState(1)
  const [testRunning, setTestRunning] = useState(false)

  const { data: agentStatusesData } = useAgentStatuses(activeTab === 'leaderboard')
  const { data: quotasData, isLoading: quotasLoading } = useQuotas(activeTab === 'quotas')

  const fetchAgents = useCallback(async () => {
    try {
      const data = await get<{ agents: Agent[] }>('/api/agents?include_inactive=true')
      setAgents(data.agents || [])
    } catch (e) { console.error('Failed to fetch agents', e) }
  }, [])

  const fetchEvents = useCallback(async () => {
    try {
      const data = await get<{ events: EvolutionEvent[] }>('/api/agents/evolution-events/timeline')
      setEvents(data.events || [])
    } catch (e) { console.error('Failed to fetch events', e) }
  }, [])

  const fetchGenePool = useCallback(async () => {
    try {
      const data = await get<{ entries: GenePoolEntry[] }>('/api/agents/gene-pool/entries')
      setGenePool(data.entries || [])
    } catch (e) { console.error('Failed to fetch gene pool', e) }
  }, [])

  const fetchDiagnostics = useCallback(async () => {
    try {
      const data = await get<{ report: DiagnosticReport | null }>('/api/agents/diagnostics/latest')
      if (data.report) setDiagnostics(data.report)
    } catch (e) { console.error('Failed to fetch diagnostics', e) }
  }, [])

  const fetchMaestroStatus = useCallback(async () => {
    try {
      const data = await get<MaestroStatus>('/api/maestro/status')
      setMaestroStatus(data)
    } catch (e) { console.error('Failed to fetch maestro status', e) }
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchAgents(), fetchEvents(), fetchGenePool(), fetchDiagnostics(), fetchMaestroStatus()])
    setLoading(false)
  }, [fetchAgents, fetchEvents, fetchGenePool, fetchDiagnostics, fetchMaestroStatus])

  useEffect(() => { refreshAll() }, [refreshAll])
  useEffect(() => {
    const interval = setInterval(fetchAgents, 30000)
    return () => clearInterval(interval)
  }, [fetchAgents])

  const toggleExpand = async (agentId: string) => {
    if (expandedAgent === agentId) {
      setExpandedAgent(null)
      return
    }
    setExpandedAgent(agentId)
    // Fetch details if not cached
    if (!agentPerf[agentId]) {
      try {
        const [perfData, learnData] = await Promise.all([
          get<{ snapshots: PerformanceSnapshot[] }>(`/api/agents/${agentId}/performance`),
          get<{ learnings: EvolutionEvent[] }>(`/api/agents/${agentId}/learnings`),
        ])
        setAgentPerf(prev => ({ ...prev, [agentId]: perfData.snapshots || [] }))
        setAgentLearnings(prev => ({ ...prev, [agentId]: learnData.learnings || [] }))
      } catch (e) { console.error('Failed to fetch agent details', e) }
    }
  }

  const handleMutate = async (agentId: string) => {
    setActionLoading(agentId + '-mutate')
    try {
      await post(`/api/agents/${agentId}/mutate`, {})
      toast.success('DNA re-rolled!')
      await fetchAgents()
      // Refresh details if expanded
      if (expandedAgent === agentId) {
        const learnData = await get<{ learnings: EvolutionEvent[] }>(`/api/agents/${agentId}/learnings`)
        setAgentLearnings(prev => ({ ...prev, [agentId]: learnData.learnings || [] }))
      }
    } catch (e) { toast.error('Mutation failed') }
    setActionLoading(null)
  }

  const handleClone = async (agentId: string) => {
    setActionLoading(agentId + '-clone')
    try {
      await post(`/api/agents/${agentId}/clone`, {})
      toast.success('Agent cloned!')
      await fetchAgents()
    } catch (e) { toast.error('Clone failed') }
    setActionLoading(null)
  }

  const handleRetire = async (agentId: string, name: string) => {
    if (!confirm(`Retire ${name}? Their DNA will be archived to the gene pool.`)) return
    setActionLoading(agentId + '-retire')
    try {
      await post(`/api/agents/${agentId}/retire`, {})
      toast.success(`${name} retired. DNA archived.`)
      await Promise.all([fetchAgents(), fetchEvents(), fetchGenePool()])
    } catch (e: any) {
      toast.error(e?.message || 'Retirement failed')
    }
    setActionLoading(null)
  }

  if (loading) {
    return <PageLoader page="ai-team" />
  }

  const activeAgents = agents.filter(a => a.active)
  const retiredAgents = agents.filter(a => !a.active)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Dna className="w-8 h-8 text-indigo-600" />
            AI Team
          </h1>
          <p className="text-gray-500 mt-1">
            {activeAgents.length} active agents competing • Generation {Math.max(...activeAgents.map(a => a.generation || 1), 1)} • {genePool.length} DNA archived
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => setTestModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-md transition-all border border-indigo-500 text-sm font-medium"
            >
              <FlaskConical className="w-4 h-4" />
              Test Maestro
            </button>
          )}
          <button
            onClick={() => navigate('/observatory')}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg shadow-md transition-all border border-gray-700 text-sm font-medium"
          >
            I want to see AI working...
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Test Maestro Modal */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !testRunning && setTestModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-indigo-600" />
                Test Maestro
              </h3>
              <button onClick={() => !testRunning && setTestModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Content type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Content Type</label>
                <div className="flex gap-3">
                  {(['posts', 'reels', 'both'] as const).map(opt => (
                    <label key={opt} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors text-sm font-medium ${
                      testContentType === opt
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}>
                      <input
                        type="radio"
                        name="contentType"
                        value={opt}
                        checked={testContentType === opt}
                        onChange={() => setTestContentType(opt)}
                        className="sr-only"
                      />
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              {/* Posts count */}
              {(testContentType === 'posts' || testContentType === 'both') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">How many posts?</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={testPosts}
                    onChange={e => setTestPosts(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Reels count */}
              {(testContentType === 'reels' || testContentType === 'both') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">How many reels?</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={testReels}
                    onChange={e => setTestReels(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Brands count */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">How many brands?</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={testBrands}
                  onChange={e => setTestBrands(Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Start button */}
              <button
                onClick={async () => {
                  setTestRunning(true)
                  try {
                    // Convert brand count to array of brand names
                    const allBrands = ['healthycollege', 'holisticcollege', 'longevitycollege', 'vitalitycollege', 'wellbeingcollege']
                    const selectedBrands = allBrands.slice(0, testBrands)

                    await post('/api/maestro/trigger-burst?force=true', {
                      test_mode: true,
                      posts: testContentType === 'reels' ? 0 : testPosts,
                      reels: testContentType === 'posts' ? 0 : testReels,
                      brands: selectedBrands,
                    })
                    toast.success('Test burst triggered successfully!')
                    setTestModalOpen(false)
                  } catch (e: any) {
                    toast.error(e?.message || 'Failed to trigger test burst')
                  } finally {
                    setTestRunning(false)
                  }
                }}
                disabled={testRunning}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testRunning ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Running Test...</>
                ) : (
                  <><FlaskConical className="w-4 h-4" /> Start Test</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Banner */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={Swords} label="Active Agents" value={activeAgents.length} color="indigo" />
        <StatCard icon={Trophy} label="Avg Survival" value={Math.round(activeAgents.reduce((s, a) => s + (a.survival_score || 0), 0) / Math.max(activeAgents.length, 1))} suffix="/100" color="emerald" />
        <StatCard icon={Eye} label="Total Views" value={formatNumber(activeAgents.reduce((s, a) => s + (a.lifetime_views || 0), 0))} color="blue" />
        <StatCard icon={FlaskConical} label="Total Mutations" value={activeAgents.reduce((s, a) => s + (a.mutation_count || 0), 0)} color="purple" />
        <StatCard icon={Dna} label="Gene Pool" value={genePool.length} suffix=" DNA" color="pink" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: 'overview' as const, label: 'Overview', icon: Info },
          { key: 'leaderboard' as const, label: 'Leaderboard', icon: Trophy },
          { key: 'timeline' as const, label: 'Evolution Timeline', icon: Activity },
          { key: 'gene-pool' as const, label: 'Gene Pool', icon: Dna },
          { key: 'health' as const, label: 'System Health', icon: Stethoscope },
          { key: 'quotas' as const, label: 'API Quotas', icon: Gauge },
          { key: 'competitors' as const, label: 'Competitors', icon: Swords },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab
          agents={activeAgents}
          maestroStatus={maestroStatus}
          totalProposals={activeAgents.reduce((s, a) => s + (a.lifetime_proposals || 0), 0)}
          onRefresh={fetchMaestroStatus}
        />
      )}

      {activeTab === 'leaderboard' && <LeaderboardTab
        agents={activeAgents}
        retiredAgents={retiredAgents}
        expandedAgent={expandedAgent}
        agentPerf={agentPerf}
        agentLearnings={agentLearnings}
        actionLoading={actionLoading}
        onToggle={toggleExpand}
        onMutate={handleMutate}
        onClone={handleClone}
        onRetire={handleRetire}
        agentStatuses={agentStatusesData}
      />}

      {activeTab === 'timeline' && <EvolutionTimeline events={events} />}
      {activeTab === 'gene-pool' && <GenePoolView entries={genePool} />}
      {activeTab === 'health' && <SystemHealthView report={diagnostics} onRefresh={fetchDiagnostics} />}
      {activeTab === 'quotas' && <QuotasTab quotas={quotasData} quotasLoading={quotasLoading} />}

      {activeTab === 'competitors' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Swords className="w-5 h-5 text-indigo-500" />
            Competitor Accounts
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Add Instagram accounts for your AI agents to learn from. They'll analyze top-performing content to improve your strategy.
          </p>
          <CompetitorSection />
        </div>
      )}
    </div>
  )
}


// ── Sub-components ──

function LeaderboardTab({
  agents, retiredAgents, expandedAgent, agentPerf, agentLearnings,
  actionLoading, onToggle, onMutate, onClone, onRetire, agentStatuses,
}: {
  agents: Agent[]
  retiredAgents: Agent[]
  expandedAgent: string | null
  agentPerf: Record<string, PerformanceSnapshot[]>
  agentLearnings: Record<string, EvolutionEvent[]>
  actionLoading: string | null
  onToggle: (id: string) => void
  onMutate: (id: string) => void
  onClone: (id: string) => void
  onRetire: (id: string, name: string) => void
  agentStatuses: AgentStatus[] | undefined
}) {

  return (
    <div className="space-y-3">
      {agents.map((agent, idx) => {
        const status = agentStatuses?.find(s => s.agent_id === agent.agent_id)
        return (
          <AgentCard
            key={agent.agent_id}
            agent={agent}
            rank={idx + 1}
            expanded={expandedAgent === agent.agent_id}
            onToggle={() => onToggle(agent.agent_id)}
            perfHistory={agentPerf[agent.agent_id] || []}
            learnings={agentLearnings[agent.agent_id] || []}
            onMutate={() => onMutate(agent.agent_id)}
            onClone={() => onClone(agent.agent_id)}
            onRetire={() => onRetire(agent.agent_id, agent.display_name)}
            actionLoading={actionLoading}
            status={status}
          />
        )
      })}

      {retiredAgents.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-400 mb-3 flex items-center gap-2">
            <Skull className="w-5 h-5" />
            Retired ({retiredAgents.length})
          </h3>
          {retiredAgents.map(agent => (
            <div key={agent.agent_id} className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-2 opacity-60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-400">{agent.display_name}</span>
                  <span className="text-xs text-gray-400">Gen {agent.generation || 1}</span>
                </div>
                <span className="text-sm text-gray-400">Score: {Math.round(agent.survival_score || 0)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function QuotasTab({ quotas, quotasLoading }: { quotas: QuotaData | undefined; quotasLoading: boolean }) {
  const [retrying, setRetrying] = useState(false)
  const queryClient = useQueryClient()

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await queryClient.invalidateQueries({ queryKey: ['ai-team', 'quotas'] })
    } finally {
      setTimeout(() => setRetrying(false), 2000)
    }
  }

  if (quotasLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* deAPI skeleton */}
          <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 p-6 animate-pulse">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-3xl">🎨</span>
              <div className="h-5 w-20 bg-purple-200 rounded" />
            </div>
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="h-10 w-32 bg-purple-200 rounded-lg" />
              <div className="h-4 w-24 bg-purple-100 rounded" />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-purple-200/50">
              <div className="bg-white/60 rounded-lg p-3"><div className="h-4 w-full bg-purple-100 rounded" /></div>
              <div className="bg-white/60 rounded-lg p-3"><div className="h-4 w-full bg-purple-100 rounded" /></div>
            </div>
          </div>
          {/* DeepSeek skeleton */}
          <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 p-6 animate-pulse">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-3xl">🧠</span>
              <div className="h-5 w-24 bg-blue-200 rounded" />
            </div>
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="h-10 w-32 bg-blue-200 rounded-lg" />
              <div className="h-4 w-24 bg-blue-100 rounded" />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-blue-200/50">
              <div className="bg-white/60 rounded-lg p-3"><div className="h-4 w-full bg-blue-100 rounded" /></div>
              <div className="bg-white/60 rounded-lg p-3"><div className="h-4 w-full bg-blue-100 rounded" /></div>
            </div>
          </div>
        </div>
        <div className="text-center text-sm text-gray-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking API quotas...
        </div>
      </div>
    )
  }
  if (!quotas) return <div className="text-gray-500 text-center py-8">No quota data available</div>

  const deapi = quotas.deapi
  const deepseek = quotas.deepseek

  // Debug logging
  if (deapi?.error) console.warn('[QuotasTab] deAPI error:', deapi.error)
  if (deepseek?.error) console.warn('[QuotasTab] DeepSeek error:', deepseek.error)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* deAPI Card */}
        {deapi && typeof deapi === 'object' && (
          <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🎨</span>
                <h3 className="text-lg font-semibold text-gray-900">deAPI</h3>
              </div>
              {deapi.account_type && (
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  deapi.account_type === 'premium' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {deapi.account_type.toUpperCase()}
                </span>
              )}
            </div>
            {deapi.error ? (
              <div className="text-center py-3 space-y-2">
                <p className="text-sm text-red-600">⚠️ {deapi.error}</p>
                <button
                  onClick={handleRetry}
                  disabled={retrying}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50"
                >
                  {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  Retry
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Balance — prominent display */}
                {deapi.balance != null ? (
                  <div className="text-center py-3">
                    <p className={`text-4xl font-bold font-mono ${
                      Number(deapi.balance) > 5 ? 'text-emerald-600' :
                      Number(deapi.balance) > 1 ? 'text-amber-600' :
                      'text-red-600'
                    }`}>
                      ${Number(deapi.balance).toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">available credits</p>
                    <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-medium ${
                      Number(deapi.balance) > 5 ? 'bg-emerald-100 text-emerald-700' :
                      Number(deapi.balance) > 1 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${
                        Number(deapi.balance) > 5 ? 'bg-emerald-500' :
                        Number(deapi.balance) > 1 ? 'bg-amber-500' :
                        'bg-red-500'
                      }`} />
                      {Number(deapi.balance) > 5 ? 'Healthy' :
                       Number(deapi.balance) > 1 ? 'Low balance' :
                       'Critical — top up soon'}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-3 space-y-2">
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <p className="text-sm">Checking balance...</p>
                    </div>
                    <button
                      onClick={handleRetry}
                      disabled={retrying}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50"
                    >
                      {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      Retry
                    </button>
                  </div>
                )}

                {/* Details row */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-purple-200/50">
                  {deapi.rpm_limit !== undefined && (
                    <div className="bg-white/60 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-500">Rate Limit</p>
                      <p className="text-sm font-bold text-gray-900">{deapi.rpm_limit} req/min</p>
                    </div>
                  )}
                  <div className="bg-white/60 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Calls Today</p>
                    <p className="text-sm font-bold text-gray-900">{deapi.used ?? 0}</p>
                  </div>
                </div>

                {/* Agent breakdown */}
                {deapi.agent_breakdown && Object.keys(deapi.agent_breakdown).length > 0 && (
                  <div className="pt-3 border-t border-purple-200/50 space-y-1">
                    <div className="text-xs text-gray-500 font-medium">By Agent:</div>
                    {Object.entries(deapi.agent_breakdown).map(([agent, calls]) => (
                      <div key={agent} className="flex justify-between text-xs">
                        <span className="text-gray-600">{agent}</span>
                        <span className="text-gray-900 font-mono">{calls as number}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* DeepSeek Card */}
        {deepseek && typeof deepseek === 'object' && (
          <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🧠</span>
                <h3 className="text-lg font-semibold text-gray-900">DeepSeek</h3>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                USAGE-BASED
              </span>
            </div>
            {deepseek.error ? (
              <p className="text-sm text-red-600">⚠️ {deepseek.error}</p>
            ) : (
              <div className="space-y-4">
                {/* Balance if available */}
                {deepseek.balance != null ? (
                  <div className="text-center py-3">
                    <p className={`text-4xl font-bold font-mono ${
                      Number(deepseek.balance) > 5 ? 'text-emerald-600' :
                      Number(deepseek.balance) > 1 ? 'text-amber-600' :
                      'text-red-600'
                    }`}>
                      {deepseek.currency === 'CNY' ? '¥' : '$'}{Number(deepseek.balance).toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">available balance{deepseek.currency ? ` (${deepseek.currency})` : ''}</p>
                  </div>
                ) : (
                  <div className="text-center py-3">
                    <p className="text-sm text-gray-600">Pay-per-token billing</p>
                    <p className="text-xs text-gray-400 mt-1">No fixed daily limit — charged per API call</p>
                  </div>
                )}

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-blue-200/50">
                  <div className="bg-white/60 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Calls Today</p>
                    <p className="text-sm font-bold text-gray-900">{deepseek.used ?? 0}</p>
                  </div>
                  {deepseek.requests_limit ? (
                    <div className="bg-white/60 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-500">Rate Limit</p>
                      <p className="text-sm font-bold text-gray-900">{deepseek.requests_limit} req/min</p>
                    </div>
                  ) : (
                    <div className="bg-white/60 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-500">Est. Cost Today</p>
                      <p className="text-sm font-bold text-gray-900">
                        ${((deepseek.used ?? 0) * 0.002).toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Agent breakdown */}
                {deepseek.agent_breakdown && Object.keys(deepseek.agent_breakdown).length > 0 && (
                  <div className="pt-3 border-t border-blue-200/50 space-y-1">
                    <div className="text-xs text-gray-500 font-medium">By Agent:</div>
                    {Object.entries(deepseek.agent_breakdown).map(([agent, calls]) => (
                      <div key={agent} className="flex justify-between text-xs">
                        <span className="text-gray-600">{agent}</span>
                        <span className="text-gray-900 font-mono">{calls as number}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        💡 <strong>Note:</strong> deAPI balance is fetched live from your account. DeepSeek uses pay-per-token billing. Meta API quotas are tracked internally.
      </div>

      {quotas.history && quotas.history.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Last 24 Hours</h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {quotas.history.slice().reverse().map((h, i) => (
              <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-100">
                <span className="text-gray-500">
                  {new Date(h.hour).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                </span>
                <span className="text-gray-700 font-medium">{h.service}</span>
                <span className="text-gray-900 font-mono">{h.calls_made} calls</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OverviewTab({
  agents,
  maestroStatus,
  totalProposals,
  onRefresh,
}: {
  agents: Agent[]
  maestroStatus: MaestroStatus | null
  totalProposals: number
  onRefresh: () => void
}) {
  const [maestroToggling, setMaestroToggling] = useState(false)
  const [localPausedOverride, setLocalPausedOverride] = useState<boolean | null>(null)
  const isRunning = maestroStatus?.is_running ?? false
  const isPaused = localPausedOverride !== null ? localPausedOverride : (maestroStatus?.is_paused ?? false)

  // Reset local override when parent state syncs
  useEffect(() => { setLocalPausedOverride(null) }, [maestroStatus?.is_paused])

  const handlePauseResume = async () => {
    setMaestroToggling(true)
    const wasPaused = isPaused
    try {
      if (wasPaused) {
        await post('/api/maestro/resume', {})
      } else {
        await post('/api/maestro/pause', {})
      }
      // Optimistic update — flip immediately
      setLocalPausedOverride(!wasPaused)
      // Await refresh to sync state
      await onRefresh()
      // Show toast AFTER everything completes
      toast.success(wasPaused ? 'Maestro resumed' : 'Maestro paused')
    } catch {
      toast.error(wasPaused ? 'Failed to resume Maestro' : 'Failed to pause Maestro')
    } finally {
      setMaestroToggling(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Live Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-5 h-5 text-indigo-500" />
            <span className="text-sm font-medium text-gray-500">Active Agents</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{agents.length}</p>
          <p className="text-xs text-gray-400 mt-1">Competing in generation {Math.max(...agents.map(a => a.generation || 1), 1)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <span className="text-sm font-medium text-gray-500">Total Proposals</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(totalProposals)}</p>
          <p className="text-xs text-gray-400 mt-1">Lifetime across all agents</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5 text-violet-500" />
            <span className="text-sm font-medium text-gray-500">Maestro</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${isRunning && !isPaused ? 'bg-green-500' : isPaused ? 'bg-yellow-500' : 'bg-gray-400'}`} />
            <p className="text-lg font-bold text-gray-900">
              {isRunning && !isPaused ? 'Running' : isPaused ? 'Paused' : 'Offline'}
            </p>
            {(isRunning || isPaused) && (
              <button
                onClick={handlePauseResume}
                disabled={maestroToggling}
                className={`ml-auto flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                  maestroToggling
                    ? 'bg-gray-500 text-white cursor-wait'
                    : isPaused
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                      : 'bg-amber-600 text-white hover:bg-amber-500'
                }`}
              >
                {maestroToggling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isPaused ? (
                  <Play className="w-4 h-4" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
                {maestroToggling
                  ? (isPaused ? 'Starting...' : 'Stopping...')
                  : (isPaused ? 'Resume' : 'Pause')}
              </button>
            )}
          </div>
          {maestroStatus?.uptime_human && (
            <p className="text-xs text-gray-400 mt-1">Up {maestroStatus.uptime_human}</p>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5 text-emerald-500" />
            <span className="text-sm font-medium text-gray-500">Burst Cycles</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{maestroStatus?.total_cycles ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">Daily generation runs</p>
        </div>
      </div>

      {/* Maestro Operations */}
      {maestroStatus?.cycles && (
        <MaestroOperations cycles={maestroStatus.cycles} startedAt={maestroStatus.started_at} />
      )}

      {/* Scheduling System */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-500" />
          Scheduling &mdash; Offset System
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Each brand gets an auto-assigned offset (0, 1, 2, 3, 4) so content is staggered throughout the day.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Reels Schedule</h4>
            <p className="text-xs text-gray-500 mb-2">Base hours: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00</p>
            <div className="space-y-1 text-xs font-mono text-gray-600">
              <div>Offset 0 → 00:00, 04:00, 08:00, 12:00, 16:00, 20:00</div>
              <div>Offset 1 → 01:00, 05:00, 09:00, 13:00, 17:00, 21:00</div>
              <div>Offset 2 → 02:00, 06:00, 10:00, 14:00, 18:00, 22:00</div>
              <div className="text-gray-400">...and so on</div>
            </div>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Posts Schedule</h4>
            <p className="text-xs text-gray-500 mb-2">Base hours: 08:00, 20:00</p>
            <div className="space-y-1 text-xs font-mono text-gray-600">
              <div>Offset 0 → 08:00, 20:00</div>
              <div>Offset 1 → 09:00, 21:00</div>
              <div>Offset 2 → 10:00, 22:00</div>
              <div className="text-gray-400">...and so on</div>
            </div>
          </div>
        </div>
      </div>

      {/* Agent List */}
      {agents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Active Agents</h3>
          <div className="divide-y divide-gray-100">
            {agents.map(agent => (
              <div key={agent.agent_id} className="flex items-center gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{agent.display_name}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{agent.personality?.split('.')[0]}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span title="Temperature"><Flame className="w-3 h-3 inline mr-1" />{agent.temperature}</span>
                  <span title="Risk"><Target className="w-3 h-3 inline mr-1" />{agent.risk_tolerance}</span>
                  <span title="Proposals"><Sparkles className="w-3 h-3 inline mr-1" />{agent.lifetime_proposals || 0}</span>
                </div>
                <div className="w-24">{survivalBar(agent.survival_score)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


// ── Maestro Operations Countdown ──

const CYCLE_DISPLAY: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  daily_burst: { label: 'Daily Burst', icon: Sparkles, color: 'text-amber-600 bg-amber-50' },
  check: { label: 'Auto-Publish Check', icon: Clock, color: 'text-blue-600 bg-blue-50' },
  healing: { label: 'Healing', icon: Heart, color: 'text-pink-600 bg-pink-50' },
  observe: { label: 'Observe (Metrics)', icon: Eye, color: 'text-cyan-600 bg-cyan-50' },
  scout: { label: 'Scout (Trends)', icon: Target, color: 'text-emerald-600 bg-emerald-50' },
  feedback: { label: 'Feedback (DNA Mutation)', icon: FlaskConical, color: 'text-purple-600 bg-purple-50' },
  evolution: { label: 'Evolution (Selection)', icon: Dna, color: 'text-indigo-600 bg-indigo-50' },
  diagnostics: { label: 'Diagnostics', icon: Stethoscope, color: 'text-gray-600 bg-gray-50' },
  bootstrap: { label: 'Bootstrap (Cold-start)', icon: Zap, color: 'text-orange-600 bg-orange-50' },
}

const CYCLE_ORDER = ['daily_burst', 'check', 'healing', 'bootstrap', 'observe', 'scout', 'feedback', 'diagnostics', 'evolution']

function useCountdown(cycles: Record<string, CycleInfo> | undefined, startedAt: string | null | undefined) {
  const [now, setNow] = useState(Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(Date.now()), 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  if (!cycles) return []

  const started = startedAt ? new Date(startedAt).getTime() : now

  return CYCLE_ORDER.filter(key => {
    const cycle = cycles[key]
    if (!cycle) return false
    if (key === 'bootstrap' && cycle.is_complete) return false
    return true
  }).map(key => {
    const cycle = cycles[key]
    const display = CYCLE_DISPLAY[key]

    let nextRunMs: number | null = null
    let nextRunLabel = ''

    if (key === 'daily_burst') {
      // Next noon Lisbon — approximate: compute next 12:00 in Europe/Lisbon
      const nowDate = new Date(now)
      // Use Intl to get Lisbon offset
      const lisbonNow = new Date(nowDate.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }))
      const todayNoon = new Date(lisbonNow)
      todayNoon.setHours(12, 0, 0, 0)
      if (lisbonNow >= todayNoon) {
        todayNoon.setDate(todayNoon.getDate() + 1)
      }
      // Convert back: difference in local equivalent
      const diff = todayNoon.getTime() - lisbonNow.getTime()
      nextRunMs = diff
      nextRunLabel = 'Daily @ 12:00 Lisbon'
    } else if (key === 'evolution') {
      // Weekly — next Sunday 2AM Lisbon
      const nowDate = new Date(now)
      const lisbonNow = new Date(nowDate.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }))
      const daysUntilSunday = (7 - lisbonNow.getDay()) % 7 || 7
      const nextSun = new Date(lisbonNow)
      nextSun.setDate(lisbonNow.getDate() + daysUntilSunday)
      nextSun.setHours(2, 0, 0, 0)
      if (daysUntilSunday === 0 && lisbonNow.getHours() < 2) {
        nextSun.setDate(lisbonNow.getDate()) // today
      }
      const diff = nextSun.getTime() - lisbonNow.getTime()
      nextRunMs = diff > 0 ? diff : diff + 7 * 24 * 3600 * 1000
      nextRunLabel = `Weekly ${cycle.schedule}`
    } else if (cycle.interval_minutes) {
      // Interval-based: last_run + interval
      if (cycle.last_run) {
        const lastRun = new Date(cycle.last_run).getTime()
        const nextAt = lastRun + cycle.interval_minutes * 60 * 1000
        nextRunMs = nextAt - now
      } else {
        // If never ran, count from startup + initial stagger (~30-330s, approximate as interval)
        const startupPlus = started + cycle.interval_minutes * 60 * 1000
        nextRunMs = startupPlus - now
      }
      nextRunLabel = `Every ${cycle.interval_minutes >= 60 ? `${cycle.interval_minutes / 60}h` : `${cycle.interval_minutes}m`}`
    }

    // Clamp if past due
    if (nextRunMs !== null && nextRunMs < 0) nextRunMs = 0

    return {
      key,
      label: display?.label || key,
      icon: display?.icon || Clock,
      color: display?.color || 'text-gray-600 bg-gray-50',
      description: cycle.description,
      nextRunMs,
      nextRunLabel,
      lastRun: cycle.last_run,
    }
  })
}

function formatCountdown(ms: number | null): string {
  if (ms === null) return '--:--'
  if (ms <= 0) return 'now'
  const totalSecs = Math.floor(ms / 1000)
  const d = Math.floor(totalSecs / 86400)
  const h = Math.floor((totalSecs % 86400) / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

const BURST_COOLDOWN_MS = 12 * 60 * 60 * 1000 // 12 hours
const BURST_LS_KEY = 'maestro-last-manual-burst'
const BURST_LS_KEY_ADMIN = 'maestro-admin-burst-timestamps'

function MaestroOperations({ cycles, startedAt }: { cycles: Record<string, CycleInfo>; startedAt: string | null | undefined }) {
  const items = useCountdown(cycles, startedAt)
  const navigate = useNavigate()
  const [burstLoading, setBurstLoading] = useState(false)
  const [burstCooldownLeft, setBurstCooldownLeft] = useState<number | null>(null)
  const [usageText, setUsageText] = useState<string>('')
  const { user } = useAuth()

  // Admin check: user with id '7c7bdcc7-ad79-4554-8d32-e5ef02608e84' or matching email
  const isAdmin = user?.id === '7c7bdcc7-ad79-4554-8d32-e5ef02608e84' || user?.email === 'filipe@healthycollege.co'

  // Calculate cooldown and usage remaining
  useEffect(() => {
    const check = () => {
      if (isAdmin) {
        // Admin: max 3 requests per 24h, no spacing required
        const raw = localStorage.getItem(BURST_LS_KEY_ADMIN)
        let timestamps: number[] = raw ? JSON.parse(raw) : []
        const now = Date.now()
        const dayAgo = now - (24 * 60 * 60 * 1000)
        
        // Filter to last 24h only
        timestamps = timestamps.filter(ts => ts > dayAgo)
        localStorage.setItem(BURST_LS_KEY_ADMIN, JSON.stringify(timestamps))
        
        const remaining = 3 - timestamps.length
        setUsageText(`${remaining}/3 available today`)
        setBurstCooldownLeft(timestamps.length >= 3 ? 1 : null) // Show as disabled if exhausted
      } else {
        // Normal user: max 2 requests with 12h spacing
        const raw = localStorage.getItem(BURST_LS_KEY)
        if (!raw) {
          setBurstCooldownLeft(null)
          setUsageText('')
          return
        }
        const lastTs = parseInt(raw, 10)
        const remaining = (lastTs + BURST_COOLDOWN_MS) - Date.now()
        setBurstCooldownLeft(remaining > 0 ? remaining : null)
        setUsageText('')
      }
    }
    check()
    const id = setInterval(check, 1000)
    return () => clearInterval(id)
  }, [isAdmin])

  const handleTriggerBurst = async () => {
    if (isAdmin) {
      // Admin: check if < 3 in last 24h
      const raw = localStorage.getItem(BURST_LS_KEY_ADMIN)
      let timestamps: number[] = raw ? JSON.parse(raw) : []
      const now = Date.now()
      const dayAgo = now - (24 * 60 * 60 * 1000)
      timestamps = timestamps.filter(ts => ts > dayAgo)
      
      if (timestamps.length >= 3) {
        toast.error('Max 3 manual bursts per day reached')
        return
      }
    } else {
      // Normal user: check 12h cooldown
      if (burstCooldownLeft && burstCooldownLeft > 0) return
    }

    setBurstLoading(true)
    try {
      const res = await post<{ status: string; message: string }>('/api/maestro/trigger-burst?force=true', {})
      
      if (isAdmin) {
        const raw = localStorage.getItem(BURST_LS_KEY_ADMIN)
        let timestamps: number[] = raw ? JSON.parse(raw) : []
        timestamps.push(Date.now())
        localStorage.setItem(BURST_LS_KEY_ADMIN, JSON.stringify(timestamps))
      } else {
        localStorage.setItem(BURST_LS_KEY, String(Date.now()))
        setBurstCooldownLeft(BURST_COOLDOWN_MS)
      }
      
      toast.success(res.message || 'Daily Burst triggered!')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to trigger burst')
    } finally {
      setBurstLoading(false)
    }
  }

  if (items.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Timer className="w-5 h-5 text-indigo-500" />
        Maestro Operations
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        Live countdown for each Maestro cycle. All cycles run independently in the background.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(item => {
          const Icon = item.icon
          const isImminent = item.nextRunMs !== null && item.nextRunMs <= 60_000
          const isDailyBurst = item.key === 'daily_burst'
          return (
            <div
              key={item.key}
              className={`rounded-lg border p-3 flex items-start gap-3 transition-colors ${
                isImminent ? 'border-indigo-300 bg-indigo-50/50' : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className={`p-2 rounded-lg flex-shrink-0 ${item.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-900 truncate">{item.label}</span>
                  <span className={`text-sm font-mono font-bold tabular-nums ${
                    isImminent ? 'text-indigo-600' : 'text-gray-700'
                  }`}>
                    {formatCountdown(item.nextRunMs)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-gray-400">{item.nextRunLabel}</span>
                  {item.lastRun && (
                    <span className="text-[10px] text-gray-400">last: {timeAgo(item.lastRun)}</span>
                  )}
                </div>
                {isDailyBurst && (
                  <>
                    <button
                      onClick={handleTriggerBurst}
                      disabled={burstLoading || (burstCooldownLeft !== null && burstCooldownLeft > 0)}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      {burstLoading ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Running...</>
                      ) : burstCooldownLeft !== null && burstCooldownLeft > 0 ? (
                        isAdmin ? (
                          <><Clock className="w-3 h-3" /> {usageText}</>
                        ) : (
                          <><Clock className="w-3 h-3" /> Available in {formatCountdown(burstCooldownLeft)}</>
                        )
                      ) : (
                        <><Play className="w-3 h-3" /> Run Now</>
                      )}
                    </button>
                    {isAdmin && usageText && !burstLoading && (
                      <div className="mt-1 text-[10px] text-amber-600 text-center font-medium">
                        {usageText}
                      </div>
                    )}
                    {isImminent && item.nextRunMs !== null && item.nextRunMs <= 300_000 && (
                      <button
                        onClick={() => navigate('/mission-control')}
                        className="mt-1 w-full flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Watch AI Agents Work Live
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


function StatCard({ icon: Icon, label, value, suffix, color }: { icon: any; label: string; value: string | number; suffix?: string; color: string }) {
  const colorMap: Record<string, string> = {
    indigo: 'text-indigo-600 bg-indigo-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    blue: 'text-blue-600 bg-blue-50',
    purple: 'text-purple-600 bg-purple-50',
    pink: 'text-pink-600 bg-pink-50',
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${colorMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-bold text-gray-900">{value}{suffix || ''}</p>
      </div>
    </div>
  )
}


function AgentCard({
  agent, rank, expanded, onToggle, perfHistory, learnings, onMutate: _onMutate, onClone: _onClone, onRetire: _onRetire, actionLoading: _actionLoading, status
}: {
  agent: Agent
  rank: number
  expanded: boolean
  onToggle: () => void
  perfHistory: PerformanceSnapshot[]
  learnings: EvolutionEvent[]
  onMutate: () => void
  onClone: () => void
  onRetire: () => void
  actionLoading: string | null
  status?: import('@/features/ai-team').AgentStatus
}) {
  const tier = TIER_CONFIG[agent.tier]
  const TierIcon = tier.icon

  return (
    <div className={`bg-white rounded-xl border-2 ${tier.border} overflow-hidden transition-shadow hover:shadow-md`}>
      {/* Main row */}
      <button onClick={onToggle} className="w-full text-left p-4 flex items-center gap-4">
        {/* Rank */}
        <div className="flex-shrink-0 w-8 text-center">
          {rank <= 3 ? (
            <span className="text-xl">{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</span>
          ) : (
            <span className="text-lg font-bold text-gray-400">#{rank}</span>
          )}
        </div>

        {/* Name + tier */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">{agent.display_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tier.bg} ${tier.color} flex items-center gap-1`}>
              <TierIcon className="w-3 h-3" />
              {tier.label}
            </span>
            <span className="text-xs text-gray-400">Gen {agent.generation || 1}</span>
            {status && status.current_status !== 'idle' && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {status.current_status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Flame className="w-3 h-3" />
              {agent.temperature}
            </span>
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" />
              {agent.risk_tolerance}
            </span>
            {agent.stats_7d.posts > 0 && (
              <>
                <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatNumber(agent.stats_7d.views)}</span>
                <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{(agent.stats_7d.engagement_rate * 100).toFixed(1)}%</span>
              </>
            )}
          </div>
        </div>

        {/* Survival score */}
        <div className="w-32 flex-shrink-0">
          {survivalBar(agent.survival_score)}
        </div>

        {/* Expand toggle */}
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* DNA */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Dna className="w-4 h-4 text-indigo-500" /> DNA Profile
              </h4>
              <StrategyWeights weights={agent.strategy_weights} />
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 rounded p-2">
                  <span className="text-gray-500">Temperature</span>
                  <p className="font-bold text-gray-900">{agent.temperature}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <span className="text-gray-500">Variant</span>
                  <p className="font-bold text-gray-900">{agent.variant}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <span className="text-gray-500">Risk</span>
                  <p className="font-bold text-gray-900 capitalize">{agent.risk_tolerance}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <span className="text-gray-500">Mutations</span>
                  <p className="font-bold text-gray-900">{agent.mutation_count || 0}</p>
                </div>
              </div>
            </div>

            {/* Lifetime stats */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" /> Lifetime Stats
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Views</span>
                  <span className="font-bold">{formatNumber(agent.lifetime_views || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Proposals Created</span>
                  <span className="font-bold">{agent.lifetime_proposals || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Proposals Accepted</span>
                  <span className="font-bold">{agent.lifetime_accepted || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Accept Rate</span>
                  <span className="font-bold">
                    {agent.lifetime_proposals ? `${((agent.lifetime_accepted / agent.lifetime_proposals) * 100).toFixed(0)}%` : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Created</span>
                  <span className="font-mono text-xs">{agent.created_at ? new Date(agent.created_at).toLocaleDateString() : '—'}</span>
                </div>
                {agent.parent_agent_id && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Parent</span>
                    <span className="font-mono text-xs">{agent.parent_agent_id}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Survival History (mini chart) */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" /> Survival History
              </h4>
              {perfHistory.length > 0 ? (
                <MiniChart data={perfHistory.map(p => p.survival_score)} />
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">No performance data yet</p>
              )}
              {perfHistory.length > 0 && (
                <div className="mt-2 text-xs text-gray-500 text-center">
                  {perfHistory.length} snapshots • Latest: {Math.round(perfHistory[perfHistory.length - 1]?.survival_score || 0)}/100
                </div>
              )}
            </div>
          </div>

          {/* Recent learnings */}
          {learnings.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-purple-500" /> Recent Evolution
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {learnings.slice(0, 8).map(l => {
                  const Icon = MUTATION_ICONS[l.mutation_type] || Zap
                  return (
                    <div key={l.id} className="flex items-start gap-2 text-sm">
                      <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-700">{l.description}</span>
                        <span className="text-xs text-gray-400 ml-2">{timeAgo(l.created_at)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Actions — disabled for future release */}
          <div className="flex items-center gap-2">
            <button
              disabled
              title="Future release"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-lg cursor-not-allowed opacity-60"
            >
              <FlaskConical className="w-4 h-4" />
              Force Mutate
              <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full ml-1">Soon</span>
            </button>
            <button
              disabled
              title="Future release"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-lg cursor-not-allowed opacity-60"
            >
              <Copy className="w-4 h-4" />
              Clone DNA
              <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full ml-1">Soon</span>
            </button>
            <button
              disabled
              title="Future release"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-lg cursor-not-allowed opacity-60"
            >
              <Skull className="w-4 h-4" />
              Retire
              <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full ml-1">Soon</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


function MiniChart({ data }: { data: number[] }) {
  if (data.length < 2) return <p className="text-sm text-gray-400 text-center py-4">Need 2+ data points</p>
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const h = 60
  const w = 200
  const step = w / (data.length - 1)

  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h + 4}`} className="w-full" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke="#6366f1"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={h - ((v - min) / range) * h}
          r="2.5"
          fill={v >= 60 ? '#10b981' : v >= 30 ? '#f59e0b' : '#ef4444'}
        />
      ))}
    </svg>
  )
}


function EvolutionTimeline({ events }: { events: EvolutionEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-lg">No evolution events yet</p>
        <p className="text-gray-400 text-sm mt-1 max-w-lg mx-auto">When Maestro runs content generation cycles, agents compete by proposing content. Their performance (views, engagement) determines which agents survive and evolve. Events like mutations, selections, and eliminations will appear here.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="space-y-1">
        {events.map(event => {
          const Icon = MUTATION_ICONS[event.mutation_type] || Zap
          const typeColors: Record<string, string> = {
            death: 'text-red-600 bg-red-50',
            spawn: 'text-emerald-600 bg-emerald-50',
            weight_shift: 'text-indigo-600 bg-indigo-50',
            temperature: 'text-amber-600 bg-amber-50',
            manual_mutation: 'text-purple-600 bg-purple-50',
          }
          const colorClass = typeColors[event.mutation_type] || 'text-gray-600 bg-gray-50'

          return (
            <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <div className={`p-1.5 rounded-lg flex-shrink-0 ${colorClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900">{event.agent_id}</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{event.mutation_type}</span>
                  <span className="text-xs text-gray-400">{event.trigger}</span>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{event.description}</p>
                {event.survival_score_at !== null && (
                  <span className="text-xs text-gray-400 mt-1">Survival at time: {Math.round(event.survival_score_at)}/100</span>
                )}
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">{timeAgo(event.created_at)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}


function GenePoolView({ entries }: { entries: GenePoolEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <Dna className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-lg">No archived DNA yet</p>
        <p className="text-gray-400 text-sm mt-1 max-w-lg mx-auto">When an agent performs exceptionally well, its strategy parameters (creativity level, risk tolerance, content style) are saved as 'DNA' in the gene pool. Future agents can inherit these proven strategies to improve content quality over time.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {entries.map(entry => (
        <div key={entry.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Dna className="w-4 h-4 text-indigo-500" />
              <span className="font-bold text-gray-900">{entry.source_agent_name}</span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              entry.reason === 'top_performer' ? 'bg-emerald-50 text-emerald-700'
              : entry.reason === 'retirement' ? 'bg-red-50 text-red-700'
              : 'bg-gray-100 text-gray-600'
            }`}>
              {entry.reason === 'top_performer' ? '🏆 Top Performer' : entry.reason === 'retirement' ? '💀 Retired' : entry.reason}
            </span>
          </div>

          <StrategyWeights weights={entry.strategy_weights} />

          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="text-center p-1 bg-gray-50 rounded">
              <p className="text-gray-500">Survival</p>
              <p className="font-bold">{Math.round(entry.survival_score)}</p>
            </div>
            <div className="text-center p-1 bg-gray-50 rounded">
              <p className="text-gray-500">Gen</p>
              <p className="font-bold">{entry.generation}</p>
            </div>
            <div className="text-center p-1 bg-gray-50 rounded">
              <p className="text-gray-500">Inherited</p>
              <p className="font-bold">{entry.times_inherited}×</p>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
            <span>Temp: {entry.temperature} • {entry.variant} • {entry.risk_tolerance}</span>
            <span>{timeAgo(entry.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}


function SystemHealthView({ report, onRefresh }: { report: DiagnosticReport | null; onRefresh: () => void }) {
  const [runningManual, setRunningManual] = useState(false)
  const [manualReport, setManualReport] = useState<DiagnosticReport | null>(null)
  const hasAutoRun = useRef(false)

  const displayReport = manualReport || report

  const handleRunNow = async () => {
    setRunningManual(true)
    try {
      const data = await post<{ report: DiagnosticReport }>('/api/agents/diagnostics/run', {})
      setManualReport(data.report)
      if (!hasAutoRun.current) hasAutoRun.current = true
      onRefresh()
    } catch {
      toast.error('Diagnostics run failed')
    }
    setRunningManual(false)
  }

  // Auto-run fresh diagnostics when tab is first opened
  useEffect(() => {
    if (!hasAutoRun.current) {
      hasAutoRun.current = true
      handleRunNow()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!displayReport) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <Stethoscope className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-lg">No diagnostics data yet</p>
        <p className="text-gray-400 text-sm mt-1 mb-4">Maestro runs self-tests every 4 hours, or run one now</p>
        <button
          onClick={handleRunNow}
          disabled={runningManual}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {runningManual ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stethoscope className="w-4 h-4" />}
          Run Diagnostics Now
        </button>
      </div>
    )
  }

  const statusConfig = {
    healthy: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-300', label: 'HEALTHY', icon: CheckCircle2 },
    degraded: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-300', label: 'DEGRADED', icon: AlertCircle },
    critical: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-300', label: 'CRITICAL', icon: XCircle },
  }
  const cfg = statusConfig[displayReport.status]
  const StatusIcon = cfg.icon

  return (
    <div className="space-y-4">
      {/* Overall status banner */}
      <div className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} p-6`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <StatusIcon className={`w-10 h-10 ${cfg.color}`} />
            <div>
              <h3 className={`text-2xl font-bold ${cfg.color}`}>{cfg.label}</h3>
              <p className="text-sm text-gray-600 mt-1">
                {displayReport.passed}/{displayReport.total_checks} checks passed •
                {displayReport.warnings > 0 && ` ${displayReport.warnings} warnings •`}
                {displayReport.failures > 0 && ` ${displayReport.failures} failures •`}
                {' '}{timeAgo(displayReport.created_at)}
              </p>
            </div>
          </div>
          <button
            onClick={handleRunNow}
            disabled={runningManual}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {runningManual ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stethoscope className="w-4 h-4" />}
            Run Now
          </button>
        </div>

        {/* System snapshot */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-4">
          <div className="bg-white/60 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Agents</p>
            <p className="text-lg font-bold">{displayReport.active_agents}</p>
          </div>
          <div className="bg-white/60 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Avg Survival</p>
            <p className="text-lg font-bold">{Math.round(displayReport.avg_survival_score)}</p>
          </div>
          <div className="bg-white/60 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Gene Pool</p>
            <p className="text-lg font-bold">{displayReport.gene_pool_size}</p>
          </div>
          <div className="bg-white/60 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Pending Jobs</p>
            <p className="text-lg font-bold">{displayReport.pending_jobs}</p>
          </div>
          <div className="bg-white/60 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Failed (24h)</p>
            <p className={`text-lg font-bold ${displayReport.failed_jobs_24h > 5 ? 'text-red-600' : ''}`}>{displayReport.failed_jobs_24h}</p>
          </div>
          <div className="bg-white/60 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Scheduled</p>
            <p className="text-lg font-bold">{displayReport.total_scheduled}</p>
          </div>
        </div>
      </div>

      {/* Individual checks */}
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        {displayReport.checks.map((check, i) => {
          const checkStatusIcon = check.status === 'pass' ? CheckCircle2 : check.status === 'warn' ? AlertCircle : XCircle
          const checkColor = check.status === 'pass' ? 'text-emerald-500' : check.status === 'warn' ? 'text-amber-500' : 'text-red-500'
          const CheckIcon = checkStatusIcon

          return (
            <div key={i} className="flex items-start gap-3 p-4">
              <CheckIcon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${checkColor}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-900">{check.name.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-gray-400">{check.duration_ms}ms</span>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{check.detail}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                check.status === 'pass' ? 'bg-emerald-50 text-emerald-700' :
                check.status === 'warn' ? 'bg-amber-50 text-amber-700' :
                'bg-red-50 text-red-700'
              }`}>
                {check.status.toUpperCase()}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}