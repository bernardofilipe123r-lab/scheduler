import {
  BarChart3, Clock, Zap, Target,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useAnswers } from '@/features/analytics'
import { AnalyticsSkeleton } from '@/shared/components'
import { EmptyState, CHART_BLUE, CHART_PURPLE, BAR_COLORS } from './analytics-utils'

export function AnswersTab({ brand }: { brand?: string }) {
  const { data, isLoading } = useAnswers({
    brand: brand !== 'all' ? brand : undefined,
    days: 90,
  })

  if (isLoading) return <AnalyticsSkeleton />
  if (!data?.has_data) {
    return (
      <EmptyState
        icon={<Zap className="w-12 h-12" />}
        title="Not enough data yet"
        description={data?.message || 'Publish at least 3 posts and wait for metrics to generate recommendations.'}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 text-lg mb-4">Answers Overview</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-blue-600 font-medium">Best time to post</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{data.best_time?.summary || '\u2014'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-xl">
            <div className="p-2 bg-purple-100 rounded-lg">
              <BarChart3 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-purple-600 font-medium">Best type of post</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5 capitalize">{data.best_type?.content_type || '\u2014'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-green-50 rounded-xl">
            <div className="p-2 bg-green-100 rounded-lg">
              <Target className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-green-600 font-medium">Best frequency</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">{data.best_frequency?.label || '\u2014'}</p>
            </div>
          </div>
        </div>
      </div>

      {data.by_day && data.by_day.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-1">Which day gets the most engagement?</h3>
          {data.best_time?.day && (
            <p className="text-sm mb-4">
              <span className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                <Zap className="w-4 h-4" /> {data.best_time.day.day}
              </span>
              <span className="text-gray-400 ml-2">
                Best day for engagement ({data.best_time.day.avg_engagement_rate}% avg ER)
              </span>
            </p>
          )}
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.by_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day_short" tick={{ fontSize: 12 }} stroke="#ccc" />
              <YAxis tick={{ fontSize: 11 }} stroke="#ccc" tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}%`, 'Avg Engagement']}
                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              />
              <Bar dataKey="avg_engagement_rate" radius={[4, 4, 0, 0]}>
                {data.by_day.map((_entry: unknown, i: number) => (
                  <Cell key={i} fill={CHART_BLUE} opacity={i === 0 ? 1 : 0.6} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.by_hour && data.by_hour.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-1">What time gets the most engagement?</h3>
          <p className="text-xs text-gray-400 mb-4">Average engagement rate by hour of day</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.by_hour}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="display" tick={{ fontSize: 10 }} stroke="#ccc" interval={1} />
              <YAxis tick={{ fontSize: 11 }} stroke="#ccc" tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}%`, 'Avg Engagement']}
                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              />
              <Bar dataKey="avg_engagement_rate" fill={CHART_PURPLE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.by_type && data.by_type.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-1">Which content type performs best?</h3>
          <p className="text-xs text-gray-400 mb-4">Average engagement rate by format</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.by_type} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="#ccc" tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="content_type" tick={{ fontSize: 12 }} stroke="#ccc" width={80} />
              <Tooltip
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}%`, 'Avg ER']}
                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              />
              <Bar dataKey="avg_engagement_rate" radius={[0, 4, 4, 0]}>
                {data.by_type.map((_entry: unknown, i: number) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.by_topic && data.by_topic.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-1">Top performing topics</h3>
          <p className="text-xs text-gray-400 mb-4">Which content topics get the highest engagement</p>
          <div className="space-y-2">
            {data.by_topic.slice(0, 8).map((t, i) => {
              const maxEr = Math.max(...data.by_topic!.map((x) => x.avg_engagement_rate), 1)
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-36 truncate capitalize">{t.topic.replace(/_/g, ' ')}</span>
                  <div className="flex-1 h-6 bg-gray-50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center px-2"
                      style={{
                        width: `${Math.max((t.avg_engagement_rate / maxEr) * 100, 8)}%`,
                        backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                      }}
                    >
                      <span className="text-xs font-medium text-white">{t.avg_engagement_rate.toFixed(1)}%</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 w-16 text-right">{t.post_count} posts</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
