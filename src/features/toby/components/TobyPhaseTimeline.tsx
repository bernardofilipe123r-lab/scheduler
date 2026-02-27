import { Fragment, useMemo } from 'react'
import {
  Shield, Zap, Sparkles, Clock, CheckCircle2, ArrowRight,
  Target, Calendar, TrendingUp, Lock,
} from 'lucide-react'
import { useTobyStatus } from '../hooks'
import type { TobyPhase } from '../types'

const PHASES: Array<{
  id: TobyPhase
  label: string
  icon: typeof Shield
  color: string
  bgColor: string
  ringColor: string
  iconBg: string
  progressColor: string
  tagBg: string
  tagText: string
}> = [
  {
    id: 'bootstrap',
    label: 'Bootstrap',
    icon: Shield,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    ringColor: 'ring-violet-200',
    iconBg: 'bg-violet-100',
    progressColor: 'bg-violet-500',
    tagBg: 'bg-violet-100',
    tagText: 'text-violet-700',
  },
  {
    id: 'learning',
    label: 'Learning',
    icon: Zap,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    ringColor: 'ring-blue-200',
    iconBg: 'bg-blue-100',
    progressColor: 'bg-blue-500',
    tagBg: 'bg-blue-100',
    tagText: 'text-blue-700',
  },
  {
    id: 'optimizing',
    label: 'Optimizing',
    icon: Sparkles,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    ringColor: 'ring-emerald-200',
    iconBg: 'bg-emerald-100',
    progressColor: 'bg-emerald-500',
    tagBg: 'bg-emerald-100',
    tagText: 'text-emerald-700',
  },
]

function formatDays(d: number): string {
  if (d < 1) return 'less than a day'
  if (d === 1) return '1 day'
  return `${Math.round(d)} days`
}

function formatUptime(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.floor(hours / 24)
  const h = Math.round(hours % 24)
  return h > 0 ? `${days}d ${h}h` : `${days}d`
}

export function TobyPhaseTimeline() {
  const { data: status, isLoading } = useTobyStatus()

  const progress = status?.phase_progress
  const currentPhaseIdx = useMemo(
    () => PHASES.findIndex(p => p.id === status?.phase),
    [status?.phase],
  )

  if (isLoading) return <TimelineSkeleton />
  if (!status?.enabled || !progress) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Accent bar showing overall journey progress */}
      <div className="h-1.5 bg-gray-100">
        <div
          className="h-full bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-500 transition-all duration-1000"
          style={{ width: `${Math.max(5, ((currentPhaseIdx + progress.overall_progress) / 3) * 100)}%` }}
        />
      </div>

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Phase Progression</h2>
          </div>
          <div className="flex items-center gap-3">
            {progress.uptime_hours > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <Clock className="w-3 h-3" />
                Uptime: {formatUptime(progress.uptime_hours)}
              </span>
            )}
          </div>
        </div>

        {/* Phase cards */}
        <div className="flex items-start gap-2">
          {PHASES.map((phase, i) => {
            const isCurrent = phase.id === status.phase
            const isPast = i < currentPhaseIdx
            const isFuture = i > currentPhaseIdx
            const Icon = phase.icon

            return (
              <Fragment key={phase.id}>
                <div className={`flex-1 rounded-xl p-3.5 transition-all ${
                  isCurrent
                    ? `${phase.bgColor} ring-1 ${phase.ringColor}`
                    : isPast
                      ? 'bg-emerald-50/50'
                      : 'bg-gray-50'
                }`}>
                  {/* Phase header */}
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isCurrent ? phase.iconBg : isPast ? 'bg-emerald-100' : 'bg-gray-100'
                    }`}>
                      {isPast ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : isFuture ? (
                        <Lock className="w-4 h-4 text-gray-300" />
                      ) : (
                        <Icon className={`w-4 h-4 ${phase.color}`} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold ${
                          isCurrent ? phase.color : isPast ? 'text-emerald-600' : 'text-gray-400'
                        }`}>
                          {phase.label}
                        </span>
                        {isCurrent && (
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full ${phase.tagBg} ${phase.tagText}`}>
                            Current
                          </span>
                        )}
                        {isPast && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-emerald-100 text-emerald-700">
                            Done
                          </span>
                        )}
                      </div>
                      {isCurrent && (
                        <span className="text-[10px] text-gray-500">
                          Day {Math.ceil(progress.days_in_phase)} of {
                            phase.id === 'bootstrap'
                              ? progress.requirements.min_days || 7
                              : phase.id === 'learning'
                                ? progress.requirements.min_days || 30
                                : '∞'
                          }
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar for current phase */}
                  {isCurrent && (
                    <div className="mb-2.5">
                      <div className="h-2 bg-white/80 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${phase.progressColor} transition-all duration-700`}
                          style={{ width: `${Math.max(3, progress.overall_progress * 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-gray-500">
                          {Math.round(progress.overall_progress * 100)}% complete
                        </span>
                        {progress.estimated_days_remaining > 0 && (
                          <span className="text-[10px] text-gray-400">
                            ~{formatDays(progress.estimated_days_remaining)} left
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Requirements checklist for current phase */}
                  {isCurrent && phase.id === 'bootstrap' && (
                    <div className="space-y-1.5">
                      <RequirementRow
                        icon={Target}
                        label="Scored posts"
                        current={progress.requirements.scored_posts_current ?? 0}
                        target={progress.requirements.scored_posts_needed ?? 10}
                        color={phase.color}
                      />
                      <RequirementRow
                        icon={Calendar}
                        label="Days in phase"
                        current={Math.floor(progress.days_in_phase)}
                        target={progress.requirements.min_days ?? 7}
                        color={phase.color}
                      />
                    </div>
                  )}

                  {isCurrent && phase.id === 'learning' && (
                    <div className="space-y-1.5">
                      <RequirementRow
                        icon={Calendar}
                        label="Days in phase"
                        current={Math.floor(progress.days_in_phase)}
                        target={progress.requirements.min_days ?? 30}
                        color={phase.color}
                      />
                    </div>
                  )}

                  {isCurrent && phase.id === 'optimizing' && (
                    <p className="text-[11px] text-emerald-600 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" />
                      Running on proven strategies
                    </p>
                  )}

                  {/* Past phase summary */}
                  {isPast && (
                    <p className="text-[10px] text-emerald-600">Completed</p>
                  )}

                  {/* Future phase hint */}
                  {isFuture && (
                    <p className="text-[10px] text-gray-400">
                      {phase.id === 'learning' ? 'Unlocks after bootstrap' : 'Unlocks after learning'}
                    </p>
                  )}
                </div>

                {/* Connector */}
                {i < PHASES.length - 1 && (
                  <div className="flex items-center pt-5 shrink-0">
                    <ArrowRight className={`w-4 h-4 ${isPast ? 'text-emerald-300' : 'text-gray-200'}`} />
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function RequirementRow({ icon: Icon, label, current, target, color }: {
  icon: typeof Target; label: string; current: number; target: number; color: string
}) {
  const done = current >= target
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-3 h-3 shrink-0 ${done ? 'text-emerald-500' : 'text-gray-400'}`} />
      <span className="text-[11px] text-gray-600 flex-1 min-w-0 truncate">{label}</span>
      <span className={`text-[11px] font-semibold tabular-nums ${done ? 'text-emerald-600' : color}`}>
        {current}/{target}
      </span>
      {done && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
    </div>
  )
}

function TimelineSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="h-1.5 bg-gray-100" />
      <div className="p-5 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-36 mb-5" />
        <div className="flex gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex-1 h-32 bg-gray-50 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
