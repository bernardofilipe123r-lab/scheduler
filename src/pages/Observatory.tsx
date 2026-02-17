import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Activity, Clock, CheckCircle2, XCircle,
  X, Server, Users, ChevronRight,
  History as HistoryIcon, FileText,
  Filter, Star,
} from 'lucide-react'
import { useAgents, type Agent } from '@/features/mission-control/api/useAgents'
import { useMaestroLive, type MaestroLiveStatus } from '@/features/mission-control/api/useMaestroLive'
import { AgentPodsGrid } from '@/features/mission-control/components/AgentPodsGrid'
import { calculateStats, formatElapsed } from '@/features/mission-control/utils/statsCalculator'
import {
  getCycleConfig, CYCLE_ORDER, OPERATION_DETAILS, CYCLE_KEYWORDS,
} from '@/features/mission-control/utils/cycleConfig'

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ObservatoryMode = 'overview' | 'countdown' | 'live' | 'recap' | 'history'

interface CycleInfo {
  interval_minutes?: number
  schedule?: string
  description: string
  last_run: string | null
  is_complete?: boolean
}

interface UpcomingOp {
  key: string
  label: string
  description: string
  nextRunMs: number
  nextRunLabel: string
  icon: typeof Clock
  colorClass: string
  dotColor: string
  isHighlight: boolean
}

interface WeekEntry {
  dayLabel: string
  time: string
  label: string
  icon: typeof Clock
  colorClass: string
  key: string
}

// ═══════════════════════════════════════════════════════════════
// COMPUTATION UTILITIES
// ═══════════════════════════════════════════════════════════════

function computeNextRunMs(key: string, cycle: CycleInfo, now: number, startedAt: number): number {
  if (key === 'daily_burst') {
    const lisbonNow = toLisbon(now)
    const target = new Date(lisbonNow)
    target.setHours(12, 0, 0, 0)
    if (lisbonNow >= target) target.setDate(target.getDate() + 1)
    return Math.max(0, target.getTime() - lisbonNow.getTime())
  }
  if (key === 'evolution') {
    const lisbonNow = toLisbon(now)
    const daysUntilSun = (7 - lisbonNow.getDay()) % 7 || 7
    const nextSun = new Date(lisbonNow)
    nextSun.setDate(lisbonNow.getDate() + daysUntilSun)
    nextSun.setHours(2, 0, 0, 0)
    if (lisbonNow.getDay() === 0 && lisbonNow.getHours() < 2) nextSun.setDate(lisbonNow.getDate())
    const diff = nextSun.getTime() - lisbonNow.getTime()
    return Math.max(0, diff > 0 ? diff : diff + 7 * 86400_000)
  }
  if (cycle.interval_minutes) {
    const base = cycle.last_run ? new Date(cycle.last_run).getTime() : startedAt
    return Math.max(0, (base + cycle.interval_minutes * 60_000) - now)
  }
  return Infinity
}

function toLisbon(ms: number): Date {
  return new Date(new Date(ms).toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }))
}

function computeUpcoming(
  cycles: Record<string, CycleInfo> | undefined,
  startedAt: string | null | undefined,
  now: number,
): UpcomingOp[] {
  if (!cycles) return []
  const started = startedAt ? new Date(startedAt).getTime() : now
  const allKeys = [
    ...CYCLE_ORDER.filter(k => cycles[k]),
    ...Object.keys(cycles).filter(k => !CYCLE_ORDER.includes(k)),
  ]
  return allKeys
    .filter(k => !(k === 'bootstrap' && cycles[k].is_complete))
    .map(key => {
      const cycle = cycles[key]
      const cfg = getCycleConfig(key)
      const nextRunMs = computeNextRunMs(key, cycle, now, started)
      let nextRunLabel = ''
      if (key === 'daily_burst') nextRunLabel = 'Daily @ 12:00 Lisbon'
      else if (key === 'evolution') nextRunLabel = 'Weekly Sun @ 2:00'
      else if (cycle.interval_minutes) {
        nextRunLabel = cycle.interval_minutes >= 60
          ? `Every ${cycle.interval_minutes / 60}h`
          : `Every ${cycle.interval_minutes}m`
      }
      return {
        key,
        label: cfg.label,
        description: cycle.description || key,
        nextRunMs,
        nextRunLabel,
        icon: cfg.icon,
        colorClass: cfg.colorClass,
        dotColor: cfg.dotColor,
        isHighlight: key === 'daily_burst',
      }
    })
    .sort((a, b) => a.nextRunMs - b.nextRunMs)
}

function computeWeekSchedule(now: number): WeekEntry[] {
  const items: WeekEntry[] = []
  const lisbonNow = toLisbon(now)
  for (let d = 1; d <= 6; d++) {
    const date = new Date(lisbonNow)
    date.setDate(lisbonNow.getDate() + d)
    const dayLabel = d === 1
      ? 'Tomorrow'
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    items.push({
      dayLabel,
      time: '12:00 PM Lisbon',
      label: 'Daily Burst',
      icon: getCycleConfig('daily_burst').icon,
      colorClass: getCycleConfig('daily_burst').colorClass,
      key: 'daily_burst',
    })
    if (date.getDay() === 0) {
      items.push({
        dayLabel,
        time: '2:00 AM',
        label: 'Evolution',
        icon: getCycleConfig('evolution').icon,
        colorClass: getCycleConfig('evolution').colorClass,
        key: 'evolution',
      })
    }
  }
  return items
}

function computeRecentOps(cycles: Record<string, CycleInfo> | undefined, now: number) {
  if (!cycles) return []
  return Object.entries(cycles)
    .filter(([, c]) => c.last_run)
    .map(([key, c]) => {
      const cfg = getCycleConfig(key)
      const diffMs = now - new Date(c.last_run!).getTime()
      return { key, label: cfg.label, icon: cfg.icon, colorClass: cfg.colorClass, dotColor: cfg.dotColor, diffMs, agoLabel: fmtAgo(diffMs), description: c.description }
    })
    .sort((a, b) => a.diffMs - b.diffMs)
    .slice(0, 8)
}

function detectActiveCycle(logs: any[]): string | null {
  console.log('🔄 detectActiveCycle called:', { 'logs type': typeof logs, 'logs is array': Array.isArray(logs), 'logs length': logs?.length })
  if (!logs || !logs.length) return null
  const text = logs.slice(0, 15).map(l => l.message.toLowerCase()).join(' ')
  for (const [key, keywords] of Object.entries(CYCLE_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) return key
  }
  return null
}

function detectMode(
  logs: any[],
  maestro: MaestroLiveStatus | undefined,
  upcoming: UpcomingOp[],
  forced: ObservatoryMode | null,
): ObservatoryMode {
  console.log('🎭 detectMode called:', {
    'logs type': typeof logs,
    'logs is array': Array.isArray(logs),
    'logs length': logs?.length,
    'upcoming type': typeof upcoming,
    'upcoming is array': Array.isArray(upcoming),
    'upcoming length': upcoming?.length,
    'maestro defined': maestro ? 'yes' : 'no',
    'maestro.current_phase': maestro?.current_phase
  })

  if (forced === 'history') return 'history'
  if (maestro?.current_phase) return 'live'

  if (logs && logs.length > 0) {
    const now = Date.now()
    const activityKw = [
      'generating', 'planning', 'saved:', 'examiner', 'auto-accepting',
      'burst', 'healing', 'publishing', 'scout', 'observe',
      'feedback', 'mutation', 'evolution', 'diagnostic', 'bootstrap',
    ]
    const recent = logs.filter(l => {
      const t = new Date(l.timestamp).getTime()
      if (t < now - 300_000) return false
      const m = l.message.toLowerCase()
      return activityKw.some(kw => m.includes(kw))
    })
    if (recent.length > 0) {
      const latest = Math.max(...recent.map((l: any) => new Date(l.timestamp).getTime()))
      if (now - latest < 30_000) return 'live'
      if (now - latest < 120_000) return 'recap'
    }
  }

  if (upcoming && upcoming.length > 0 && upcoming[0].nextRunMs > 0 && upcoming[0].nextRunMs <= 300_000) {
    return 'countdown'
  }
  return 'overview'
}

// Formatters
function fmtCountdown(ms: number): string {
  if (ms <= 0 || ms === Infinity) return '--'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${sec}s`
  return `${m}m ${sec}s`
}

function fmtCountdownLarge(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return {
    hours: Math.floor(s / 3600).toString().padStart(2, '0'),
    minutes: Math.floor((s % 3600) / 60).toString().padStart(2, '0'),
    seconds: (s % 60).toString().padStart(2, '0'),
  }
}

function fmtAgo(ms: number): string {
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false })
}

function logDotColor(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('error') || m.includes('failed')) return 'bg-red-400'
  if (m.includes('warning')) return 'bg-yellow-400'
  if (m.includes('accept') || m.includes('complete') || m.includes('saved:')) return 'bg-green-400'
  if (m.includes('generating') || m.includes('planning')) return 'bg-blue-400'
  if (m.includes('examiner')) return 'bg-indigo-400'
  if (m.includes('schedul')) return 'bg-emerald-400'
  return 'bg-gray-600'
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function ObservatoryPage() {
  const navigate = useNavigate()
  const [now, setNow] = useState(Date.now())
  const [forcedMode, setForcedMode] = useState<ObservatoryMode | null>(null)
  const [selectedOp, setSelectedOp] = useState<string | null>(null)
  const [startTime] = useState(Date.now())

  const { data: agentsData } = useAgents()
  const { data: maestro, isLoading: maestroLoading } = useMaestroLive()

  // Transform Maestro activity logs into user-friendly summaries
  const logs = useMemo(() => {
    const activity = maestro?.recent_activity || []

    // Background tasks that should be hidden during active content generation
    const isBackgroundMaintenance = (entry: any): boolean => {
      const { action, detail } = entry
      const text = `${action} ${detail}`.toLowerCase()

      return (
        text.includes('diagnostics') ||
        text.includes('metrics') ||
        text.includes('bootstrap') ||
        text.includes('observing') ||
        text.includes('learning') ||
        text.includes('consolidation') ||
        text.includes('scouting') ||
        text.includes('hashtag') ||
        text.includes('competitor') ||
        text.includes('own account')
      )
    }

    // Check if there's active content generation happening
    const hasActiveGeneration = activity.some(e =>
      e.action.includes('Generating') ||
      e.action.includes('Test Burst') ||
      e.action.includes('Smart Burst') ||
      e.action.includes('Phase')
    )

    // Filter out background tasks when content generation is active
    const filtered = hasActiveGeneration
      ? activity.filter(e => !isBackgroundMaintenance(e))
      : activity

    // Transform technical logs into plain English with context
    const transformMessage = (entry: any): string => {
      const { action, detail, emoji } = entry

      // Content Generation (what user cares about most)
      if (action.includes('Generating')) {
        const match = detail.match(/(\d+)\s+(light|dark|post)s?\s+(?:reels?|posts?)\s+for\s+(\w+)/)
        if (match) {
          const [, count, variant, brand] = match
          return `Creating ${count} ${variant === 'post' ? 'carousel post' : variant + ' reel'} for ${brand}`
        }
        return `Generating content: ${detail}`
      }

      if (action.includes('Done')) {
        const match = detail.match(/(\d+)\s+(?:reel|post)\s+proposals?/)
        if (match) {
          return `✓ Generated ${match[1]} proposal(s) - ready for review`
        }
        return `✓ ${detail}`
      }

      // System Health & Diagnostics
      if (action.includes('Diagnostics')) {
        if (detail.includes('HEALTHY')) {
          const match = detail.match(/(\d+)\s+pass/)
          return `System Health Check: All systems operational (${match ? match[1] : '9'} tests passed)`
        }
        return `Running system diagnostics...`
      }

      // Metrics Collection
      if (action.includes('Metrics')) {
        if (detail.includes('complete')) {
          return `Instagram Performance Analytics: Collected metrics for all brands`
        }
        if (detail.includes('Brand:')) {
          const brand = detail.match(/for\s+(\w+)/)?.[1]
          return `Analyzing ${brand} performance on Instagram...`
        }
        if (detail.includes('collection')) {
          const match = detail.match(/(\d+)\s+brands/)
          return `Collecting Instagram metrics for ${match ? match[1] : ''} brands to optimize content...`
        }
        return `Tracking content performance...`
      }

      // Trend Scouting
      if (action.includes('Scouting') || action.includes('Hashtag scan')) {
        if (detail.includes('hashtags:')) {
          const match = detail.match(/(\d+)\s+hashtags/)
          return `Discovering trending content (scanning ${match ? match[1] : ''} hashtags)`
        }
        return `Scanning Instagram trends to inspire better content...`
      }

      // Healing & Recovery
      if (action.includes('Healing')) {
        return `Auto-fixing failed jobs (smart retry system)`
      }

      // Feedback & Learning
      if (action.includes('Feedback') || action.includes('evolution')) {
        return `Learning from past performance to improve future content`
      }

      // Scheduling & Publishing
      if (action.includes('Schedul') || action.includes('Auto-accepting')) {
        return `Scheduling approved content for Instagram...`
      }

      if (action.includes('Publishing')) {
        return `Publishing content to Instagram...`
      }

      // Burst/Pause/Resume
      if (action.includes('burst') || action.includes('Burst')) {
        // Test Burst (user-requested specific content)
        if (action.includes('Test Burst')) {
          const reelsMatch = detail.match(/(\d+)\s+reels/)
          const postsMatch = detail.match(/(\d+)\s+posts/)
          const brandsMatch = detail.match(/for\s+([\w\s,]+)$/)

          const reels = reelsMatch ? parseInt(reelsMatch[1]) : 0
          const posts = postsMatch ? parseInt(postsMatch[1]) : 0
          const brands = brandsMatch ? brandsMatch[1] : 'selected brand(s)'

          const items = []
          if (reels > 0) items.push(`${reels} reel${reels > 1 ? 's' : ''}`)
          if (posts > 0) items.push(`${posts} post${posts > 1 ? 's' : ''}`)

          return `🧪 Test Mode: Creating ${items.join(' + ')} for ${brands}`
        }

        // Smart Burst (partial daily generation)
        if (action.includes('Smart Burst')) {
          const reelsMatch = detail.match(/(\d+)\s+reels/)
          const postsMatch = detail.match(/(\d+)\s+posts/)

          const reels = reelsMatch ? parseInt(reelsMatch[1]) : 0
          const posts = postsMatch ? parseInt(postsMatch[1]) : 0

          const items = []
          if (reels > 0) items.push(`${reels} reels`)
          if (posts > 0) items.push(`${posts} posts`)

          return `Generating remaining content for today: ${items.join(' + ')}`
        }

        // Full Daily Burst
        if (detail.includes('proposals') || detail.includes('Phase')) {
          return `Daily content generation: Creating proposals for all brands`
        }

        return detail
      }

      if (action.includes('PAUSED')) return `Maestro paused - no automatic content generation`
      if (action.includes('RESUMED')) return `Maestro resumed - automatic content generation enabled`

      // Default: use original with emoji
      return `${emoji} ${action}${detail ? `: ${detail}` : ''}`
    }

    return filtered.map((entry, idx) => ({
      id: idx,
      timestamp: entry.time,
      message: transformMessage(entry),
      level: entry.level === 'action' ? 'INFO' : 'DEBUG',
      category: 'app',
    }))
  }, [maestro?.recent_activity])

  const agents = agentsData?.agents || []

  // DEBUG LOGGING
  console.log('🔍 Observatory render:', {
    'logs type': typeof logs,
    'logs is array': Array.isArray(logs),
    'logs length': logs?.length,
    'logs value': logs,
    'agents type': typeof agents,
    'agents is array': Array.isArray(agents),
    'agents length': agents?.length,
    'maestro': maestro ? 'defined' : 'undefined',
    'agentsData': agentsData ? 'defined' : 'undefined'
  })

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const upcoming = useMemo(() => computeUpcoming(maestro?.cycles, maestro?.started_at, now), [maestro, now])
  const week = useMemo(() => computeWeekSchedule(now), [now])
  const recentOps = useMemo(() => computeRecentOps(maestro?.cycles, now), [maestro, now])
  const mode = useMemo(() => detectMode(logs, maestro, upcoming, forcedMode), [logs, maestro, upcoming, forcedMode])
  // Always use backend's current_phase as single source of truth
  const activeCycle = maestro?.current_phase || useMemo(() => detectActiveCycle(logs), [logs])

  console.log('🎯 About to call calculateStats:', {
    'logs': Array.isArray(logs) ? `array[${logs.length}]` : typeof logs,
    'agents': Array.isArray(agents) ? `array[${agents.length}]` : typeof agents
  })
  const stats = calculateStats(logs, startTime, agents)
  console.log('✅ calculateStats completed:', stats)

  useEffect(() => {
    if (forcedMode && forcedMode !== 'history' && mode !== forcedMode) setForcedMode(null)
  }, [mode, forcedMode])

  const isInitialLoad = maestroLoading && !maestro
  const nearestOp = upcoming[0] || null

  const statusLabel = mode === 'live' ? 'LIVE' : mode === 'recap' ? 'COMPLETE' : 'STANDBY'
  const statusDot = mode === 'live' ? 'bg-red-500' : mode === 'recap' ? 'bg-green-500' : 'bg-gray-600'
  const statusText = mode === 'live' ? 'text-red-400' : mode === 'recap' ? 'text-green-400' : 'text-gray-500'

  return (
    <div className="fixed inset-0 bg-gray-950 text-gray-100 overflow-hidden flex flex-col">
      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      {/* Scan line during live */}
      {mode === 'live' && (
        <motion.div
          className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent pointer-events-none z-10"
          animate={{ y: ['0vh', '100vh'] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* ── HEADER ── */}
      <header className="relative border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm z-20">
        <div className="max-w-[1600px] mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div>
              <h1 className="text-base font-semibold tracking-[0.15em] text-gray-200 font-mono">OBSERVATORY</h1>
              <p className="text-[10px] text-gray-600 font-mono tracking-wider">System Activity Monitor</p>
            </div>
            <div className="flex items-center gap-2">
              <motion.div
                className={`w-2 h-2 rounded-full ${statusDot}`}
                animate={mode === 'live' ? { opacity: [1, 0.3, 1] } : {}}
                transition={mode === 'live' ? { duration: 1.2, repeat: Infinity } : {}}
              />
              <span className={`text-[11px] font-mono font-semibold tracking-wider ${statusText}`}>{statusLabel}</span>
            </div>
            {mode === 'live' && activeCycle && (
              <span className="text-[11px] text-gray-500 font-mono">
                Phase: <span className="text-cyan-400">{activeCycle.toUpperCase()}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {mode !== 'history' ? (
              <button onClick={() => setForcedMode('history')} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-gray-500 hover:text-gray-300 font-mono rounded hover:bg-gray-800/50 transition-colors">
                <HistoryIcon className="w-3.5 h-3.5" /> History
              </button>
            ) : (
              <button onClick={() => setForcedMode(null)} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-cyan-400 font-mono rounded bg-gray-800/50 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Live
              </button>
            )}
            <div className="w-px h-4 bg-gray-800" />
            <button onClick={() => navigate('/ai-team')} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-gray-500 hover:text-gray-300 font-mono rounded hover:bg-gray-800/50 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> AI Team
            </button>
          </div>
        </div>
        {mode === 'overview' && nearestOp && (
          <div className="border-t border-gray-800/50 px-6 py-1.5">
            <p className="max-w-[1600px] mx-auto text-[11px] text-gray-600 font-mono">
              Next scheduled operation in <span className="text-gray-400">{fmtCountdown(nearestOp.nextRunMs)}</span>
              {' \u2014 '}<span className={nearestOp.colorClass}>{nearestOp.label}</span>
            </p>
          </div>
        )}
      </header>

      {/* ── CONTENT ── */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {isInitialLoad ? (
            <LoadingState key="load" />
          ) : mode === 'overview' ? (
            <OverviewMode key="ov" upcoming={upcoming} week={week} recentOps={recentOps} maestro={maestro} agents={agents} onSelectOp={setSelectedOp} />
          ) : mode === 'countdown' ? (
            <CountdownMode key="cd" op={nearestOp!} upcoming={upcoming} now={now} onSelectOp={setSelectedOp} />
          ) : mode === 'live' ? (
            <LiveMode key="lv" activeCycle={activeCycle} logs={logs} agents={agents} stats={stats} />
          ) : mode === 'recap' ? (
            <RecapMode key="rc" activeCycle={activeCycle} stats={stats} maestro={maestro} />
          ) : mode === 'history' ? (
            <HistoryMode key="hi" logs={logs} />
          ) : null}
        </AnimatePresence>
      </div>

      {/* ── OPERATION DETAIL MODAL ── */}
      <AnimatePresence>
        {selectedOp && <OperationModal opKey={selectedOp} onClose={() => setSelectedOp(null)} />}
      </AnimatePresence>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// LOADING STATE
// ═══════════════════════════════════════════════════════════════

function LoadingState() {
  return (
    <motion.div className="flex-1 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="text-center">
        <div className="relative w-20 h-20 mx-auto mb-6">
          <motion.div className="absolute inset-0 border border-gray-700 rounded-full" animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }} transition={{ duration: 2, repeat: Infinity }} />
          <motion.div className="absolute inset-2 border border-gray-600 rounded-full" animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.1, 0.6] }} transition={{ duration: 2, repeat: Infinity, delay: 0.3 }} />
          <div className="absolute inset-4 border border-gray-500 rounded-full flex items-center justify-center">
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
        </div>
        <p className="text-gray-500 font-mono text-xs tracking-[0.2em]">CONNECTING</p>
      </div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MODE 1: OVERVIEW — Default state
// ═══════════════════════════════════════════════════════════════

function OverviewMode({ upcoming, week, recentOps, maestro, agents, onSelectOp }: {
  upcoming: UpcomingOp[]
  week: WeekEntry[]
  recentOps: ReturnType<typeof computeRecentOps>
  maestro: MaestroLiveStatus | undefined
  agents: Agent[]
  onSelectOp: (key: string) => void
}) {
  return (
    <motion.div className="flex-1 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="max-w-[1400px] mx-auto px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Left column — Timeline + Recent */}
          <div className="lg:col-span-2 space-y-10">
            {/* Operations Timeline */}
            <section>
              <SectionHeader title="Operations Timeline" />
              <p className="text-xs text-gray-600 mb-5 font-mono">Next 24 hours — sorted by proximity</p>
              <div className="space-y-0">
                {upcoming.map((op, i) => {
                  const Icon = op.icon
                  const isLast = i === upcoming.length - 1
                  return (
                    <button
                      key={op.key}
                      onClick={() => onSelectOp(op.key)}
                      className="w-full flex items-start gap-4 text-left group hover:bg-gray-900/50 rounded-lg px-3 py-2.5 -mx-3 transition-colors"
                    >
                      {/* Tree connector */}
                      <div className="flex flex-col items-center pt-1">
                        <div className={`w-2 h-2 rounded-full ${op.dotColor}`} />
                        {!isLast && <div className="w-px flex-1 bg-gray-800 mt-1" />}
                      </div>
                      {/* Countdown */}
                      <div className="w-24 flex-shrink-0 pt-0.5">
                        <span className={`text-sm font-mono font-semibold tabular-nums ${op.nextRunMs <= 0 ? 'text-green-400' : op.nextRunMs <= 300_000 ? 'text-yellow-400' : 'text-gray-400'}`}>
                          {op.nextRunMs <= 0 ? 'now' : fmtCountdown(op.nextRunMs)}
                        </span>
                      </div>
                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-3.5 h-3.5 ${op.colorClass} flex-shrink-0`} />
                          <span className={`text-sm font-medium ${op.colorClass}`}>{op.label}</span>
                          {op.isHighlight && <Star className="w-3 h-3 text-amber-500 fill-amber-500 flex-shrink-0" />}
                          <span className="text-[10px] text-gray-600 font-mono ml-auto hidden sm:block">{op.nextRunLabel}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{op.description}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-500 flex-shrink-0 mt-1 transition-colors" />
                    </button>
                  )
                })}
              </div>
            </section>

            {/* This Week */}
            <section>
              <SectionHeader title="This Week" />
              <div className="space-y-0">
                {week.map((entry, i) => {
                  const Icon = entry.icon
                  const isLast = i === week.length - 1
                  return (
                    <div key={`${entry.key}-${i}`} className="flex items-start gap-4 px-3 py-1.5 -mx-3">
                      <div className="flex flex-col items-center pt-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${getCycleConfig(entry.key).dotColor} opacity-50`} />
                        {!isLast && <div className="w-px flex-1 bg-gray-800/50 mt-1" />}
                      </div>
                      <span className="w-20 text-xs text-gray-500 font-mono flex-shrink-0">{entry.dayLabel}</span>
                      <Icon className={`w-3 h-3 ${entry.colorClass} flex-shrink-0 mt-0.5 opacity-60`} />
                      <span className="text-xs text-gray-400">{entry.label}</span>
                      <span className="text-[10px] text-gray-600 font-mono ml-auto">{entry.time}</span>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Recent Activity */}
            {recentOps.length > 0 && (
              <section>
                <SectionHeader title="Recent Activity" />
                <div className="space-y-3">
                  {recentOps.map(op => {
                    const Icon = op.icon
                    return (
                      <div key={op.key} className="flex items-start gap-3 px-3 py-2 -mx-3 rounded-lg">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500/60 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Icon className={`w-3 h-3 ${op.colorClass} flex-shrink-0`} />
                            <span className="text-sm text-gray-300">{op.label} completed</span>
                            <span className="text-[10px] text-gray-600 font-mono ml-auto">{op.agoLabel}</span>
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">{op.description}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Operation Buttons */}
            <section>
              <SectionHeader title="Operation Details" />
              <p className="text-xs text-gray-600 mb-4 font-mono">Click any operation to learn how it works</p>
              <div className="flex flex-wrap gap-2">
                {CYCLE_ORDER.filter(k => maestro?.cycles?.[k]).map(key => {
                  const cfg = getCycleConfig(key)
                  const Icon = cfg.icon
                  return (
                    <button
                      key={key}
                      onClick={() => onSelectOp(key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded border border-gray-800 hover:border-gray-700 bg-gray-900/50 hover:bg-gray-800/50 transition-colors ${cfg.colorClass}`}
                    >
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </section>
          </div>

          {/* Right column — System Status */}
          <div className="space-y-6">
            <SystemPanel maestro={maestro} agents={agents} />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MODE 2: COUNTDOWN — Pre-launch state (<5 min)
// ═══════════════════════════════════════════════════════════════

function CountdownMode({ op, upcoming, onSelectOp }: {
  op: UpcomingOp
  upcoming: UpcomingOp[]
  now: number
  onSelectOp: (key: string) => void
}) {
  const ct = fmtCountdownLarge(op.nextRunMs)
  const Icon = op.icon
  const details = OPERATION_DETAILS[op.key]

  return (
    <motion.div className="flex-1 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="max-w-[800px] mx-auto px-8 py-12">
        {/* Status */}
        <p className="text-center text-[11px] text-gray-600 font-mono tracking-[0.2em] mb-2">OPERATION STARTING SOON</p>
        <div className="h-px bg-gray-800 mb-10" />

        {/* Large timer */}
        <div className="text-center mb-10">
          <div className="flex items-center gap-2 justify-center mb-4">
            <Icon className={`w-5 h-5 ${op.colorClass}`} />
            <h2 className={`text-lg font-semibold font-mono tracking-wide ${op.colorClass}`}>{op.label.toUpperCase()}</h2>
          </div>
          <div className="flex items-center justify-center gap-3 mb-3">
            <CountdownDigit value={ct.hours} label="HRS" />
            <span className="text-3xl text-gray-700 font-mono font-bold">:</span>
            <CountdownDigit value={ct.minutes} label="MIN" />
            <span className="text-3xl text-gray-700 font-mono font-bold">:</span>
            <CountdownDigit value={ct.seconds} label="SEC" />
          </div>
          <p className="text-xs text-gray-500">{op.description}</p>
        </div>

        <div className="h-px bg-gray-800 mb-8" />

        {/* Operation briefing */}
        {details && (
          <div className="mb-10">
            <h3 className="text-xs font-mono font-semibold text-gray-500 tracking-wider mb-4">OPERATION BRIEFING</h3>
            <p className="text-sm text-gray-400 mb-4">{details.purpose}</p>
            <h4 className="text-[11px] font-mono text-gray-600 tracking-wider mb-3">WHAT WILL HAPPEN</h4>
            <ol className="space-y-2">
              {details.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-xs text-gray-400">
                  <span className="text-gray-600 font-mono flex-shrink-0 w-4 text-right">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="flex gap-6 mt-4 text-[10px] text-gray-600 font-mono">
              <span>Frequency: {details.frequency}</span>
              <span>Duration: {details.duration}</span>
            </div>
          </div>
        )}

        <div className="h-px bg-gray-800 mb-8" />

        {/* Other upcoming */}
        <div>
          <h3 className="text-xs font-mono font-semibold text-gray-500 tracking-wider mb-3">OTHER UPCOMING</h3>
          {upcoming.slice(1, 5).map(u => {
            const UIcon = u.icon
            return (
              <button key={u.key} onClick={() => onSelectOp(u.key)} className="w-full flex items-center gap-3 py-2 text-left hover:bg-gray-900/50 rounded px-2 -mx-2 transition-colors">
                <span className="text-xs text-gray-500 font-mono tabular-nums w-20">{fmtCountdown(u.nextRunMs)}</span>
                <UIcon className={`w-3 h-3 ${u.colorClass}`} />
                <span className="text-xs text-gray-400">{u.label}</span>
                <span className="text-[10px] text-gray-600 font-mono ml-auto">{u.description}</span>
              </button>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MODE 3: LIVE — Active execution
// ═══════════════════════════════════════════════════════════════

function LiveMode({ activeCycle, logs, agents, stats }: {
  activeCycle: string | null
  logs: any[]
  agents: Agent[]
  stats: ReturnType<typeof calculateStats>
}) {
  const cfg = activeCycle ? getCycleConfig(activeCycle) : null
  const isBurst = activeCycle === 'daily_burst'
  const Icon = cfg?.icon || Activity

  return (
    <motion.div className="flex-1 flex flex-col overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Operation header */}
      <div className="px-6 py-3 border-b border-gray-800 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <motion.div className="w-2 h-2 bg-red-500 rounded-full" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
          <span className="text-xs text-red-400 font-mono font-semibold tracking-wider">LIVE</span>
        </div>
        {cfg && (
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${cfg.colorClass}`} />
            <span className={`text-sm font-semibold font-mono ${cfg.colorClass}`}>{cfg.label.toUpperCase()}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-6 text-[11px] text-gray-500 font-mono">
          {isBurst && (
            <>
              <span>Proposals: <span className="text-gray-300">{stats.total_proposals}</span></span>
              <span>Accepted: <span className="text-green-400">{stats.accepted}</span></span>
              <span>Jobs: <span className="text-purple-400">{stats.jobs_created}</span></span>
              <span>Scheduled: <span className="text-emerald-400">{stats.scheduled}</span></span>
            </>
          )}
          <span>Elapsed: <span className="text-gray-300">{formatElapsed(stats.elapsed_seconds)}</span></span>
        </div>
      </div>

      {/* Content area */}
      {isBurst ? (
        <>
          {/* Agent pods */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-[1400px] mx-auto">
              <h3 className="text-xs font-mono font-semibold text-gray-500 tracking-wider mb-4">AGENT ACTIVITY</h3>
              <AgentPodsGrid agents={agents} logs={logs} />
            </div>
          </div>
          {/* Activity log */}
          <div className="h-64 border-t border-gray-800">
            <ActivityLog logs={logs} />
          </div>
        </>
      ) : (
        <>
          {/* Generic live view with activity log */}
          <div className="flex-1 overflow-y-auto">
            <ActivityLog logs={logs} />
          </div>
        </>
      )}
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MODE 4: RECAP — Just completed (<2 min ago)
// ═══════════════════════════════════════════════════════════════

function RecapMode({ activeCycle, stats, maestro }: {
  activeCycle: string | null
  stats: ReturnType<typeof calculateStats>
  maestro: MaestroLiveStatus | undefined
}) {
  const cfg = activeCycle ? getCycleConfig(activeCycle) : null
  const isBurst = activeCycle === 'daily_burst'

  return (
    <motion.div className="flex-1 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="max-w-[800px] mx-auto px-8 py-12">
        {/* Complete banner */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full mb-4">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs font-mono font-semibold text-green-400 tracking-wider">COMPLETE</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-200 mb-1">
            {cfg?.label || 'Operation'} Complete
          </h2>
          <p className="text-xs text-gray-500">All tasks finished successfully</p>
        </div>

        <div className="h-px bg-gray-800 mb-8" />

        {/* Summary stats for burst */}
        {isBurst && stats.total_proposals > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-mono font-semibold text-gray-500 tracking-wider mb-4">PRODUCTION SUMMARY</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MiniStat label="Proposals" value={stats.total_proposals} color="text-blue-400" />
              <MiniStat label="Accepted" value={stats.accepted} color="text-green-400" />
              <MiniStat label="Rejected" value={stats.rejected} color="text-red-400" />
              <MiniStat label="Scheduled" value={stats.scheduled} color="text-emerald-400" />
            </div>
            {stats.total_proposals > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <span className="text-xs text-gray-500 font-mono">Acceptance Rate</span>
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-green-500 rounded-full" style={{ width: `${Math.round((stats.accepted / stats.total_proposals) * 100)}%` }} />
                </div>
                <span className="text-xs text-gray-300 font-mono">{Math.round((stats.accepted / stats.total_proposals) * 100)}%</span>
              </div>
            )}
          </div>
        )}

        {/* Today's production */}
        {maestro?.daily_config && (
          <div className="mb-8">
            <h3 className="text-xs font-mono font-semibold text-gray-500 tracking-wider mb-4">TODAY'S PRODUCTION</h3>
            <div className="grid grid-cols-2 gap-4">
              <ProductionBar label="Reels" current={maestro.daily_config.today_reels} target={maestro.daily_config.total_reels} />
              <ProductionBar label="Posts" current={maestro.daily_config.today_posts} target={maestro.daily_config.total_posts} />
            </div>
          </div>
        )}

        <div className="h-px bg-gray-800 mb-6" />

        <p className="text-center text-xs text-gray-600 font-mono">
          Returning to overview automatically...
        </p>
      </div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MODE 5: HISTORY — Deep archive
// ═══════════════════════════════════════════════════════════════

function HistoryMode({ logs }: { logs: any[] }) {
  const [filter, setFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    if (!logs) return []
    if (filter === 'all') return logs
    const keywords = CYCLE_KEYWORDS[filter]
    if (!keywords) return logs
    return logs.filter(l => {
      const m = l.message.toLowerCase()
      return keywords.some(kw => m.includes(kw))
    })
  }, [logs, filter])

  const filterOptions = [
    { key: 'all', label: 'All' },
    ...CYCLE_ORDER.map(k => ({ key: k, label: getCycleConfig(k).label })),
  ]

  return (
    <motion.div className="flex-1 flex flex-col overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Filters */}
      <div className="px-6 py-3 border-b border-gray-800 flex items-center gap-2 overflow-x-auto">
        <Filter className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
        {filterOptions.map(opt => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`px-3 py-1 text-[11px] font-mono rounded whitespace-nowrap transition-colors ${
              filter === opt.key ? 'bg-gray-800 text-gray-200' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {/* Logs */}
      <div className="flex-1 overflow-y-auto">
        <ActivityLog logs={filtered} />
      </div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════
// OPERATION DETAIL MODAL
// ═══════════════════════════════════════════════════════════════

function OperationModal({ opKey, onClose }: { opKey: string; onClose: () => void }) {
  const details = OPERATION_DETAILS[opKey]
  const cfg = getCycleConfig(opKey)
  const Icon = cfg.icon

  if (!details) {
    return (
      <ModalShell onClose={onClose}>
        <div className="text-center py-8">
          <p className="text-gray-500 font-mono text-sm">{cfg.label}</p>
          <p className="text-gray-600 text-xs mt-2">No detailed information available for this operation yet.</p>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center gap-3 mb-6">
        <div className={`p-2.5 rounded-lg bg-gray-800 ${cfg.colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-100">{details.title}</h2>
          <p className="text-xs text-gray-500">{details.subtitle}</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-[11px] font-mono font-semibold text-gray-500 tracking-wider mb-2">PURPOSE</h3>
          <p className="text-sm text-gray-300 leading-relaxed">{details.purpose}</p>
        </div>

        <div>
          <h3 className="text-[11px] font-mono font-semibold text-gray-500 tracking-wider mb-3">PROCESS</h3>
          <ol className="space-y-2">
            {details.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-gray-600 font-mono text-xs flex-shrink-0 w-5 text-right">{i + 1}.</span>
                <span className="text-sm text-gray-400">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="h-px bg-gray-800" />

        <div className="flex gap-8 text-xs text-gray-500">
          <div>
            <span className="text-[10px] font-mono text-gray-600 block mb-0.5">FREQUENCY</span>
            <span className="text-gray-400">{details.frequency}</span>
          </div>
          <div>
            <span className="text-[10px] font-mono text-gray-600 block mb-0.5">TYPICAL DURATION</span>
            <span className="text-gray-400">{details.duration}</span>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative bg-gray-900 border border-gray-800 rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto p-6"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1 text-gray-600 hover:text-gray-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
        {children}
      </motion.div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════

function ActivityLog({ logs }: { logs: any[] }) {
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [logs])

  const safeLength = logs?.length || 0

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-gray-800 px-6 py-2 flex items-center justify-between">
        <span className="text-[11px] font-mono text-gray-500 tracking-wider">ACTIVITY LOG</span>
        <span className="text-[10px] text-gray-600 font-mono">{safeLength} entries</span>
      </div>
      <div ref={feedRef} className="flex-1 overflow-y-auto px-6 py-3 space-y-0.5 font-mono text-xs">
        {!logs || logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600">
            <p className="text-xs font-mono">No activity in the last hour</p>
          </div>
        ) : (
          logs.map((log: any) => (
            <div key={log.id} className="flex items-start gap-3 py-1 hover:bg-gray-800/30 rounded px-2 -mx-2">
              <span className="text-gray-600 tabular-nums flex-shrink-0">{fmtTime(log.timestamp)}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${logDotColor(log.message)} flex-shrink-0 mt-1.5`} />
              <span className="text-gray-400 flex-1 break-words">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function SystemPanel({ maestro, agents }: { maestro: MaestroLiveStatus | undefined; agents: Agent[] }) {
  const activeAgents = agents.filter(a => a.active).length

  return (
    <div className="space-y-6">
      {/* System Status */}
      <div>
        <SectionHeader title="System Status" />
        <div className="space-y-3 mt-4">
          <StatusRow icon={Server} label="Maestro" value={maestro?.is_running ? (maestro.is_paused ? 'PAUSED' : 'ONLINE') : 'OFFLINE'}
            color={maestro?.is_running && !maestro.is_paused ? 'text-green-400' : maestro?.is_paused ? 'text-yellow-400' : 'text-red-400'} />
          {maestro?.uptime_human && <StatusRow icon={Clock} label="Uptime" value={maestro.uptime_human} color="text-gray-400" />}
          <StatusRow icon={Users} label="Agent Fleet" value={`${activeAgents}/${agents.length}`} color="text-gray-300" />
        </div>
      </div>

      {/* Today's Production */}
      {maestro?.daily_config && (
        <div>
          <SectionHeader title="Today's Production" />
          <div className="space-y-3 mt-4">
            <ProductionBar label="Reels" current={maestro.daily_config.today_reels} target={maestro.daily_config.total_reels} />
            <ProductionBar label="Posts" current={maestro.daily_config.today_posts} target={maestro.daily_config.total_posts} />
          </div>
        </div>
      )}

      {/* Lifetime */}
      {maestro?.proposal_stats && (
        <div>
          <SectionHeader title="Lifetime" />
          <div className="space-y-3 mt-4">
            <StatusRow icon={FileText} label="Proposals" value={maestro.proposal_stats.total.toString()} color="text-gray-300" />
            <StatusRow icon={CheckCircle2} label="Accepted" value={maestro.proposal_stats.accepted.toString()} color="text-green-400" />
            <StatusRow icon={XCircle} label="Rejected" value={maestro.proposal_stats.rejected.toString()} color="text-red-400" />
          </div>
        </div>
      )}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-[11px] font-mono font-semibold text-gray-500 tracking-[0.15em] uppercase">{title}</h3>
  )
}

function StatusRow({ icon: Icon, label, value, color }: { icon: typeof Clock; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-gray-900/50 border border-gray-800/50 rounded-lg">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-gray-600" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <span className={`text-xs font-mono font-semibold ${color}`}>{value}</span>
    </div>
  )
}

function ProductionBar({ label, current, target }: { label: string; current: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
  const full = pct >= 100

  return (
    <div className={`py-2.5 px-3 border rounded-lg ${full ? 'border-green-500/20 bg-green-500/5' : 'border-gray-800/50 bg-gray-900/50'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-500">{label}</span>
        <span className={`text-xs font-mono font-semibold ${full ? 'text-green-400' : 'text-gray-300'}`}>{current}/{target}</span>
      </div>
      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${full ? 'bg-green-500' : 'bg-cyan-500'}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800/50 rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold font-mono tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-600 font-mono mt-1">{label}</div>
    </div>
  )
}

function CountdownDigit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 min-w-[70px] text-center">
        <span className="text-4xl font-bold text-gray-200 font-mono tabular-nums">{value}</span>
      </div>
      <span className="text-[9px] text-gray-600 font-mono mt-1 tracking-widest">{label}</span>
    </div>
  )
}
