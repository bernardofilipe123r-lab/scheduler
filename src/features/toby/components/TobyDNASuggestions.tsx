import { Lightbulb, Check, X, Loader2, Sparkles } from 'lucide-react'
import { useTobyDNASuggestions, useResolveDNASuggestion } from '../hooks'
import type { TobyDNASuggestion } from '../types'

const DIMENSION_LABELS: Record<string, string> = {
  personality: 'Personality',
  topic: 'Topic',
  hook: 'Hook Strategy',
  title_format: 'Title Format',
  visual_style: 'Visual Style',
}

const TYPE_LABELS: Record<string, string> = {
  strategy_priority: 'Strategy Suggestion',
  topic_priority: 'Topic Focus',
}

function confidenceLabel(c: number): { text: string; color: string } {
  if (c >= 0.7) return { text: 'High', color: 'text-emerald-600 bg-emerald-50' }
  if (c >= 0.4) return { text: 'Medium', color: 'text-amber-600 bg-amber-50' }
  return { text: 'Low', color: 'text-gray-500 bg-gray-50' }
}

function SuggestionCard({ suggestion }: { suggestion: TobyDNASuggestion }) {
  const resolve = useResolveDNASuggestion()
  const evidence = suggestion.evidence as Record<string, unknown>
  const gap = typeof evidence?.gap_percentage === 'number' ? evidence.gap_percentage : null
  const conf = confidenceLabel(suggestion.confidence)
  const dimLabel = DIMENSION_LABELS[suggestion.dimension ?? ''] ?? suggestion.dimension
  const typeLabel = TYPE_LABELS[suggestion.recommendation_type] ?? suggestion.recommendation_type

  return (
    <div className="p-4 rounded-xl border border-violet-100 bg-violet-50/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-medium text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">
              {typeLabel}
            </span>
            {dimLabel && (
              <span className="text-[10px] font-medium text-gray-500">
                {dimLabel}
              </span>
            )}
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${conf.color}`}>
              {conf.text}
            </span>
          </div>

          {suggestion.recommendation_type === 'topic_priority' ? (
            <p className="text-xs text-gray-700 leading-relaxed">
              Focus more on <span className="font-medium text-emerald-700">{suggestion.suggested_value}</span>{' '}
              — they outperform{' '}
              <span className="font-medium text-red-600">{suggestion.current_value}</span>
              {gap !== null && <span className="text-gray-400"> ({gap}% gap)</span>}
            </p>
          ) : (
            <p className="text-xs text-gray-700 leading-relaxed">
              Try more <span className="font-medium text-emerald-700">{suggestion.suggested_value}</span>{' '}
              instead of{' '}
              <span className="font-medium text-red-600">{suggestion.current_value}</span>
              {gap !== null && <span className="text-gray-400"> ({gap}% gap)</span>}
            </p>
          )}

          {/* Evidence stats */}
          {typeof evidence?.best_avg_score === 'number' && (
            <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
              <span>Best: {(evidence.best_avg_score as number).toFixed(1)} ({evidence.best_sample_count as number}x)</span>
              <span>Worst: {(evidence.worst_avg_score as number).toFixed(1)} ({evidence.worst_sample_count as number}x)</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => resolve.mutate({ id: suggestion.id, action: 'accepted' })}
            disabled={resolve.isPending}
            className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center hover:bg-emerald-200 transition-colors disabled:opacity-50"
            title="Accept suggestion"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => resolve.mutate({ id: suggestion.id, action: 'dismissed' })}
            disabled={resolve.isPending}
            className="w-7 h-7 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center hover:bg-gray-200 transition-colors disabled:opacity-50"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function TobyDNASuggestions() {
  const { data, isLoading } = useTobyDNASuggestions()

  const suggestions = data?.suggestions ?? []

  // Don't render the card at all if no suggestions and not loading
  if (!isLoading && suggestions.length === 0) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Accent */}
      <div className="h-1 bg-gradient-to-r from-violet-400 to-fuchsia-400" />

      <div className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-gray-900">Toby&apos;s Suggestions</h2>
          {suggestions.length > 0 && (
            <span className="ml-auto text-[10px] font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {suggestions.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2.5">
            {suggestions.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
