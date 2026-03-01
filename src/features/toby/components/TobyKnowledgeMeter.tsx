import { useMemo } from 'react'
import { Brain, Sparkles, Shield, TrendingUp, CheckCircle2, ArrowRight } from 'lucide-react'
import { useTobyStatus } from '../hooks'
import type { TobyPhase } from '../types'

const PHASE_META: Record<TobyPhase, {
  label: string
  sublabel: string
  icon: typeof Brain
  color: string
  bg: string
  ring: string
  bar: string
  tagBg: string
  tagText: string
}> = {
  bootstrap: {
    label: 'Knowledge Base Building',
    sublabel: 'Collecting first data points to understand your audience',
    icon: Shield,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    ring: 'ring-violet-200',
    bar: 'bg-violet-500',
    tagBg: 'bg-violet-100',
    tagText: 'text-violet-700',
  },
  learning: {
    label: 'Pattern Recognition',
    sublabel: 'Identifying which content strategies resonate',
    icon: Brain,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    ring: 'ring-blue-200',
    bar: 'bg-blue-500',
    tagBg: 'bg-blue-100',
    tagText: 'text-blue-700',
  },
  optimizing: {
    label: 'Precision Mode',
    sublabel: 'Doubling down on statistically validated strategies',
    icon: Sparkles,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-200',
    bar: 'bg-emerald-500',
    tagBg: 'bg-emerald-100',
    tagText: 'text-emerald-700',
  },
}

const PHASES: TobyPhase[] = ['bootstrap', 'learning', 'optimizing']

function formatConfidence(c: number): string {
  return `${Math.round(c * 100)}%`
}

export function TobyKnowledgeMeter() {
  const { data: status, isLoading } = useTobyStatus()

  const progress = status?.phase_progress
  const currentPhaseIdx = useMemo(
    () => PHASES.indexOf(status?.phase ?? 'bootstrap'),
    [status?.phase],
  )

  if (isLoading) return <KnowledgeMeterSkeleton />
  if (!status?.enabled || !progress) return null

  const phase = status.phase
  const meta = PHASE_META[phase]
  const Icon = meta.icon
  const confidence = status.learning_confidence ?? 0
  const postsLearned = status.posts_learned_from ?? 0
  const topStrategies = status.current_top_strategies ?? []

  // Top 2 strategies for the "Toby is betting on" summary
  const topTwo = topStrategies.slice(0, 2)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Gradient progress bar across the top */}
      <div className="h-1.5 bg-gray-100">
        <div
          className="h-full bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-500 transition-all duration-1000"
          style={{ width: `${Math.max(3, ((currentPhaseIdx + progress.overall_progress) / 3) * 100)}%` }}
        />
      </div>

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta.bg}`}>
              <Icon className={`w-4.5 h-4.5 ${meta.color}`} style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900">{meta.label}</h2>
                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full ${meta.tagBg} ${meta.tagText}`}>
                  {phase}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{meta.sublabel}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{postsLearned}</p>
            <p className="text-[11px] text-gray-400">posts analyzed</p>
          </div>
        </div>

        {/* Phase cards — horizontal */}
        <div className="flex items-start gap-2 mb-5">
          {PHASES.map((p, i) => {
            const isCurrent = p === phase
            const isPast = i < currentPhaseIdx
            const isFuture = i > currentPhaseIdx
            const m = PHASE_META[p]
            const PIcon = m.icon

            return (
              <div key={p} className="flex items-center gap-2 flex-1">
                <div className={`flex-1 rounded-xl p-3 transition-all ${
                  isCurrent ? `${m.bg} ring-1 ${m.ring}` : isPast ? 'bg-emerald-50/60' : 'bg-gray-50'
                }`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                      isCurrent ? 'bg-white/80' : isPast ? 'bg-emerald-100' : 'bg-gray-100'
                    }`}>
                      {isPast ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : isFuture ? (
                        <PIcon className="w-3.5 h-3.5 text-gray-300" />
                      ) : (
                        <PIcon className={`w-3.5 h-3.5 ${m.color}`} />
                      )}
                    </div>
                    <span className={`text-[11px] font-bold ${
                      isCurrent ? m.color : isPast ? 'text-emerald-600' : 'text-gray-400'
                    }`}>
                      {m.label.split(' ')[0]}
                    </span>
                  </div>

                  {/* Progress bar for current phase */}
                  {isCurrent && (
                    <>
                      <div className="h-1.5 bg-white/80 rounded-full overflow-hidden mb-1">
                        <div
                          className={`h-full rounded-full ${m.bar} transition-all duration-700`}
                          style={{ width: `${Math.max(3, progress.overall_progress * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-500">
                        {Math.round(progress.overall_progress * 100)}% complete
                      </p>
                    </>
                  )}

                  {isCurrent && phase === 'bootstrap' && (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {progress.requirements.scored_posts_current ?? 0}/{progress.requirements.scored_posts_needed ?? 15} posts
                    </p>
                  )}

                  {isCurrent && phase === 'learning' && (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Strategy confidence: {formatConfidence(confidence)}
                    </p>
                  )}

                  {isCurrent && phase === 'optimizing' && (
                    <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" /> Running proven strategies
                    </p>
                  )}

                  {isPast && <p className="text-[10px] text-emerald-600 mt-0.5">Completed</p>}
                  {isFuture && <p className="text-[10px] text-gray-400 mt-0.5">Locked</p>}
                </div>
                {i < PHASES.length - 1 && (
                  <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${isPast ? 'text-emerald-300' : 'text-gray-200'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* What Toby is betting on */}
        <div className={`rounded-xl p-3 ${meta.bg} ring-1 ${meta.ring}`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className={`w-3.5 h-3.5 ${meta.color}`} />
            <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
              Toby is currently betting on
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {topTwo.length > 0 ? topTwo.map((s) => (
              <div key={s.dimension} className="group relative flex items-center gap-1.5 bg-white/80 rounded-lg px-2.5 py-1 border border-white shadow-sm">
                <span className="text-[10px] text-gray-400 capitalize">{s.dimension}:</span>
                <span className={`text-[11px] font-semibold ${meta.color} capitalize`}>
                  {s.value.replace(/_/g, ' ')}
                </span>
                <span className="text-[10px] text-gray-400">({s.avg_score.toFixed(0)} avg)</span>
                {s.sample_count > 0 && (
                  <span className="text-[9px] text-gray-300 ml-0.5">n={s.sample_count}</span>
                )}
                {/* Confidence tooltip */}
                {s.sample_count >= 3 && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                    <div className="bg-gray-900 text-white text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                      <div className="font-medium mb-0.5">Bayesian confidence</div>
                      <div>Score range: {Math.round(s.avg_score * 0.8)}–{Math.round(s.avg_score * 1.15)}</div>
                      <div>{s.sample_count} samples · {s.sample_count >= 10 ? 'High' : s.sample_count >= 5 ? 'Medium' : 'Low'} confidence</div>
                    </div>
                  </div>
                )}
              </div>
            )) : (
              <p className="text-[11px] text-gray-400">
                Still collecting data — {postsLearned === 0 ? 'no posts scored yet' : `${postsLearned} post${postsLearned !== 1 ? 's' : ''} analyzed so far`}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function KnowledgeMeterSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="h-1.5 skeleton" />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 skeleton rounded-xl" />
          <div>
            <div className="h-4 skeleton rounded w-40 mb-1.5" />
            <div className="h-3 skeleton rounded w-56" />
          </div>
        </div>
        <div className="flex gap-2 mb-5">
          {[...Array(3)].map((_, i) => <div key={i} className="flex-1 h-20 skeleton rounded-xl" />)}
        </div>
        <div className="h-14 skeleton rounded-xl" />
      </div>
    </div>
  )
}
