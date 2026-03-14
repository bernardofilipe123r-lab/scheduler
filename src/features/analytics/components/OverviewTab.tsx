import { useState, useMemo } from 'react'
import {
  BarChart3, Users, Eye, Heart,
  ChevronDown, Zap,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { useOverview } from '@/features/analytics'
import { AnalyticsSkeleton, PlatformIcon } from '@/shared/components'
import { useDynamicBrands } from '@/features/brands'
import {
  fmt, fmtGrowth, PctBadge, EmptyState,
  CHART_BLUE, CHART_GREEN, CHART_PINK,
  PLATFORM_COLORS,
} from './analytics-utils'

export function OverviewTab({
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

  const brandColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of dynamicBrands) map[b.id] = b.color
    return map
  }, [dynamicBrands])

  const brandGroups = useMemo(() => {
    const chs = data?.channels ?? []
    if (!chs.length) return [] as [string, typeof chs][]
    const grouped: Record<string, typeof chs> = {}
    for (const ch of chs) {
      if (!grouped[ch.brand]) grouped[ch.brand] = []
      grouped[ch.brand].push(ch)
    }
    return Object.entries(grouped).sort((a, b) => {
      const aViews = a[1].reduce((s, c) => s + c.views, 0)
      const bViews = b[1].reduce((s, c) => s + c.views, 0)
      return bViews - aViews
    })
  }, [data?.channels])

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
            Only {data.period.data_available_days} days of tracking data available — numbers reflect what we have, not the full {days}-day window.
          </span>
        </div>
      )}

      {/* 4 Stat cards with colored top accent */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {(() => {
          const isAllTime = days === 0
          const periodLabel = isAllTime ? 'All Time' : `${days}d`
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
              sub: isAllTime ? 'lifetime total' : 'total reach',
              isGrowth: false,
            },
            {
              label: isAllTime ? 'Likes' : `Likes (${periodLabel})`,
              value: data.current.likes,
              change: data.changes.likes_pct,
              color: '#EC4899',
              icon: <Heart className="w-4 h-4" />,
              sub: isAllTime ? 'lifetime total' : 'total engagement',
              isGrowth: false,
            },
            {
              label: 'Eng. Rate',
              value: null,
              change: undefined,
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

        {platformTotals.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-4">By Platform</h3>
            <div className="space-y-4">
              {platformTotals.map((p) => {
                const pct = data.current.views > 0 ? (p.views / data.current.views) * 100 : 0
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
            {brandGroups.map(([brandId, channels]) => {
              const bColor = brandColorMap[brandId] || '#6B7280'
              const label = brandLabels[brandId] || brandId
              const brandData = data?.brands?.find(b => b.brand === brandId)
              const isAllTime = days === 0
              const totalFollowers = brandData ? brandData.followers : channels.reduce((s, c) => s + c.followers, 0)
              const totalViews = brandData ? brandData.views : channels.reduce((s, c) => s + c.views, 0)
              const totalLikes = brandData ? brandData.likes : channels.reduce((s, c) => s + c.likes, 0)
              const followerGrowth = brandData?.followers_growth ?? 0
              const activePlatforms = channels.filter(c => c.followers > 0 || c.views > 0)
              const inactivePlatforms = channels.filter(c => c.followers === 0 && c.views === 0)
              const brandEngRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(2) : '0.00'
              const isExpanded = expandedBrand === brandId

              return (
                <div
                  key={brandId}
                  className={`bg-white rounded-xl border border-gray-200 overflow-hidden transition-shadow ${
                    isExpanded ? 'shadow-md' : 'shadow-sm'
                  }`}
                >
                  <button
                    onClick={() => setExpandedBrand(isExpanded ? null : brandId)}
                    className="w-full text-left px-5 py-3.5 grid items-center gap-2 hover:bg-gray-50/50 transition-colors"
                    style={{ gridTemplateColumns: 'minmax(140px, 1.2fr) 80px repeat(3, 80px) 56px 24px' }}
                  >
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

                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">
                        {isAllTime ? fmt(totalFollowers) : fmtGrowth(followerGrowth)}
                      </p>
                      <p className="text-[10px] text-gray-400">{isAllTime ? 'followers' : 'new followers'}</p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{fmt(totalViews)}</p>
                      <p className="text-[10px] text-gray-400">views</p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{fmt(totalLikes)}</p>
                      <p className="text-[10px] text-gray-400">likes</p>
                    </div>

                    <div className="text-right">
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                        parseFloat(brandEngRate) > 0.5
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {brandEngRate}%
                      </span>
                    </div>

                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

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
