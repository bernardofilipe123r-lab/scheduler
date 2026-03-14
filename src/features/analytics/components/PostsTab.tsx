import { useState } from 'react'
import {
  BarChart3, Eye, Heart,
  MessageCircle, Bookmark, Share2, Target, ArrowUpDown,
} from 'lucide-react'
import { usePosts } from '@/features/analytics'
import { AnalyticsSkeleton, PlatformIcon } from '@/shared/components'
import { fmt, EmptyState, CHART_GREEN, CHART_AMBER } from './analytics-utils'

export function PostsTab({ brand, days }: { brand?: string; days: number }) {
  const [sortBy, setSortBy] = useState('views')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const { data, isLoading, isFetching } = usePosts({
    brand: brand !== 'all' ? brand : undefined,
    sort_by: sortBy,
    sort_dir: sortDir,
    days,
    limit: 50,
  })

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  if (isLoading) return <AnalyticsSkeleton />
  if (!data || data.posts.length === 0) {
    return <EmptyState icon={<Eye className="w-12 h-12" />} title="No post data yet" description="Published posts with collected metrics will appear here." />
  }

  const s = data.summary

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <th
      className="px-4 py-3 font-medium text-right cursor-pointer hover:text-gray-700 transition-colors select-none"
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortBy === col && <ArrowUpDown className="w-3 h-3" />}
      </span>
    </th>
  )

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-gray-400 mb-3">Showing posts from the last {days} days &middot; {data.pagination.total} total</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Posts', value: s.total_posts, icon: <BarChart3 className="w-4 h-4" /> },
          { label: 'Views', value: s.total_views, icon: <Eye className="w-4 h-4" /> },
          { label: 'Likes', value: s.total_likes, icon: <Heart className="w-4 h-4" /> },
          { label: 'Comments', value: s.total_comments, icon: <MessageCircle className="w-4 h-4" /> },
          { label: 'Saves', value: s.total_saves, icon: <Bookmark className="w-4 h-4" /> },
          { label: 'Shares', value: s.total_shares, icon: <Share2 className="w-4 h-4" /> },
          { label: 'Avg ER', value: s.avg_engagement_rate, icon: <Target className="w-4 h-4" /> },
        ].map((item, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 px-4 py-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-gray-400 mb-1">{item.icon}<span className="text-xs">{item.label}</span></div>
            <p className="text-lg font-bold text-gray-900">
              {item.label === 'Avg ER' ? `${item.value.toFixed(1)}%` : fmt(item.value)}
            </p>
          </div>
        ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative">
        {isFetching && !isLoading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-100 overflow-hidden z-10">
            <div className="h-full w-1/3 bg-blue-500 rounded-full animate-[shimmer_1s_ease-in-out_infinite]" style={{ animation: 'pulse 1s ease-in-out infinite' }} />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wider text-left">
                <th className="px-4 py-3 font-medium">Post</th>
                <SortHeader col="views" label="Views" />
                <SortHeader col="likes" label="Likes" />
                <SortHeader col="comments" label="Comments" />
                <SortHeader col="saves" label="Saves" />
                <SortHeader col="shares" label="Shares" />
                <SortHeader col="engagement_rate" label="ER %" />
                <SortHeader col="performance_score" label="Score" />
              </tr>
            </thead>
            <tbody>
              {data.posts.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="max-w-xs" title={p.caption || p.title || ''}>
                      <p className="text-sm font-medium text-gray-900" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {p.title || p.caption || p.topic_bucket || p.content_type}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <PlatformIcon platform="instagram" className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                        <span className="text-xs text-gray-400 capitalize">{p.content_type}</span>
                        {p.topic_bucket && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{p.topic_bucket}</span>}
                        {p.published_at && <span className="text-xs text-gray-400">{new Date(p.published_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(p.views)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmt(p.likes)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmt(p.comments)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmt(p.saves)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmt(p.shares)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${(p.engagement_rate || 0) >= 5 ? 'text-green-600' : 'text-gray-700'}`}>
                      {p.engagement_rate?.toFixed(1) ?? '\u2014'}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(p.performance_score || 0, 100)}%`,
                            backgroundColor: (p.performance_score || 0) >= 80 ? CHART_GREEN : (p.performance_score || 0) >= 50 ? CHART_AMBER : '#EF4444',
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-600 w-8 text-right">{p.performance_score?.toFixed(0) ?? '\u2014'}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
