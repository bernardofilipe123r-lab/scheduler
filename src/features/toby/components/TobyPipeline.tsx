import {
  CalendarCheck, BarChart3, Brain, Search, Clock,
  Sparkles, AlertTriangle, FlaskConical, Power, ArrowUpRight,
  Zap,
} from 'lucide-react'
import { useTobyStatus, useTobyActivity } from '../hooks'
import type { TobyActivityItem } from '../types'

const PIPELINE_STEPS = [
  {
    key: 'buffer_check',
    label: 'Content Generation',
    desc: 'Creates reels & carousels for empty calendar slots',
    icon: CalendarCheck,
  },
  {
    key: 'metrics_check',
    label: 'Performance Tracking',
    desc: 'Collects likes, views & engagement from published posts',
    icon: BarChart3,
  },
  {
    key: 'analysis_check',
    label: 'Strategy Analysis',
    desc: 'Scores content and updates strategy rankings',
    icon: Brain,
  },
  {
    key: 'discovery_check',
    label: 'Trend Discovery',
    desc: 'Scans Instagram for trending topics in your niche',
    icon: Search,
  },
]

function formatDuration(mins: number | undefined): string {
  if (mins === undefined || mins === null) return '—'
  if (mins < 1) return 'now'
  if (mins < 60) return `${Math.round(mins)}m`
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const MEANINGFUL = new Set([
  'content_generated', 'toby_enabled', 'toby_disabled', 'toby_reset',
  'error', 'phase_transition', 'experiment_created', 'experiment_completed',
  'auto_retry', 'discovery_seeded', 'publish_success', 'publish_partial',
])

function isMeaningful(item: TobyActivityItem): boolean {
  if (MEANINGFUL.has(item.action_type)) return true
  if (item.action_type === 'discovery_scan') {
    const match = (item.description || '').match(/discovered (\d+)/)
    return match ? parseInt(match[1]) > 0 : false
  }
  return false
}

const DISPLAY: Record<string, { icon: typeof Zap; color: string }> = {
  content_generated: { icon: Sparkles, color: 'text-blue-500' },
  toby_enabled: { icon: Power, color: 'text-emerald-500' },
  toby_disabled: { icon: Power, color: 'text-gray-400' },
  toby_reset: { icon: AlertTriangle, color: 'text-red-500' },
  error: { icon: AlertTriangle, color: 'text-red-500' },
  phase_transition: { icon: ArrowUpRight, color: 'text-emerald-500' },
  experiment_created: { icon: FlaskConical, color: 'text-indigo-500' },
  experiment_completed: { icon: FlaskConical, color: 'text-emerald-500' },
  auto_retry: { icon: Zap, color: 'text-amber-500' },
  discovery_seeded: { icon: Search, color: 'text-emerald-500' },
  discovery_scan: { icon: Search, color: 'text-amber-500' },
  publish_success: { icon: CalendarCheck, color: 'text-emerald-500' },
  publish_partial: { icon: AlertTriangle, color: 'text-amber-500' },
}

function humanize(item: TobyActivityItem): string {
  const meta = item.metadata as Record<string, unknown>
  switch (item.action_type) {
    case 'content_generated': {
      const count = meta?.count as number
      return count ? `Created ${count} piece${count > 1 ? 's' : ''} of content` : 'Created new content'
    }
    case 'auto_retry': {
      const n = meta?.retried as number
      return n ? `Retried ${n} failed post${n > 1 ? 's' : ''}` : 'Retried failed posts'
    }
    case 'discovery_scan': {
      const match = (item.description || '').match(/discovered (\d+)/)
      const count = match ? match[1] : '0'
      const sources = meta?.sources as Array<{ account?: string; hashtag?: string; count?: number }> | undefined
      if (sources && sources.length > 0) {
        const names = sources.slice(0, 3).map(s =>
          s.hashtag ? `#${s.hashtag}` : `@${s.account}`
        )
        return `Found ${count} trending items from ${names.join(', ')}${sources.length > 3 ? ` +${sources.length - 3} more` : ''}`
      }
      return match ? `Found ${count} trending items` : 'Scanned for trends'
    }
    case 'discovery_seeded':
      return item.description || 'Auto-discovered competitor accounts & hashtags'
    case 'publish_success': {
      const platforms = meta?.success_platforms as string[] | undefined
      const contentType = meta?.content_type as string | undefined
      if (platforms && platforms.length > 0) {
        return `Published ${contentType || 'content'} to ${platforms.join(', ')}`
      }
      return item.description || 'Published content successfully'
    }
    case 'publish_partial': {
      const ok = meta?.success_platforms as string[] | undefined
      const failed = meta?.failed_platforms as string[] | undefined
      if ((ok && ok.length > 0) || (failed && failed.length > 0)) {
        return `Partially published (${ok?.length || 0} ok, ${failed?.length || 0} failed)`
      }
      return item.description || 'Partial publish: some platforms failed'
    }
    case 'toby_enabled': return 'Toby was enabled'
    case 'toby_disabled': return 'Toby was disabled'
    case 'toby_reset': return 'All learnings were reset'
    case 'phase_transition': return item.description || 'Advanced to new phase'
    case 'error': return item.description || 'Something went wrong'
    default:
      return item.description || item.action_type
  }
}

export function TobyPipeline() {
  const { data: status } = useTobyStatus()
  const { data: activityData } = useTobyActivity({ limit: 50 })

  if (!status?.enabled) return null

  const current = status.live?.current_action
  const upcoming = status.live?.next_actions || []
  const items = (activityData?.items || []).filter(isMeaningful).slice(0, 8)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">What Toby's Doing</h2>
      </div>

      {/* Pipeline steps */}
      <div className="p-4 space-y-1">
        {PIPELINE_STEPS.map((step) => {
          const isRunning = current?.key === step.key && current?.status === 'due'
          const scheduled = upcoming.find(a => a.key === step.key)
          const minsUntil = scheduled?.minutes_until
          const Icon = step.icon

          return (
            <div key={step.key} className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
              isRunning ? 'bg-blue-50 ring-1 ring-blue-100' : 'hover:bg-gray-50'
            }`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                isRunning
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                  : 'bg-gray-100 text-gray-400'
              }`}>
                <Icon className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${isRunning ? 'text-blue-900' : 'text-gray-700'}`}>
                    {step.label}
                  </span>
                  {isRunning && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-100 text-blue-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      Running
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
              </div>

              <div className="shrink-0 text-right">
                {isRunning ? (
                  <span className="text-xs font-medium text-blue-600">Active</span>
                ) : minsUntil !== undefined ? (
                  <span className="text-xs text-gray-400 tabular-nums">in {formatDuration(minsUntil)}</span>
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Curated recent activity */}
      {items.length > 0 && (
        <>
          <div className="mx-5 border-t border-gray-100" />
          <div className="px-5 pt-3 pb-1">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent</h3>
          </div>
          <div className="px-2 pb-3">
            {items.map((item) => {
              const d = DISPLAY[item.action_type] || { icon: Clock, color: 'text-gray-400' }
              const Icon = d.icon
              const isError = item.action_type === 'error'
              return (
                <div key={item.id} className={`flex items-start gap-3 px-3 py-2 rounded-lg ${isError ? 'bg-red-50/50' : 'hover:bg-gray-50'}`}>
                  <Icon className={`w-4 h-4 ${d.color} shrink-0 mt-0.5`} />
                  <span className={`text-sm flex-1 ${isError ? 'text-red-700' : 'text-gray-600 truncate'}`}>{humanize(item)}</span>
                  <span className="text-[11px] text-gray-400 shrink-0 tabular-nums mt-0.5">{timeAgo(item.created_at)}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
