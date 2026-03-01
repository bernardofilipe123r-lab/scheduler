import { useMemo } from 'react'
import {
  Activity, Clock, CalendarCheck, BarChart3, Brain, Search,
  CheckCircle2, AlertCircle, Timer, Zap,
} from 'lucide-react'
import { useTobyStatus } from '../hooks'
import type { TobyTimestamps, TobyRecentTick } from '../types'

const CHECK_INTERVALS: Record<string, { label: string; icon: typeof Clock; intervalMin: number; color: string; bgColor: string }> = {
  buffer: { label: 'Buffer Fill', icon: CalendarCheck, intervalMin: 5, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  metrics: { label: 'Metrics', icon: BarChart3, intervalMin: 360, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  analysis: { label: 'Analysis', icon: Brain, intervalMin: 360, color: 'text-violet-600', bgColor: 'bg-violet-50' },
  discovery: { label: 'Discovery', icon: Search, intervalMin: 720, color: 'text-amber-600', bgColor: 'bg-amber-50' },
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never'
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 0) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function minutesUntilNext(dateStr: string | null, intervalMin: number): number | null {
  if (!dateStr) return 0 // due now
  const elapsed = (Date.now() - new Date(dateStr).getTime()) / 60000
  const remaining = intervalMin - elapsed
  return Math.max(0, Math.round(remaining))
}

function formatCountdown(mins: number | null): string {
  if (mins === null || mins === 0) return 'due now'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatInterval(mins: number): string {
  if (mins < 60) return `every ${mins}m`
  const h = mins / 60
  return `every ${h}h`
}

const TICK_DISPLAY: Record<string, { icon: typeof Zap; color: string; label: string }> = {
  content_generated: { icon: Zap, color: 'text-blue-500', label: 'Created content' },
  metrics_collected: { icon: BarChart3, color: 'text-emerald-500', label: 'Collected metrics' },
  analysis_completed: { icon: Brain, color: 'text-violet-500', label: 'Analyzed' },
  discovery_scan: { icon: Search, color: 'text-amber-500', label: 'Scanned trends' },
  discovery_seeded: { icon: Search, color: 'text-emerald-500', label: 'Seeds discovered' },
  publish_success: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Published' },
  publish_partial: { icon: AlertCircle, color: 'text-amber-500', label: 'Partial publish' },
  publish_failed: { icon: AlertCircle, color: 'text-red-500', label: 'Publish failed' },
  buffer_check_complete: { icon: CalendarCheck, color: 'text-blue-500', label: 'Buffer checked' },
  tick_start: { icon: Activity, color: 'text-gray-500', label: 'Tick started' },
  tick_complete: { icon: CheckCircle2, color: 'text-gray-500', label: 'Tick done' },
}

export function TobyTickMonitor() {
  const { data: status, isLoading } = useTobyStatus()

  const checks = useMemo(() => {
    if (!status?.timestamps) return []
    const ts: TobyTimestamps = status.timestamps
    const serverIntervals = status.intervals
    return [
      { key: 'buffer', lastAt: ts.last_buffer_check_at },
      { key: 'metrics', lastAt: ts.last_metrics_check_at },
      { key: 'analysis', lastAt: ts.last_analysis_at },
      { key: 'discovery', lastAt: ts.last_discovery_at },
    ].map(c => {
      const cfg = CHECK_INTERVALS[c.key]
      const intervalMin = serverIntervals?.[c.key as keyof typeof serverIntervals] ?? cfg.intervalMin
      const minsLeft = minutesUntilNext(c.lastAt, intervalMin)
      const isDue = minsLeft === 0
      return { ...c, ...cfg, intervalMin, minsLeft, isDue }
    })
  }, [status?.timestamps, status?.intervals])

  const ticks: TobyRecentTick[] = status?.recent_ticks ?? []

  if (isLoading) return <MonitorSkeleton />
  if (!status?.enabled) return null

  const live = status.live
  const isWorking = live?.current_action?.status === 'due'

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Operations Monitor</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
              isWorking
                ? 'bg-blue-50 text-blue-700'
                : 'bg-gray-50 text-gray-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                isWorking ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'
              }`} />
              {isWorking ? 'Active' : 'Idle'}
            </span>
          </div>
        </div>
      </div>

      {/* Check status grid */}
      <div className="p-4 grid grid-cols-2 gap-2">
        {checks.map(check => {
          const Icon = check.icon
          return (
            <div
              key={check.key}
              className={`rounded-xl p-3 transition-all ${
                check.isDue ? `${check.bgColor} ring-1 ring-inset ring-black/5` : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
                  check.isDue ? 'bg-white/80' : 'bg-white'
                }`}>
                  <Icon className={`w-3.5 h-3.5 ${check.isDue ? check.color : 'text-gray-400'}`} />
                </div>
                <span className={`text-xs font-semibold ${check.isDue ? check.color : 'text-gray-600'}`}>
                  {check.label}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-400">Last run</p>
                  <p className={`text-xs font-medium ${check.lastAt ? 'text-gray-700' : 'text-gray-400'}`}>
                    {timeAgo(check.lastAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400">Next in</p>
                  <p className={`text-xs font-semibold tabular-nums ${check.isDue ? check.color : 'text-gray-500'}`}>
                    {formatCountdown(check.minsLeft)}
                  </p>
                </div>
              </div>

              {/* Mini progress bar for countdown */}
              <div className="mt-2 h-1 bg-white/80 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    check.isDue ? check.color.replace('text-', 'bg-') : 'bg-gray-300'
                  }`}
                  style={{
                    width: `${check.minsLeft !== null
                      ? Math.max(3, 100 - (check.minsLeft / check.intervalMin) * 100)
                      : 100}%`,
                  }}
                />
              </div>
              <p className="text-[9px] text-gray-400 mt-1">{formatInterval(check.intervalMin)}</p>
            </div>
          )
        })}
      </div>

      {/* Recent operations timeline */}
      {ticks.length > 0 && (
        <>
          <div className="mx-5 border-t border-gray-100" />
          <div className="px-5 pt-3 pb-1 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Operations</h3>
              <span className="text-[10px] text-gray-400">{ticks.length} events</span>
            </div>
          </div>
          <div className="px-4 pb-3 flex-1 min-h-0 overflow-y-auto">
            {ticks.slice(0, 12).map((tick, i) => {
              const cfg = TICK_DISPLAY[tick.action_type] || { icon: Timer, color: 'text-gray-400', label: tick.action_type }
              const Icon = cfg.icon
              return (
                <div
                  key={tick.id || i}
                  className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.color}`} />
                  <span className="text-xs text-gray-600 flex-1 min-w-0 truncate">
                    {tick.description || cfg.label}
                  </span>
                  <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
                    {timeAgo(tick.created_at)}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function MonitorSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="h-4 skeleton rounded w-36" />
      </div>
      <div className="p-4 grid grid-cols-2 gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 skeleton rounded-xl" />
        ))}
      </div>
    </div>
  )
}
