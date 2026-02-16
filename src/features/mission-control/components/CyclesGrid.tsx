import { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Clock, Sparkles, Heart, Eye, Target, FlaskConical, Dna,
  Stethoscope, Zap, Send, CheckCircle2
} from 'lucide-react'
import type { MaestroLiveStatus } from '../api/useMaestroLive'

interface CycleInfo {
  interval_minutes?: number
  schedule?: string
  description: string
  last_run: string | null
  is_complete?: boolean
}

interface CycleItem {
  key: string
  label: string
  icon: typeof Clock
  color: string
  borderColor: string
  description: string
  nextRunMs: number | null
  nextRunLabel: string
  lastRun: string | null
  isComplete?: boolean
}

/* Display config for each known cycle — future cycles will get a fallback */
const CYCLE_DISPLAY: Record<string, { label: string; icon: typeof Clock; color: string; borderColor: string }> = {
  daily_burst:  { label: 'Daily Burst',            icon: Sparkles,     color: 'text-amber-400',   borderColor: 'border-amber-500/30' },
  check:        { label: 'Auto-Publish',            icon: Send,         color: 'text-blue-400',    borderColor: 'border-blue-500/30' },
  healing:      { label: 'Healing',                 icon: Heart,        color: 'text-pink-400',    borderColor: 'border-pink-500/30' },
  observe:      { label: 'Observe (Metrics)',        icon: Eye,          color: 'text-cyan-400',    borderColor: 'border-cyan-500/30' },
  scout:        { label: 'Scout (Trends)',           icon: Target,       color: 'text-emerald-400', borderColor: 'border-emerald-500/30' },
  feedback:     { label: 'Feedback (DNA Mutation)',  icon: FlaskConical, color: 'text-purple-400',  borderColor: 'border-purple-500/30' },
  evolution:    { label: 'Evolution (Selection)',    icon: Dna,          color: 'text-indigo-400',  borderColor: 'border-indigo-500/30' },
  diagnostics:  { label: 'Diagnostics',             icon: Stethoscope,  color: 'text-gray-400',    borderColor: 'border-gray-600' },
  bootstrap:    { label: 'Bootstrap (Cold-start)',   icon: Zap,          color: 'text-orange-400',  borderColor: 'border-orange-500/30' },
}

const CYCLE_ORDER = ['daily_burst', 'check', 'healing', 'bootstrap', 'observe', 'scout', 'feedback', 'diagnostics', 'evolution']

function computeCycleItems(
  cycles: Record<string, CycleInfo>,
  startedAt: string | null | undefined,
  now: number
): CycleItem[] {
  const started = startedAt ? new Date(startedAt).getTime() : now

  // Include all cycles from the API, ordered by CYCLE_ORDER first, then any extras
  const knownKeys = CYCLE_ORDER.filter(k => cycles[k])
  const extraKeys = Object.keys(cycles).filter(k => !CYCLE_ORDER.includes(k))
  const allKeys = [...knownKeys, ...extraKeys]

  return allKeys
    .filter(key => {
      const cycle = cycles[key]
      if (key === 'bootstrap' && cycle.is_complete) return false
      return true
    })
    .map(key => {
      const cycle = cycles[key]
      const display = CYCLE_DISPLAY[key] || {
        label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        icon: Clock,
        color: 'text-gray-400',
        borderColor: 'border-gray-600',
      }

      let nextRunMs: number | null = null
      let nextRunLabel = ''

      if (key === 'daily_burst') {
        const nowDate = new Date(now)
        const lisbonNow = new Date(nowDate.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }))
        const todayTarget = new Date(lisbonNow)
        todayTarget.setHours(12, 0, 0, 0)
        if (lisbonNow >= todayTarget) todayTarget.setDate(todayTarget.getDate() + 1)
        nextRunMs = todayTarget.getTime() - lisbonNow.getTime()
        nextRunLabel = 'Daily @ 12:00 Lisbon'
      } else if (key === 'evolution') {
        const nowDate = new Date(now)
        const lisbonNow = new Date(nowDate.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }))
        const daysUntilSunday = (7 - lisbonNow.getDay()) % 7 || 7
        const nextSun = new Date(lisbonNow)
        nextSun.setDate(lisbonNow.getDate() + daysUntilSunday)
        nextSun.setHours(2, 0, 0, 0)
        if (daysUntilSunday === 0 && lisbonNow.getHours() < 2) {
          nextSun.setDate(lisbonNow.getDate())
        }
        const diff = nextSun.getTime() - lisbonNow.getTime()
        nextRunMs = diff > 0 ? diff : diff + 7 * 24 * 3600 * 1000
        nextRunLabel = 'Weekly Sun @ 2:00'
      } else if (cycle.interval_minutes) {
        if (cycle.last_run) {
          const lastRun = new Date(cycle.last_run).getTime()
          nextRunMs = (lastRun + cycle.interval_minutes * 60 * 1000) - now
        } else {
          nextRunMs = (started + cycle.interval_minutes * 60 * 1000) - now
        }
        nextRunLabel = cycle.interval_minutes >= 60
          ? `Every ${cycle.interval_minutes / 60}h`
          : `Every ${cycle.interval_minutes}m`
      }

      if (nextRunMs !== null && nextRunMs < 0) nextRunMs = 0

      return {
        key,
        label: display.label,
        icon: display.icon,
        color: display.color,
        borderColor: display.borderColor,
        description: cycle.description,
        nextRunMs,
        nextRunLabel,
        lastRun: cycle.last_run,
        isComplete: cycle.is_complete,
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

interface CyclesGridProps {
  maestro: MaestroLiveStatus | undefined
  compact?: boolean
}

export function CyclesGrid({ maestro, compact }: CyclesGridProps) {
  const [now, setNow] = useState(Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(Date.now()), 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const items = useMemo(() => {
    if (!maestro?.cycles) return []
    return computeCycleItems(maestro.cycles, maestro.started_at, now)
  }, [maestro?.cycles, maestro?.started_at, now])

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600 font-mono text-sm">
        No cycle data available
      </div>
    )
  }

  return (
    <div className={compact ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'}>
      {items.map((item, idx) => {
        const Icon = item.icon
        const isImminent = item.nextRunMs !== null && item.nextRunMs <= 60_000
        const isRunning = item.nextRunMs === 0

        return (
          <motion.div
            key={item.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={`bg-gray-900 border rounded-lg p-3 transition-colors ${
              isRunning ? `${item.borderColor} bg-gray-800/80` :
              isImminent ? 'border-yellow-500/30 bg-gray-800/50' :
              'border-gray-800'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg bg-gray-800 flex-shrink-0 ${item.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-200 truncate">{item.label}</span>
                  <span className={`text-sm font-mono font-bold tabular-nums flex-shrink-0 ${
                    isRunning ? 'text-green-400' :
                    isImminent ? 'text-yellow-400' :
                    'text-gray-400'
                  }`}>
                    {isRunning ? (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        running
                      </span>
                    ) : formatCountdown(item.nextRunMs)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{item.description}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-gray-600 font-mono">{item.nextRunLabel}</span>
                  {item.lastRun && (
                    <span className="text-[10px] text-gray-600">last: {timeAgo(item.lastRun)}</span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
