import { FlaskConical, CheckCircle2 } from 'lucide-react'
import { useTobyExperiments } from '../hooks'
import type { TobyExperiment } from '../types'

function ExperimentCard({ exp }: { exp: TobyExperiment }) {
  const isActive = exp.status === 'active'
  const isCompleted = exp.status === 'completed'
  const totalSamples = exp.samples_a + exp.samples_b

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FlaskConical className={`w-4 h-4 ${isActive ? 'text-blue-500' : 'text-gray-400'}`} />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{exp.experiment_type}</span>
        </div>
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
          isActive ? 'bg-blue-100 text-blue-700' :
          isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {exp.status}
        </span>
      </div>

      {/* Variants comparison */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className={`rounded-lg p-3 border ${exp.winner === exp.variant_a ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100 bg-gray-50'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            {exp.winner === exp.variant_a && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
            <p className="text-xs font-medium text-gray-600">Variant A</p>
          </div>
          <p className="text-sm font-semibold text-gray-900 truncate">{exp.variant_a}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-gray-500">{exp.samples_a} samples</span>
            <span className="text-xs font-medium text-gray-700">{exp.mean_score_a.toFixed(1)} avg</span>
          </div>
        </div>
        <div className={`rounded-lg p-3 border ${exp.winner === exp.variant_b ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100 bg-gray-50'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            {exp.winner === exp.variant_b && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
            <p className="text-xs font-medium text-gray-600">Variant B</p>
          </div>
          <p className="text-sm font-semibold text-gray-900 truncate">{exp.variant_b}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-gray-500">{exp.samples_b} samples</span>
            <span className="text-xs font-medium text-gray-700">{exp.mean_score_b.toFixed(1)} avg</span>
          </div>
        </div>
      </div>

      {/* Progress / Confidence */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">{totalSamples} total samples</span>
        {exp.confidence > 0 && (
          <span className={`font-medium ${exp.confidence >= 0.9 ? 'text-emerald-600' : 'text-gray-500'}`}>
            {(exp.confidence * 100).toFixed(0)}% confidence
          </span>
        )}
      </div>
    </div>
  )
}

export function TobyExperiments() {
  const { data, isLoading } = useTobyExperiments()

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="h-5 bg-gray-100 rounded w-36 mb-4 animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-36 bg-gray-50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const experiments = data?.experiments || []
  const active = experiments.filter(e => e.status === 'active')
  const completed = experiments.filter(e => e.status === 'completed')

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Experiments</h3>
        {active.length > 0 && (
          <span className="text-xs text-blue-600 font-medium">{active.length} running</span>
        )}
      </div>

      {experiments.length === 0 ? (
        <div className="p-8 text-center text-gray-400">
          <FlaskConical className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No experiments yet. Toby auto-creates A/B tests during the learning phase.</p>
        </div>
      ) : (
        <div className="p-4">
          {active.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Active</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {active.map(e => <ExperimentCard key={e.id} exp={e} />)}
              </div>
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Completed</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {completed.map(e => <ExperimentCard key={e.id} exp={e} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
