import { useState } from 'react'
import {
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Eye,
  Heart,
  BarChart3,
} from 'lucide-react'
import type { InsightsResponse, ProposalStats } from '@/features/maestro/types'
import { getAgentMeta } from '@/features/maestro/constants'

interface InsightsPanelProps {
  insights: InsightsResponse | null
  stats: ProposalStats | null
  onRefresh: () => Promise<void>
}

export function InsightsPanel({
  insights, stats, onRefresh,
}: InsightsPanelProps) {
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await onRefresh()
    setRefreshing(false)
  }

  if (!insights || insights.error) {
    return (
      <div className="text-center py-16 text-gray-400">
        <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">No performance data yet</p>
        <p className="text-sm mt-1">Collect metrics from your published content first</p>
      </div>
    )
  }

  const { summary, top_performers, underperformers } = insights

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs text-gray-500">Tracked Posts</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{summary.total_tracked}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs text-gray-500">Avg Views</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {summary.avg_views >= 1000 ? `${(summary.avg_views / 1000).toFixed(1)}k` : Math.round(summary.avg_views)}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs text-gray-500">Avg Engagement</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{(summary.avg_engagement_rate * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs text-gray-500">Top Topic</div>
          <div className="text-lg font-bold text-gray-900 mt-1">{summary.top_topic || 'N/A'}</div>
        </div>
      </div>

      {/* Agent competition — acceptance rates */}
      {stats?.agents && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Agent Competition</h3>
          <div className={`grid gap-4 ${Object.keys(stats.agents).length <= 2 ? 'grid-cols-2' : Object.keys(stats.agents).length <= 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
            {Object.entries(stats.agents).map(([name, ag]) => {
              const meta = getAgentMeta(name)
              const AgIcon = meta.icon
              return (
                <div key={name} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${meta.gradient} flex items-center justify-center`}>
                      <AgIcon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <span className="font-bold text-gray-900">{meta.label}</span>
                      <span className="text-xs text-gray-400 ml-1">{meta.role}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold text-gray-900">{ag.total}</div>
                      <div className="text-[10px] text-gray-400">Total</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-green-600">{ag.accepted}</div>
                      <div className="text-[10px] text-gray-400">Accepted</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-orange-600">{ag.acceptance_rate}%</div>
                      <div className="text-[10px] text-gray-400">Win Rate</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top performers */}
      {top_performers.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            Top Performers
          </h3>
          <div className="space-y-2">
            {top_performers.map((perf, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-green-50/50 rounded-lg">
                <span className="text-sm font-bold text-green-600 w-6">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{perf.title}</p>
                  <p className="text-xs text-gray-500">{perf.brand} · {perf.topic_bucket || 'N/A'}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{perf.views >= 1000 ? `${(perf.views / 1000).toFixed(1)}k` : perf.views}</span>
                  <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{(perf.engagement_rate * 100).toFixed(1)}%</span>
                  <span className="font-mono font-bold text-green-600">{Math.round(perf.performance_score)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Underperformers */}
      {underperformers.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-amber-500" />
            Underperformers — agents can iterate on these
          </h3>
          <div className="space-y-2">
            {underperformers.map((perf, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-amber-50/30 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{perf.title}</p>
                  <p className="text-xs text-gray-500">{perf.brand} · {perf.topic_bucket || 'N/A'}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{perf.views >= 1000 ? `${(perf.views / 1000).toFixed(1)}k` : perf.views}</span>
                  <span className="font-mono text-amber-600">{Math.round(perf.performance_score)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
