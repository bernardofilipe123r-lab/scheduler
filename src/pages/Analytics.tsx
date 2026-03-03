import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, Users, Eye, Heart, TrendingUp,
  RefreshCw, Clock,
  Filter, ChevronDown,
  ArrowUpRight, ArrowDownRight, Minus,
  Instagram, Facebook, Youtube, Zap, MessageCircle, MessageSquare,
  Bookmark, Share2, Target, ArrowUpDown, ExternalLink, Reply,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import {
  useAnalytics,
  useRefreshAnalytics,
  useRefreshStatus,
  useOverview,
  usePosts,
  useAnswers,
  useAudience,
  useRefreshAudience,
} from '@/features/analytics'
import { AnalyticsSkeleton } from '@/shared/components'
import { useDynamicBrands } from '@/features/brands'
import { get } from '@/shared/api'

// ─── Utility ────────────────────────────────────────────

function fmt(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toLocaleString()
}

function pctColor(pct: number) {
  if (pct > 0) return 'text-green-600'
  if (pct < 0) return 'text-red-500'
  return 'text-gray-400'
}

function PctBadge({ value }: { value: number }) {
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${pctColor(value)}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}

function ThreadsIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.29 3.276-.866 1.074-2.063 1.678-3.559 1.795-1.12.088-2.198-.154-3.04-.682-1.003-.63-1.607-1.593-1.7-2.716-.154-1.836 1.201-3.454 3.742-3.652.97-.076 1.867-.034 2.687.097-.065-.666-.217-1.195-.463-1.582-.396-.623-1.078-.948-2.022-.966-1.32.012-2.085.437-2.344.696l-1.386-1.57C7.57 6.573 9.003 5.88 11.068 5.862c1.47.013 2.65.497 3.508 1.44.78.857 1.234 2.017 1.35 3.453.478.18.916.404 1.31.675 1.191.818 2.065 2.03 2.52 3.502.628 2.028.478 4.537-1.36 6.336C16.65 22.97 14.59 23.975 12.186 24zm-1.638-7.283c-.078.003-.155.008-.232.015-1.26.098-1.905.701-1.862 1.22.02.233.156.567.589.838.49.308 1.14.446 1.833.388 1.116-.087 2.472-.633 2.716-3.136-.741-.142-1.544-.2-2.41-.2-.216 0-.43.006-.634.017v-.142z" />
    </svg>
  )
}

function TikTokIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.79a8.18 8.18 0 0 0 4.76 1.52V6.87a4.84 4.84 0 0 1-1-.18z" />
    </svg>
  )
}

function PlatformIcon({ platform, className = 'w-4 h-4' }: { platform: string; className?: string }) {
  switch (platform) {
    case 'instagram': return <Instagram className={className} />
    case 'facebook': return <Facebook className={className} />
    case 'youtube': return <Youtube className={className} />
    case 'threads': return <ThreadsIcon className={className} />
    case 'tiktok': return <TikTokIcon className={className} />
    default: return null
  }
}

// ─── Shared filter bar ──────────────────────────────────

function FilterBar({
  brands,
  selectedBrand,
  setSelectedBrand,
  selectedPlatform,
  setSelectedPlatform,
  timeRange,
  setTimeRange,
}: {
  brands: { value: string; label: string }[]
  selectedBrand: string
  setSelectedBrand: (v: string) => void
  selectedPlatform: string
  setSelectedPlatform: (v: string) => void
  timeRange: number
  setTimeRange: (v: number) => void
}) {
  const platforms = [
    { value: 'all', label: 'All Platforms' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'threads', label: 'Threads' },
    { value: 'tiktok', label: 'TikTok' },
  ]
  const times = [
    { value: '7', label: '7 days' },
    { value: '14', label: '14 days' },
    { value: '30', label: '30 days' },
    { value: '60', label: '60 days' },
    { value: '90', label: '90 days' },
  ]

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 text-gray-400">
        <Filter className="w-4 h-4" />
      </div>
      <div className="relative">
        <select
          value={selectedBrand}
          onChange={(e) => setSelectedBrand(e.target.value)}
          className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          {brands.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
      <div className="relative">
        <select
          value={selectedPlatform}
          onChange={(e) => setSelectedPlatform(e.target.value)}
          className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          {platforms.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
      <div className="relative">
        <select
          value={timeRange.toString()}
          onChange={(e) => setTimeRange(parseInt(e.target.value))}
          className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          {times.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  )
}

// ─── Summary stat card ──────────────────────────────────

function StatCard({
  label, value, change, icon, color,
}: {
  label: string
  value: number
  change?: number
  icon: React.ReactNode
  color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          {icon}
        </div>
        {change !== undefined && <PctBadge value={change} />}
      </div>
      <p className="text-2xl font-bold text-gray-900">{fmt(value)}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

// ─── Empty state ────────────────────────────────────────

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-gray-300 mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-700">{title}</h3>
      <p className="text-sm text-gray-400 mt-1 max-w-md">{description}</p>
    </div>
  )
}

// ─── CHART COLORS ───────────────────────────────────────

const CHART_BLUE = '#3B82F6'
const CHART_GREEN = '#10B981'
const CHART_PURPLE = '#8B5CF6'
const CHART_PINK = '#EC4899'
const CHART_AMBER = '#F59E0B'
const CHART_CYAN = '#06B6D4'
const BAR_COLORS = [CHART_BLUE, CHART_GREEN, CHART_PURPLE, CHART_PINK, CHART_AMBER, CHART_CYAN]

// ════════════════════════════════════════════════════════
//  TAB 1: OVERVIEW
// ════════════════════════════════════════════════════════

function OverviewTab({
  brand, platform, days,
}: {
  brand?: string; platform?: string; days: number
}) {
  const { data, isLoading } = useOverview({
    brand: brand !== 'all' ? brand : undefined,
    platform: platform !== 'all' ? platform : undefined,
    days,
  })
  const { brands: dynamicBrands } = useDynamicBrands()

  const brandLabels = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of dynamicBrands) map[b.id] = b.label
    return map
  }, [dynamicBrands])

  if (isLoading) return <AnalyticsSkeleton />
  if (!data) return <EmptyState icon={<BarChart3 className="w-12 h-12" />} title="No data yet" description="Connect your accounts and refresh to see analytics." />

  return (
    <div className="space-y-6">
      {/* Summary cards with period comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Followers"
          value={data.current.followers}
          change={data.changes.followers_pct}
          icon={<Users className="w-5 h-5 text-blue-600" />}
          color="bg-blue-50"
        />
        <StatCard
          label={`Views (${days}d)`}
          value={data.current.views}
          change={data.changes.views_pct}
          icon={<Eye className="w-5 h-5 text-green-600" />}
          color="bg-green-50"
        />
        <StatCard
          label={`Likes (${days}d)`}
          value={data.current.likes}
          change={data.changes.likes_pct}
          icon={<Heart className="w-5 h-5 text-pink-500" />}
          color="bg-pink-50"
        />
      </div>

      {/* Performance chart */}
      {data.daily.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-1">Average Performance</h3>
          <p className="text-xs text-gray-400 mb-4">Daily followers, views &amp; likes over the selected period</p>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.daily}>
              <defs>
                <linearGradient id="gFollowers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_BLUE} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={CHART_BLUE} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_GREEN} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={CHART_GREEN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#ccc" />
              <YAxis tick={{ fontSize: 11 }} stroke="#ccc" tickFormatter={fmt} />
              <Tooltip
                formatter={(v: number | undefined, name?: string) => [fmt(v ?? 0), name ?? '']}
                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              />
              <Legend />
              <Area type="monotone" dataKey="followers" stroke={CHART_BLUE} fill="url(#gFollowers)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="views" stroke={CHART_GREEN} fill="url(#gViews)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Social Channels Overview table */}
      {data.channels.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Social Channels Overview</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3 font-medium">Profile</th>
                  <th className="px-6 py-3 font-medium text-right">Followers</th>
                  <th className="px-6 py-3 font-medium text-right">Views (7d)</th>
                  <th className="px-6 py-3 font-medium text-right">Likes (7d)</th>
                </tr>
              </thead>
              <tbody>
                {data.channels.map((ch, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <PlatformIcon platform={ch.platform} className="w-4 h-4 text-gray-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{brandLabels[ch.brand] || ch.brand}</p>
                          <p className="text-xs text-gray-400 capitalize">{ch.platform}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <span className="text-sm font-semibold text-gray-900">{fmt(ch.followers)}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <span className="text-sm font-semibold text-gray-900">{fmt(ch.views)}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <span className="text-sm font-semibold text-gray-900">{fmt(ch.likes)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}


// ════════════════════════════════════════════════════════
//  TAB 2: POSTS
// ════════════════════════════════════════════════════════

function PostsTab({ brand, days }: { brand?: string; days: number }) {
  const [sortBy, setSortBy] = useState('views')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const { data, isLoading } = usePosts({
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
      {/* Summary row */}
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

      {/* Posts table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
                    <div className="max-w-xs">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.title || (p.caption ? p.caption.slice(0, 60) + (p.caption.length > 60 ? '…' : '') : p.topic_bucket || p.content_type)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
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


// ════════════════════════════════════════════════════════
//  TAB 3: ANSWERS
// ════════════════════════════════════════════════════════

function AnswersTab({ brand }: { brand?: string }) {
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
      {/* Top recommendations */}
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

      {/* Day of week engagement chart */}
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

      {/* Hour of day chart */}
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

      {/* Content type performance */}
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

      {/* Topic performance */}
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


// ════════════════════════════════════════════════════════
//  TAB 4: AUDIENCE
// ════════════════════════════════════════════════════════

function AudienceTab({ brand }: { brand?: string }) {
  const { data, isLoading } = useAudience({
    brand: brand !== 'all' ? brand : undefined,
  })
  const refreshMutation = useRefreshAudience()

  const handleRefresh = () => {
    refreshMutation.mutate(brand !== 'all' ? brand : undefined)
  }

  if (isLoading) return <AnalyticsSkeleton />

  if (!data?.has_data) {
    return (
      <div className="text-center py-16">
        <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-700">No audience data yet</h3>
        <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto mb-4">
          Audience demographics are available for Instagram Business accounts with 100+ followers.
        </p>
        <button
          onClick={handleRefresh}
          disabled={refreshMutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 inline mr-1.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          Fetch Audience Data
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={refreshMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {data.brands.map((aud) => (
        <div key={aud.brand} className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 text-lg mb-4">Audience Overview</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-blue-600 font-medium">Top gender and age</p>
                  <p className="text-sm font-bold text-gray-900">{aud.top_gender || '\u2014'}, {aud.top_age_range || '\u2014'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-xl">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Target className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-purple-600 font-medium">Top place</p>
                  <p className="text-sm font-bold text-gray-900">{aud.top_city || '\u2014'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
                <div className="p-2 bg-green-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-green-600 font-medium">Total audience</p>
                  <p className="text-sm font-bold text-gray-900">{fmt(aud.total_audience)}</p>
                </div>
              </div>
            </div>

            {aud.gender_age && Object.keys(aud.gender_age).length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Top Age and Gender</h4>
                <AgeGenderChart data={aud.gender_age} />
              </div>
            )}
          </div>

          {aud.top_cities && Object.keys(aud.top_cities).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Top Cities</h3>
              <div className="space-y-2">
                {Object.entries(aud.top_cities)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([city, count], i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-40 truncate">{city}</span>
                      <div className="flex-1 h-5 bg-gray-50 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-400"
                          style={{
                            width: `${Math.max(
                              (count / Math.max(...Object.values(aud.top_cities))) * 100,
                              4,
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-16 text-right">{fmt(count)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {aud.top_countries && Object.keys(aud.top_countries).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Top Countries</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(aud.top_countries)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 8)
                  .map(([country, count], i) => (
                    <div key={i} className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                      <p className="text-sm font-semibold text-gray-900">{country}</p>
                      <p className="text-xs text-gray-500">{fmt(count)} fans</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function AgeGenderChart({ data }: { data: Record<string, number> }) {
  const genderMap: Record<string, string> = { M: 'Male', F: 'Female', U: 'Undisclosed' }
  const ageRanges = new Set<string>()
  const parsed: { ageRange: string; gender: string; value: number }[] = []

  for (const [key, value] of Object.entries(data)) {
    const parts = key.split('.')
    const gKey = parts[0]
    const age = parts[1] || parts[0]
    const gender = genderMap[gKey] || gKey
    ageRanges.add(age)
    parsed.push({ ageRange: age, gender, value })
  }

  const sortedAges = [...ageRanges].sort((a, b) => {
    const na = parseInt(a.split('-')[0]) || 0
    const nb = parseInt(b.split('-')[0]) || 0
    return na - nb
  })

  const chartData = sortedAges.map((age) => {
    const row: Record<string, string | number> = { age }
    for (const p of parsed) {
      if (p.ageRange === age) row[p.gender] = p.value
    }
    return row
  })

  const genders = [...new Set(parsed.map((p) => p.gender))]
  const genderColors: Record<string, string> = { Male: CHART_BLUE, Female: CHART_PINK, Undisclosed: '#9CA3AF' }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="age" tick={{ fontSize: 12 }} stroke="#ccc" />
        <YAxis tick={{ fontSize: 11 }} stroke="#ccc" tickFormatter={fmt} />
        <Tooltip
          formatter={(v: number | undefined, name?: string) => [fmt(v ?? 0), name ?? '']}
          contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
        />
        <Legend />
        {genders.map((g) => (
          <Bar key={g} dataKey={g} fill={genderColors[g] || '#9CA3AF'} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}


// ════════════════════════════════════════════════════════
//  TAB 5: COMMUNITY
// ════════════════════════════════════════════════════════

interface CommunityComment {
  id: string
  platform: string
  brand: string
  post_id: string
  post_title: string | null
  author_name: string
  author_username: string | null
  author_avatar: string | null
  text: string
  like_count: number
  reply_count: number
  created_at: string
  permalink: string | null
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function platformColor(platform: string): string {
  switch (platform) {
    case 'instagram': return 'text-pink-500'
    case 'facebook': return 'text-blue-600'
    case 'youtube': return 'text-red-500'
    default: return 'text-gray-500'
  }
}

function CommunityTab({ brand, platform }: { brand?: string; platform?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['community-comments', brand, platform],
    queryFn: async () => {
      const sp = new URLSearchParams()
      if (brand && brand !== 'all') sp.set('brand', brand)
      if (platform && platform !== 'all') sp.set('platform', platform)
      sp.set('limit', '50')
      const q = sp.toString()
      return get<{ comments: CommunityComment[]; total: number; has_more: boolean }>(`/api/analytics/v2/comments${q ? `?${q}` : ''}`)
    },
    staleTime: 2 * 60_000,
    retry: 1,
  })

  const comments = data?.comments ?? []

  if (isLoading) return <AnalyticsSkeleton />

  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <MessageSquare className="w-14 h-14 text-gray-200 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700">No comments yet</h3>
        <p className="text-sm text-gray-400 mt-1 max-w-md">
          Comments from your published content will appear here once collected
          via the Meta Graph API and YouTube Data API.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {comments.map((c) => (
        <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              {c.author_avatar ? (
                <img src={c.author_avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-sm font-bold">
                  {c.author_name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-900">{c.author_name}</span>
                {c.author_username && <span className="text-xs text-gray-400">@{c.author_username}</span>}
                <PlatformIcon platform={c.platform} className={`w-3.5 h-3.5 ${platformColor(c.platform)}`} />
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {timeAgo(c.created_at)}
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{c.text}</p>
              {c.post_title && (
                <p className="text-xs text-gray-400 mt-1.5">
                  on <span className="font-medium text-gray-500">{c.post_title}</span>
                </p>
              )}
              <div className="flex items-center gap-4 mt-2">
                {c.like_count > 0 && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Heart className="w-3 h-3" /> {c.like_count}
                  </span>
                )}
                {c.reply_count > 0 && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Reply className="w-3 h-3" /> {c.reply_count}
                  </span>
                )}
                {c.permalink && (
                  <a
                    href={c.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> View
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}


// ════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════

const TABS = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'posts', label: 'Posts', icon: Eye },
  { key: 'answers', label: 'Answers', icon: Zap },
  { key: 'audience', label: 'Audience', icon: Users },
  { key: 'community', label: 'Community', icon: MessageSquare },
] as const

type TabKey = (typeof TABS)[number]['key']

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [selectedBrand, setSelectedBrand] = useState('all')
  const [selectedPlatform, setSelectedPlatform] = useState('all')
  const [timeRange, setTimeRange] = useState(30)
  const { brands: dynamicBrands } = useDynamicBrands()
  const { data: analyticsData } = useAnalytics()
  const refreshMutation = useRefreshAnalytics()
  const { data: refreshStatus } = useRefreshStatus()
  const isRefreshing = refreshStatus?.is_refreshing ?? false

  const brandOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'All Brands' }]
    for (const b of dynamicBrands) opts.push({ value: b.id, label: b.label })
    for (const bm of analyticsData?.brands || []) {
      if (!opts.some((o) => o.value === bm.brand)) {
        opts.push({ value: bm.brand, label: bm.display_name })
      }
    }
    return opts
  }, [dynamicBrands, analyticsData?.brands])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-7 h-7" />
            Analyze
          </h1>
          <p className="text-gray-500 mt-1">Smarter insights, better content</p>
        </div>
        <button
          onClick={() => refreshMutation.mutate()}
          disabled={isRefreshing || refreshMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing || refreshMutation.isPending ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing\u2026' : 'Refresh'}
        </button>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex gap-0">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
        <FilterBar
          brands={brandOptions}
          selectedBrand={selectedBrand}
          setSelectedBrand={setSelectedBrand}
          selectedPlatform={selectedPlatform}
          setSelectedPlatform={setSelectedPlatform}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
        />
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab brand={selectedBrand} platform={selectedPlatform} days={timeRange} />
      )}
      {activeTab === 'posts' && (
        <PostsTab brand={selectedBrand} days={timeRange} />
      )}
      {activeTab === 'answers' && (
        <AnswersTab brand={selectedBrand} />
      )}
      {activeTab === 'audience' && (
        <AudienceTab brand={selectedBrand} />
      )}
      {activeTab === 'community' && (
        <CommunityTab brand={selectedBrand} platform={selectedPlatform} />
      )}
    </div>
  )
}
