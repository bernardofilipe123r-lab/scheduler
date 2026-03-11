import { useState } from 'react'
import { FlaskConical, CheckCircle2, ChevronDown, ChevronRight, Trophy } from 'lucide-react'
import { useTobyExperiments } from '../hooks'
import type { TobyExperiment } from '../types'

function formatType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function ExperimentRow({ exp, isExpanded, onToggle }: { exp: TobyExperiment; isExpanded: boolean; onToggle: () => void }) {
  const totalSamples = exp.samples_a + exp.samples_b
  const hasData = totalSamples > 0
  const leading = exp.mean_score_a >= exp.mean_score_b ? 'a' : 'b'

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        {isExpanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        }
        <span className="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">
          {formatType(exp.experiment_type)}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          {exp.winner && (
            <Trophy className="w-3.5 h-3.5 text-amber-500" />
          )}
          <span className="text-xs text-gray-400 tabular-nums w-16 text-right">
            {totalSamples} sample{totalSamples !== 1 ? 's' : ''}
          </span>
          {exp.confidence > 0 && (
            <span className={`text-xs font-medium tabular-nums w-10 text-right ${
              exp.confidence >= 0.9 ? 'text-emerald-600' : 'text-gray-400'
            }`}>
              {(exp.confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 pl-11">
          <div className="flex gap-2">
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
    <div className={`flex-1 rounded-lg px-3 py-2 border ${
      isWinner ? 'border-emerald-200 bg-emerald-50' :
      isLeading ? 'border-blue-100 bg-blue-50/50' :
      'border-gray-100 bg-gray-50'
    }`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {isWinner && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
        <span className="text-[11px] font-medium text-gray-400 uppercase">{label}</span>
      </div>
      <p className="text-xs font-semibold text-gray-900 truncate" title={value}>{value}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[11px] text-gray-400">{samples}×</span>
        {samples > 0 && <span className="text-[11px] font-medium text-gray-600">{score.toFixed(1)}</span>}
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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Experiments</h3>
          {active.length > 0 && (
            <span className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-full">
              {active.length} running
            </span>
          )}
        </div>
        {experiments.length > 0 && (
          <button
            onClick={expandAll}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expandedIds.size === experiments.length ? 'Collapse all' : 'Expand all'}
          </button>
        )}
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
        <div>
          {active.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Active</p>
              </div>
              {active.map(e => (
                <ExperimentRow
                  key={e.id}
                  exp={e}
                  isExpanded={expandedIds.has(e.id)}
                  onToggle={() => toggle(e.id)}
                />
              ))}
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 border-t border-gray-100">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Completed</p>
              </div>
              {completed.map(e => (
                <ExperimentRow
                  key={e.id}
                  exp={e}
                  isExpanded={expandedIds.has(e.id)}
                  onToggle={() => toggle(e.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
