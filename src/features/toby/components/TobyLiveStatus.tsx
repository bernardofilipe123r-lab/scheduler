import {
  Brain,
  Clock,
  BarChart3,
  Search,
  Sparkles,
  CalendarCheck,
  Moon,
  ChevronRight,
} from 'lucide-react'
import type { TobyStatus } from '../types'

const ACTION_VISUALS: Record<string, { icon: typeof Brain; gradient: string; pulse: string }> = {
  buffer_check: {
    icon: CalendarCheck,
    gradient: 'from-blue-500 to-indigo-600',
    pulse: 'bg-blue-400',
  },
  metrics_check: {
    icon: BarChart3,
    gradient: 'from-emerald-500 to-teal-600',
    pulse: 'bg-emerald-400',
  },
  analysis_check: {
    icon: Brain,
    gradient: 'from-violet-500 to-purple-600',
    pulse: 'bg-violet-400',
  },
  discovery_check: {
    icon: Search,
    gradient: 'from-amber-500 to-orange-600',
    pulse: 'bg-amber-400',
  },
  idle: {
    icon: Moon,
    gradient: 'from-gray-400 to-gray-500',
    pulse: 'bg-gray-300',
  },
}

const PIPELINE_STEPS = [
  { key: 'buffer_check', label: 'Buffer', icon: CalendarCheck },
  { key: 'metrics_check', label: 'Metrics', icon: BarChart3 },
  { key: 'analysis_check', label: 'Analysis', icon: Brain },
  { key: 'discovery_check', label: 'Discovery', icon: Search },
]

function formatMinutes(mins: number): string {
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const ACTIVITY_LABELS: Record<string, string> = {
  toby_enabled: 'Toby was activated',
  toby_disabled: 'Toby was deactivated',
  toby_reset: 'All learnings were reset',
  content_generated: 'Created new content',
  error: 'Encountered an issue',
  metrics_collected: 'Collected performance metrics',
  analysis_completed: 'Completed performance analysis',
  discovery_completed: 'Found new trending content',
  experiment_created: 'Started a new A/B test',
  phase_transition: 'Moved to a new phase',
}

export function TobyLiveStatus({ status }: { status: TobyStatus }) {
  const live = status.live
  const current = live?.current_action
  const nextActions = live?.next_actions || []
  const lastActivity = live?.last_activity

  if (!status.enabled) return null

  const visual = ACTION_VISUALS[current?.key || 'idle'] || ACTION_VISUALS.idle
  const CurrentIcon = visual.icon
  const isActive = current?.status === 'due'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Current action hero */}
      <div className="relative px-5 py-4">
        <div className="flex items-center gap-4">
          {/* Animated icon */}
          <div className="relative shrink-0">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${visual.gradient} flex items-center justify-center shadow-lg shadow-${current?.key === 'idle' ? 'gray' : 'blue'}-500/20`}>
              <CurrentIcon className="w-6 h-6 text-white" />
            </div>
            {isActive && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${visual.pulse} opacity-75`} />
                <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${visual.pulse}`} />
              </span>
            )}
          </div>

          {/* Status text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-bold text-gray-900">
                {isActive ? 'Working' : 'Idle'}
              </h3>
              {isActive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-blue-100 text-blue-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">{current?.description || 'Waiting for next scheduled task'}</p>
          </div>

          {/* Timer */}
          {!isActive && current?.minutes_until != null && (
            <div className="shrink-0 text-right">
              <p className="text-xs text-gray-400">Next action</p>
              <p className="text-lg font-bold text-gray-700 tabular-nums">{formatMinutes(current.minutes_until)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Pipeline visualization */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between">
          {PIPELINE_STEPS.map((step, i) => {
            const isDue = current?.key === step.key && isActive
            const isScheduled = nextActions.some(a => a.key === step.key)
            const scheduledAction = nextActions.find(a => a.key === step.key)
            const StepIcon = step.icon

            return (
              <div key={step.key} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    isDue
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 scale-110'
                      : isScheduled
                        ? 'bg-white text-gray-500 border border-gray-200'
                        : 'bg-gray-100 text-gray-300'
                  }`}>
                    <StepIcon className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-medium ${isDue ? 'text-blue-600' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                  {scheduledAction?.minutes_until != null && (
                    <span className="text-[9px] text-gray-400 -mt-0.5">
                      {formatMinutes(scheduledAction.minutes_until)}
                    </span>
                  )}
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 mx-2 mt-[-18px]" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Last activity */}
      {lastActivity && (
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-3">
          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <p className="text-xs text-gray-500 flex-1 min-w-0 truncate">
            <span className="font-medium text-gray-600">Last: </span>
            {ACTIVITY_LABELS[lastActivity.action_type] || lastActivity.description}
          </p>
          <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(lastActivity.created_at)}</span>
        </div>
      )}

      {/* Stats row */}
      {status.stats && (
        <div className="px-5 py-2.5 border-t border-gray-100 flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-gray-500"><span className="font-semibold text-gray-700">{status.stats.total_created}</span> created</span>
          </div>
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-gray-500"><span className="font-semibold text-gray-700">{status.stats.total_scored}</span> scored</span>
          </div>
        </div>
      )}
    </div>
  )
}
