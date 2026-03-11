import { useState } from 'react'
import { FlaskConical, CheckCircle2, ChevronDown, ChevronRight, Trophy } from 'lucide-react'
import { useTobyExperiments } from '../hooks'
import type { TobyExperiment } from '../types'

function formatType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatVariant(value: string) {
  return value.replace(/_/g, ' ')
}

function getConfidenceTone(confidence: number) {
  if (confidence >= 0.9) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (confidence >= 0.6) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

function MetaBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'success' | 'info' }) {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : tone === 'info'
        ? 'bg-blue-50 text-blue-700 border-blue-200'
        : 'bg-gray-50 text-gray-600 border-gray-200'

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass}`}>
      {children}
    </span>
  )
}

function ExperimentRow({ exp, isExpanded, onToggle }: { exp: TobyExperiment; isExpanded: boolean; onToggle: () => void }) {
  const totalSamples = exp.samples_a + exp.samples_b
  const hasData = totalSamples > 0
  const leading = exp.mean_score_a >= exp.mean_score_b ? 'a' : 'b'

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        onClick={onToggle}
        className="w-full px-4 py-4 text-left transition-colors hover:bg-gray-50/80 sm:px-5"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-400">
            {isExpanded
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />
            }
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-start gap-2">
              <h4 className="min-w-0 flex-1 text-sm font-semibold leading-6 text-gray-900 [overflow-wrap:anywhere]">
                {formatType(exp.experiment_type)}
              </h4>

              {exp.winner && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                  <Trophy className="h-3.5 w-3.5" />
                  Winner selected
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <MetaBadge tone="info">{exp.status}</MetaBadge>
              <MetaBadge>{totalSamples} total sample{totalSamples !== 1 ? 's' : ''}</MetaBadge>
              <MetaBadge tone={exp.confidence >= 0.9 ? 'success' : 'neutral'}>
                {exp.confidence > 0 ? `${(exp.confidence * 100).toFixed(0)}% confidence` : 'No confidence yet'}
              </MetaBadge>
            </div>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-4 sm:px-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <VariantPill
              label="A"
              value={exp.variant_a}
              samples={exp.samples_a}
              score={exp.mean_score_a}
              isWinner={exp.winner === exp.variant_a}
              isLeading={hasData && leading === 'a' && !exp.winner}
            />
            <VariantPill
              label="B"
              value={exp.variant_b}
              samples={exp.samples_b}
              score={exp.mean_score_b}
              isWinner={exp.winner === exp.variant_b}
              isLeading={hasData && leading === 'b' && !exp.winner}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function VariantPill({ label, value, samples, score, isWinner, isLeading }: {
  label: string; value: string; samples: number; score: number; isWinner: boolean; isLeading: boolean
}) {
  return (
    <div className={`min-w-0 rounded-2xl border px-4 py-4 ${
      isWinner ? 'border-emerald-200 bg-emerald-50' :
      isLeading ? 'border-blue-200 bg-blue-50/60' :
      'border-gray-200 bg-gray-50/80'
    }`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
          Variant {label}
        </span>
        {isWinner && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Winner
          </span>
        )}
        {!isWinner && isLeading && (
          <span className="inline-flex items-center rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700">
            Leading
          </span>
        )}
      </div>

      <p
        className="text-sm font-semibold leading-6 text-gray-900 [overflow-wrap:anywhere]"
        title={value}
      >
        {formatVariant(value)}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600">
          {samples} sample{samples !== 1 ? 's' : ''}
        </span>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${getConfidenceTone(samples > 0 ? 0.9 : 0)}`}>
          {samples > 0 ? `${score.toFixed(1)} avg` : '0.0 avg'}
        </span>
      </div>
    </div>
  )
}

export function TobyExperiments() {
  const { data, isLoading } = useTobyExperiments()
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="h-5 skeleton rounded w-36 mb-4" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 skeleton rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const experiments = data?.experiments || []
  const active = experiments.filter(e => e.status === 'active')
  const completed = experiments.filter(e => e.status === 'completed')

  const toggle = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const expandAll = () => {
    if (expandedIds.size === experiments.length) {
      setExpandedIds(new Set())
    } else {
      setExpandedIds(new Set(experiments.map(e => e.id)))
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Experiments</h3>
              {active.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                  {active.length} running
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <MetaBadge>{experiments.length} total</MetaBadge>
              <MetaBadge tone="info">{active.length} active</MetaBadge>
              <MetaBadge tone="success">{completed.length} completed</MetaBadge>
            </div>
          </div>

          {experiments.length > 0 && (
            <button
              onClick={expandAll}
              className="text-left text-xs font-medium text-gray-500 transition-colors hover:text-gray-700 sm:text-right"
            >
              {expandedIds.size === experiments.length ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>
      </div>

      {experiments.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
            <FlaskConical className="w-6 h-6 text-indigo-400" />
          </div>
          <p className="text-sm font-medium text-gray-600 mb-1">No experiments yet</p>
          <p className="text-xs text-gray-400">Toby will automatically create A/B tests during the learning phase to find your best strategies.</p>
        </div>
      ) : (
        <div className="space-y-5 p-4 sm:p-5">
          {active.length > 0 && (
            <div className="space-y-3">
              <div className="px-1">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Active</p>
              </div>
              <div className="space-y-3">
                {active.map(e => (
                <ExperimentRow
                  key={e.id}
                  exp={e}
                  isExpanded={expandedIds.has(e.id)}
                  onToggle={() => toggle(e.id)}
                />
                ))}
              </div>
            </div>
          )}
          {completed.length > 0 && (
            <div className="space-y-3">
              <div className="px-1 pt-2">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Completed</p>
              </div>
              <div className="space-y-3">
                {completed.map(e => (
                <ExperimentRow
                  key={e.id}
                  exp={e}
                  isExpanded={expandedIds.has(e.id)}
                  onToggle={() => toggle(e.id)}
                />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
