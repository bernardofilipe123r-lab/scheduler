import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, Users, Eye, Heart,
  RefreshCw, Clock,
  Filter, ChevronDown,
  ArrowUpRight, ArrowDownRight, Minus,
  Zap, MessageCircle, MessageSquare,
  Bookmark, Share2, Target, ArrowUpDown, ExternalLink, Reply, MapPin,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
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
import { AnalyticsSkeleton, PlatformIcon } from '@/shared/components'
import { useDynamicBrands } from '@/features/brands'
import { get } from '@/shared/api'

// ─── Utility ────────────────────────────────────────────

function fmt(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toLocaleString()
}

function fmtGrowth(num: number): string {
  const prefix = num > 0 ? '+' : ''
  return prefix + fmt(num)
}

function pctColor(pct: number) {
  if (pct > 0) return 'text-green-600'
  if (pct < 0) return 'text-red-500'
  return 'text-gray-400'
}

function PctBadge({ value }: { value: number | null }) {
  if (value === null) return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-gray-300">
      <Minus className="w-3 h-3" /> —
    </span>
  )
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${pctColor(value)}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  )
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
    { value: '0', label: 'All Time' },
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

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  youtube: '#FF0000',
  facebook: '#1877F2',
  threads: '#000000',
  tiktok: '#010101',
}

// Brand colors are 100% dynamic — loaded from each brand's DB config via useDynamicBrands()

function OverviewTab({
  brand, platform, days,
}: {
  brand?: string; platform?: string; days: number
}) {
  const [metricView, setMetricView] = useState<'views' | 'followers' | 'likes'>('views')
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null)
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

  // Brand colors from dynamic config — each brand defines its own primary color
  const brandColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of dynamicBrands) map[b.id] = b.color
    return map
  }, [dynamicBrands])

  // Group channels by brand, sorted by total views desc
  const brandGroups = useMemo(() => {
    const brs = data?.brands ?? []
    if (!brs.length) return [] as [string, typeof brs[0]][]
    return [...brs].sort((a, b) => b.views - a.views).map(b => [b.brand, b] as [string, typeof b])
  }, [data?.brands])

  // Platform totals for side panel
  const platformTotals = useMemo(() => {
    const chs = data?.channels ?? []
    if (!chs.length) return []
    const map: Record<string, { platform: string; views: number; likes: number; followers: number }> = {}
    for (const ch of chs) {
      if (!map[ch.platform]) map[ch.platform] = { platform: ch.platform, views: 0, likes: 0, followers: 0 }
      map[ch.platform].views += ch.views
      map[ch.platform].likes += ch.likes
      map[ch.platform].followers += ch.followers
    }
    return Object.values(map).sort((a, b) => b.views - a.views)
  }, [data?.channels])

  if (isLoading) return <AnalyticsSkeleton />
  if (!data) return <EmptyState icon={<BarChart3 className="w-12 h-12" />} title="No data yet" description="Connect your accounts and refresh to see analytics." />

  const engRate = data.current.views > 0
    ? ((data.current.likes / data.current.views) * 100).toFixed(2)
    : '0.00'

  const metricColors: Record<string, string> = {
    views: CHART_GREEN,
    followers: CHART_BLUE,
    likes: CHART_PINK,
  }

  return (
    <div className="space-y-6">
      {/* Data availability warning */}
      {days > 0 && data.period.data_available_days > 0 && data.period.data_available_days < days && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-amber-600 text-xs font-semibold">
            Only {data.period.data_available_days} days of tracking data available — numbers below reflect what we have, not the full {days}-day window.
          </span>
        </div>
      )}
      {/* 4 Stat cards with colored top accent */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {(() => {
          const isAllTime = days === 0
          const periodLabel = isAllTime ? 'all time' : `${days}d`
          return [
            {
              label: isAllTime ? 'Followers' : `Followers (${periodLabel})`,
              value: data.current.followers,
              change: data.changes.followers_pct,
              color: '#3B82F6',
              icon: <Users className="w-4 h-4" />,
              sub: isAllTime ? 'total across all brands' : `${fmt(data.current.followers_total)} total across all brands`,
              isGrowth: !isAllTime,
            },
            {
              label: isAllTime ? 'Views' : `Views (${periodLabel})`,
              value: data.current.views,
              change: data.changes.views_pct,
              color: '#10B981',
              icon: <Eye className="w-4 h-4" />,
              sub: isAllTime ? 'total reach' : 'total reach',
              isGrowth: false,
            },
            {
              label: isAllTime ? 'Likes' : `Likes (${periodLabel})`,
              value: data.current.likes,
              change: data.changes.likes_pct,
              color: '#EC4899',
              icon: <Heart className="w-4 h-4" />,
              sub: isAllTime ? 'total engagement' : 'total engagement',
              isGrowth: false,
            },
            {
              label: 'Eng. Rate',
              value: null,
              color: '#F59E0B',
              icon: <Zap className="w-4 h-4" />,
              sub: 'likes / views',
              isGrowth: false,
            },
          ]
        })().map((card, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: card.color, opacity: 0.7 }} />
            <div className="flex items-center gap-2 mb-2.5" style={{ color: card.color }}>
              <span className="opacity-80">{card.icon}</span>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{card.label}</span>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-2xl font-extrabold text-gray-900 leading-none tracking-tight">
                {card.value !== null ? (card.isGrowth ? fmtGrowth(card.value) : fmt(card.value)) : engRate + '%'}
              </p>
              {card.change !== undefined && <PctBadge value={card.change ?? null} />}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Trend chart + Platform breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* Trend chart with metric switcher */}
        {data.daily.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">Trend</h3>
              <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
                {(['views', 'followers', 'likes'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetricView(m)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                      metricView === m
                        ? 'bg-gray-900 text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={data.daily} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gTrendOverview" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={metricColors[metricView]} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={metricColors[metricView]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmt} width={45} />
                <Tooltip
                  formatter={(v: number | undefined) => [fmt(v ?? 0), metricView]}
                  contentStyle={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey={metricView}
                  stroke={metricColors[metricView]}
                  strokeWidth={2}
                  fill="url(#gTrendOverview)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Platform breakdown panel */}
        {platformTotals.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-4">By Platform</h3>
            <div className="space-y-4">
              {platformTotals.map((p) => {
                const totalPlatViews = platformTotals.reduce((s, pt) => s + pt.views, 0)
                const pct = totalPlatViews > 0 ? (p.views / totalPlatViews) * 100 : 0
                const pColor = PLATFORM_COLORS[p.platform] || '#6B7280'
                return (
                  <div key={p.platform}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span style={{ color: pColor }}>
                          <PlatformIcon platform={p.platform} className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-xs font-semibold text-gray-700 capitalize">{p.platform}</span>
                      </div>
                      <span className="text-xs font-bold text-gray-900">{fmt(p.views)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: pColor, opacity: 0.7 }}
                      />
                    </div>
                    <div className="flex gap-3 mt-1">
                      <span className="text-[10px] text-gray-400">{fmt(p.followers)} followers</span>
                      <span className="text-[10px] text-gray-400">{fmt(p.likes)} likes</span>
                      <span className="text-[10px] text-gray-400">{pct.toFixed(1)}% of views</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Brand rows — expandable accordion sorted by views */}
      {brandGroups.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-900">Brands</h3>
            <span className="text-[11px] text-gray-400">sorted by views · click to expand</span>
          </div>
          <div className="space-y-2">
            {brandGroups.map(([brandId, brandData]) => {
              const bColor = brandColorMap[brandId] || '#6B7280'
              const label = brandLabels[brandId] || brandId
              const isAllTime = days === 0
              const displayFollowers = isAllTime ? brandData.followers : brandData.followers_growth
              const displayViews = brandData.views
              const displayLikes = brandData.likes
              const brandChannels = (data?.channels ?? []).filter(c => c.brand === brandId)
              const activePlatforms = brandChannels.filter(c => c.followers > 0 || c.views > 0)
              const inactivePlatforms = brandChannels.filter(c => c.followers === 0 && c.views === 0)
              const brandEngRate = displayViews > 0 ? ((displayLikes / displayViews) * 100).toFixed(2) : '0.00'
              const isExpanded = expandedBrand === brandId

              return (
                <div
                  key={brandId}
                  className={`bg-white rounded-xl border border-gray-200 overflow-hidden transition-shadow ${
                    isExpanded ? 'shadow-md' : 'shadow-sm'
                  }`}
                >
                  {/* Collapsed row */}
                  <button
                    onClick={() => setExpandedBrand(isExpanded ? null : brandId)}
                    className="w-full text-left px-5 py-3.5 grid items-center gap-2 hover:bg-gray-50/50 transition-colors"
                    style={{ gridTemplateColumns: 'minmax(140px, 1.2fr) 80px repeat(3, 80px) 56px 24px' }}
                  >
                    {/* Brand name + platform icons */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-extrabold"
                        style={{ backgroundColor: bColor + '14', color: bColor }}
                      >
                        {label.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-gray-900 truncate">{label}</p>
                        <div className="flex gap-1 mt-0.5">
                          {activePlatforms.map(c => (
                            <span key={c.platform} style={{ color: PLATFORM_COLORS[c.platform] || '#6B7280' }} className="opacity-70">
                              <PlatformIcon platform={c.platform} className="w-3.5 h-3.5" />
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Sparkline placeholder (area with daily data) */}
                    <div className="h-8">
                      <ResponsiveContainer width="100%" height={32}>
                        <AreaChart data={data.daily.slice(-7)} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                          <defs>
                            <linearGradient id={`sp-${brandId}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={bColor} stopOpacity={0.25} />
                              <stop offset="100%" stopColor={bColor} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="views" stroke={bColor} strokeWidth={1.5} fill={`url(#sp-${brandId})`} dot={false} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Followers */}
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{isAllTime ? fmt(displayFollowers) : fmtGrowth(displayFollowers)}</p>
                      <p className="text-[10px] text-gray-400">followers</p>
                    </div>

                    {/* Views */}
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{fmt(displayViews)}</p>
                      <p className="text-[10px] text-gray-400">views</p>
                    </div>

                    {/* Likes */}
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{fmt(displayLikes)}</p>
                      <p className="text-[10px] text-gray-400">likes</p>
                    </div>

                    {/* Eng rate badge */}
                    <div className="text-right">
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                        parseFloat(brandEngRate) > 0.5
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {brandEngRate}%
                      </span>
                    </div>

                    {/* Chevron */}
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Expanded platform breakdown (live data from BrandAnalytics) */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      {activePlatforms.map((c) => {
                        const pEngRate = c.views > 0 ? ((c.likes / c.views) * 100).toFixed(2) : 'n/a'
                        const pColor = PLATFORM_COLORS[c.platform] || '#6B7280'
                        return (
                          <div
                            key={c.platform}
                            className="grid items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-100"
                            style={{ gridTemplateColumns: '120px 1fr 1fr 1fr 70px' }}
                          >
                            <div className="flex items-center gap-2">
                              <span style={{ color: pColor }}>
                                <PlatformIcon platform={c.platform} className="w-3.5 h-3.5" />
                              </span>
                              <span className="text-xs font-semibold text-gray-700 capitalize">{c.platform}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[13px] font-bold text-gray-900">{fmt(c.followers)}</span>
                              <span className="text-[10px] text-gray-400 ml-1">followers</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[13px] font-bold text-gray-900">{fmt(c.views)}</span>
                              <span className="text-[10px] text-gray-400 ml-1">views</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[13px] font-bold text-gray-900">{fmt(c.likes)}</span>
                              <span className="text-[10px] text-gray-400 ml-1">likes</span>
                            </div>
                            <div className="text-right">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                c.views > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                              }`}>
                                {pEngRate === 'n/a' ? 'n/a' : pEngRate + '%'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                      {inactivePlatforms.length > 0 && (
                        <p className="text-[11px] text-gray-400 pl-3">
                          + {inactivePlatforms.length} inactive platform{inactivePlatforms.length > 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  )}
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
//  TAB 2: POSTS
// ════════════════════════════════════════════════════════

function PostsTab({ brand, days }: { brand?: string; days: number }) {
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
      {/* Period label + summary row */}
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

      {/* Posts table */}
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

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', AU: 'Australia', CA: 'Canada',
  IN: 'India', IE: 'Ireland', ZA: 'South Africa', NZ: 'New Zealand',
  BH: 'Bahrain', KE: 'Kenya', PH: 'Philippines', DE: 'Germany',
  FR: 'France', BR: 'Brazil', MX: 'Mexico', JP: 'Japan', IT: 'Italy',
  ES: 'Spain', NL: 'Netherlands', PT: 'Portugal', SE: 'Sweden',
  NO: 'Norway', DK: 'Denmark', FI: 'Finland', PL: 'Poland',
  AE: 'UAE', SG: 'Singapore', HK: 'Hong Kong', MY: 'Malaysia',
  NG: 'Nigeria', GH: 'Ghana', EG: 'Egypt', KR: 'South Korea',
}

const COUNTRY_FLAGS: Record<string, string> = {
  US: '\u{1F1FA}\u{1F1F8}', GB: '\u{1F1EC}\u{1F1E7}', AU: '\u{1F1E6}\u{1F1FA}',
  CA: '\u{1F1E8}\u{1F1E6}', IN: '\u{1F1EE}\u{1F1F3}', IE: '\u{1F1EE}\u{1F1EA}',
  ZA: '\u{1F1FF}\u{1F1E6}', NZ: '\u{1F1F3}\u{1F1FF}', BH: '\u{1F1E7}\u{1F1ED}',
  KE: '\u{1F1F0}\u{1F1EA}', PH: '\u{1F1F5}\u{1F1ED}', DE: '\u{1F1E9}\u{1F1EA}',
  FR: '\u{1F1EB}\u{1F1F7}', BR: '\u{1F1E7}\u{1F1F7}', MX: '\u{1F1F2}\u{1F1FD}',
  JP: '\u{1F1EF}\u{1F1F5}', IT: '\u{1F1EE}\u{1F1F9}', ES: '\u{1F1EA}\u{1F1F8}',
  NL: '\u{1F1F3}\u{1F1F1}', PT: '\u{1F1F5}\u{1F1F9}', SE: '\u{1F1F8}\u{1F1EA}',
  NO: '\u{1F1F3}\u{1F1F4}', DK: '\u{1F1E9}\u{1F1F0}', FI: '\u{1F1EB}\u{1F1EE}',
  PL: '\u{1F1F5}\u{1F1F1}', AE: '\u{1F1E6}\u{1F1EA}', SG: '\u{1F1F8}\u{1F1EC}',
  HK: '\u{1F1ED}\u{1F1F0}', MY: '\u{1F1F2}\u{1F1FE}', NG: '\u{1F1F3}\u{1F1EC}',
  GH: '\u{1F1EC}\u{1F1ED}', EG: '\u{1F1EA}\u{1F1EC}', KR: '\u{1F1F0}\u{1F1F7}',
}

const GENDER_PIE_COLORS: Record<string, string> = {
  Female: '#ec4899', Male: '#3b82f6', Undisclosed: '#9ca3af',
}

interface ParsedBrandAudience {
  brandId: string
  brandLabel: string
  brandColor: string
  totalAudience: number
  topGenderAge: string
  topPlace: string
  ageData: { range: string; followers: number }[]
  genderData: { name: string; value: number; color: string }[]
  cities: { name: string; fans: number }[]
  countries: { code: string; fans: number }[]
}

function parseAudienceData(
  aud: import('@/features/analytics/api/analytics-v2-api').AudienceBrand,
  brandLabel: string,
  brandColor: string,
): ParsedBrandAudience {
  // Parse age data from gender_age dict (keys like "age.25-34")
  const ageBuckets: Record<string, number> = {}
  const genderTotals: Record<string, number> = {}

  for (const [key, val] of Object.entries(aud.gender_age || {})) {
    const [type, bucket] = key.split('.')
    if (type === 'age' && bucket) {
      ageBuckets[bucket] = (ageBuckets[bucket] || 0) + val
    } else if (type === 'gender' && bucket) {
      const label = bucket === 'M' ? 'Male' : bucket === 'F' ? 'Female' : 'Undisclosed'
      genderTotals[label] = (genderTotals[label] || 0) + val
    }
  }

  const ageData = Object.entries(ageBuckets)
    .sort(([a], [b]) => {
      const na = parseInt(a.split('-')[0]) || 0
      const nb = parseInt(b.split('-')[0]) || 0
      return na - nb
    })
    .map(([range, followers]) => ({ range, followers }))

  const genderData = Object.entries(genderTotals).map(([name, value]) => ({
    name,
    value,
    color: GENDER_PIE_COLORS[name] || '#9ca3af',
  }))

  const cities = Object.entries(aud.top_cities || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, fans]) => ({ name, fans }))

  const countries = Object.entries(aud.top_countries || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([code, fans]) => ({ code, fans }))

  const genderLabel = aud.top_gender || '\u2014'
  const ageLabel = aud.top_age_range || ''
  const topGenderAge = ageLabel ? `${genderLabel}, ${ageLabel}` : genderLabel

  return {
    brandId: aud.brand,
    brandLabel,
    brandColor,
    totalAudience: aud.total_audience,
    topGenderAge,
    topPlace: aud.top_city || '\u2014',
    ageData,
    genderData,
    cities,
    countries,
  }
}

function AudienceAgeChart({ data, brandColor }: { data: { range: string; followers: number }[]; brandColor: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-3">Followers by Age Range</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={fmt} width={48} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,.12)', fontSize: 13 }}
            formatter={(v: number | undefined) => [fmt(v ?? 0), 'Followers']}
            labelFormatter={(l) => `Age ${String(l)}`}
          />
          <Bar dataKey="followers" name="Followers" fill={brandColor} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function AudienceGenderPie({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-2">Gender Split</p>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={52} dataKey="value" stroke="none">
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-1.5">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-sm">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
              <span className="text-gray-500">{d.name}</span>
              <span className="font-semibold text-gray-900">{fmt(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AudienceBrandSection({
  brand,
  isExpanded,
  onToggle,
}: {
  brand: ParsedBrandAudience
  isExpanded: boolean
  onToggle: () => void
}) {
  const maxCity = brand.cities[0]?.fans || 1
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-200 overflow-hidden transition-shadow ${
        isExpanded ? 'shadow-md' : 'shadow-sm'
      }`}
    >
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
        style={isExpanded ? { background: `${brand.brandColor}06` } : undefined}
      >
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: brand.brandColor }} />
          <span className="text-base font-bold text-gray-900">{brand.brandLabel}</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="hidden sm:flex gap-6 text-sm">
            <span className="text-gray-400">
              Audience:{' '}
              <span className="font-bold text-gray-900">{fmt(brand.totalAudience)}</span>
            </span>
            <span className="text-gray-400">
              Top:{' '}
              <span className="font-semibold text-gray-700">{brand.topGenderAge}</span>
            </span>
            <span className="text-gray-400">
              Location:{' '}
              <span className="font-semibold text-gray-700">{brand.topPlace}</span>
            </span>
          </div>
          <ChevronDown
            className={`w-4.5 h-4.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-5 pb-6">
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: `${brand.brandColor}0a`, border: `1px solid ${brand.brandColor}18` }}>
              <div className="p-2 rounded-lg" style={{ background: `${brand.brandColor}15` }}>
                <Users className="w-4 h-4" style={{ color: brand.brandColor }} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: brand.brandColor }}>Total Followers</p>
                <p className="text-sm font-bold text-gray-900">{fmt(brand.totalAudience)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3.5 bg-pink-50/60 rounded-xl border border-pink-100/60">
              <div className="p-2 bg-pink-100 rounded-lg">
                <Target className="w-4 h-4 text-pink-500" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-pink-500">Top Demographic</p>
                <p className="text-sm font-bold text-gray-900">{brand.topGenderAge}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-100/60">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <MapPin className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Top Location</p>
                <p className="text-sm font-bold text-gray-900">{brand.topPlace}</p>
              </div>
            </div>
          </div>

          {/* Charts row */}
          {(brand.ageData.length > 0 || brand.genderData.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 mb-6">
              {brand.ageData.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <AudienceAgeChart data={brand.ageData} brandColor={brand.brandColor} />
                </div>
              )}
              {brand.genderData.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex items-center">
                  <AudienceGenderPie data={brand.genderData} />
                </div>
              )}
            </div>
          )}

          {/* Geography row */}
          {(brand.cities.length > 0 || brand.countries.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {brand.cities.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">Top Cities</p>
                  <div className="flex flex-col gap-2">
                    {brand.cities.slice(0, 6).map((c) => (
                      <div key={c.name} className="flex items-center gap-2.5">
                        <span className="w-32 text-sm text-gray-700 truncate flex-shrink-0">{c.name}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all"
                            style={{ width: `${(c.fans / maxCity) * 100}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs font-semibold text-gray-500 flex-shrink-0">
                          {fmt(c.fans)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {brand.countries.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">Top Countries</p>
                  <div className="grid grid-cols-2 gap-2">
                    {brand.countries.slice(0, 8).map((c) => (
                      <div
                        key={c.code}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100"
                      >
                        <span className="text-base">{COUNTRY_FLAGS[c.code] || '\u{1F30D}'}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">
                            {COUNTRY_NAMES[c.code] || c.code}
                          </p>
                          <p className="text-[11px] text-gray-400">{fmt(c.fans)} followers</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AudienceAggregateOverview({
  brands,
}: {
  brands: ParsedBrandAudience[]
}) {
  const total = brands.reduce((s, b) => s + b.totalAudience, 0)
  const sorted = [...brands].sort((a, b) => b.totalAudience - a.totalAudience)
  const maxAud = sorted[0]?.totalAudience || 1

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4 shadow-sm">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h3 className="text-lg font-bold text-gray-900">All Brands Overview</h3>
          <p className="text-sm text-gray-400 mt-0.5">
            Combined audience across {brands.length} brand{brands.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-extrabold text-gray-900">{fmt(total)}</p>
          <p className="text-xs text-gray-400">Total followers</p>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {sorted.map((b) => {
          const pct = total > 0 ? (b.totalAudience / total) * 100 : 0
          return (
            <div key={b.brandId} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: b.brandColor }} />
              <span className="w-40 text-sm font-semibold text-gray-700 truncate flex-shrink-0">{b.brandLabel}</span>
              <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(b.totalAudience / maxAud) * 100}%`, background: b.brandColor }}
                />
              </div>
              <span className="w-14 text-right text-sm font-bold text-gray-900">{fmt(b.totalAudience)}</span>
              <span className="w-12 text-right text-xs text-gray-400">{pct.toFixed(1)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AudienceTab({ brand }: { brand?: string }) {
  const { data, isLoading } = useAudience({
    brand: brand !== 'all' ? brand : undefined,
  })
  const { brands: dynamicBrands } = useDynamicBrands()
  const refreshMutation = useRefreshAudience()
  const autoFetchedRef = useRef(false)
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set())
  const [initialExpanded, setInitialExpanded] = useState(false)

  const handleRefresh = () => {
    refreshMutation.mutate(brand !== 'all' ? brand : undefined)
  }

  // Build brand lookup maps from dynamic config
  const brandLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of dynamicBrands) map[b.id] = b.label
    return map
  }, [dynamicBrands])

  const brandColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of dynamicBrands) map[b.id] = b.color
    return map
  }, [dynamicBrands])

  // Parse audience data into renderable shape
  const parsedBrands = useMemo<ParsedBrandAudience[]>(() => {
    if (!data?.brands) return []
    return data.brands.map((aud) =>
      parseAudienceData(
        aud,
        brandLabelMap[aud.brand] || aud.brand,
        brandColorMap[aud.brand] || '#6B7280',
      ),
    )
  }, [data?.brands, brandLabelMap, brandColorMap])

  // Auto-expand the first brand once data loads
  useEffect(() => {
    if (parsedBrands.length > 0 && !initialExpanded) {
      setExpandedBrands(new Set([parsedBrands[0].brandId]))
      setInitialExpanded(true)
    }
  }, [parsedBrands, initialExpanded])

  // Auto-fetch audience data on first mount when none exists
  useEffect(() => {
    if (data && !data.has_data && !autoFetchedRef.current && !refreshMutation.isPending) {
      autoFetchedRef.current = true
      refreshMutation.mutate(brand !== 'all' ? brand : undefined)
    }
  }, [data, refreshMutation, brand])

  const toggleBrand = (id: string) => {
    setExpandedBrands((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setExpandedBrands(new Set(parsedBrands.map((b) => b.brandId)))
  const collapseAll = () => setExpandedBrands(new Set())

  if (isLoading || (refreshMutation.isPending && !data?.has_data)) return <AnalyticsSkeleton />

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
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={expandAll}
          className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-500"
        >
          Expand all
        </button>
        <button
          onClick={collapseAll}
          className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-500"
        >
          Collapse all
        </button>
        <button
          onClick={handleRefresh}
          disabled={refreshMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Aggregate view when showing all brands */}
      {(!brand || brand === 'all') && parsedBrands.length > 1 && (
        <AudienceAggregateOverview brands={parsedBrands} />
      )}

      {/* Brand accordion sections */}
      <div className="flex flex-col gap-3">
        {parsedBrands.map((b) => (
          <AudienceBrandSection
            key={b.brandId}
            brand={b}
            isExpanded={expandedBrands.has(b.brandId)}
            onToggle={() => toggleBrand(b.brandId)}
          />
        ))}
      </div>
    </div>
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
    staleTime: 5 * 60_000,
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
          Reading comments requires Advanced Access for <span className="font-medium">instagram_business_manage_comments</span> in the Meta App Dashboard.
          Request it under App Review &rarr; Permissions and Features.
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
