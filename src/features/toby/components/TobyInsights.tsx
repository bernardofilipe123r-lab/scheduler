import { Award, Lightbulb } from 'lucide-react'
import { useTobyInsights } from '../hooks'

export function TobyInsights() {
  const { data, isLoading } = useTobyInsights()

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="h-5 bg-gray-100 rounded w-24 mb-4 animate-pulse" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const dimensions = Object.entries(data.top_strategies || {})

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Insights</h3>
        <span className="text-xs text-gray-400">{data.total_scored_posts} posts scored</span>
      </div>

      {dimensions.length === 0 ? (
        <div className="p-8 text-center text-gray-400">
          <Lightbulb className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Insights will appear after Toby scores enough published posts.</p>
        </div>
      ) : (
        <div className="p-4 space-y-5">
          {dimensions.map(([dimension, strategies]) => (
            <div key={dimension}>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" />
                Best {dimension.replace(/_/g, ' ')}
              </p>
              <div className="space-y-1.5">
                {strategies.slice(0, 5).map((s, i) => {
                  const maxScore = strategies[0]?.mean_score || 1
                  const barWidth = maxScore > 0 ? (s.mean_score / maxScore) * 100 : 0

                  return (
                    <div key={s.strategy} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-medium text-gray-800 truncate">{s.strategy}</span>
                          <span className="text-xs font-semibold text-gray-600 ml-2">{s.mean_score.toFixed(1)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-emerald-400 transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{s.sample_count}x</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
