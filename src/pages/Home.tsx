import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, Sparkles, TrendingUp, TrendingDown } from 'lucide-react'
import { useAnalytics, useSnapshots, type AnalyticsSnapshot } from '@/features/analytics'
import { useJobs } from '@/features/jobs'
import { useScheduledPosts } from '@/features/scheduling'
import { useDynamicBrands } from '@/features/brands'
import { apiClient } from '@/shared/api/client'
import { HomeSkeleton } from '@/shared/components'

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toLocaleString()
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Auto-schedule slot definitions (must match backend scheduler.py)
const BASE_REEL_SLOTS: Array<{ hour: number; variant: 'light' | 'dark' }> = [
  { hour: 0, variant: 'light' },
  { hour: 4, variant: 'dark' },
  { hour: 8, variant: 'light' },
  { hour: 12, variant: 'dark' },
  { hour: 16, variant: 'light' },
  { hour: 20, variant: 'dark' },
]
const BASE_POST_HOURS_DAY = [0, 12]                   // 2 posts/day: midnight + noon

function fmtSlotHour(h: number): string {
  if (h === 0) return '12AM'
  if (h === 12) return '12PM'
  return h < 12 ? `${h}AM` : `${h - 12}PM`
}

export function HomePage() {
  const navigate = useNavigate()
  const { data: analyticsData, isLoading: analyticsLoading } = useAnalytics()
  const { data: snapshotsData } = useSnapshots({ days: 14 })
  const { data: jobs = [], isLoading: jobsLoading } = useJobs()
  const { data: scheduledPosts = [], isLoading: scheduledLoading } = useScheduledPosts()
  const { brands: dynamicBrands = [], isLoading: brandsLoading } = useDynamicBrands()
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({})

  // Fetch brand logos from theme API
  useEffect(() => {
    const fetchLogos = async () => {
      const logos: Record<string, string> = {}
      for (const brand of dynamicBrands) {
        try {
          const themeData = await apiClient.get<{ theme?: { logo?: string } }>(`/api/brands/${brand.id}/theme`)
          if (themeData.theme?.logo) {
            logos[brand.id] = themeData.theme.logo.startsWith('http') ? themeData.theme.logo : `/brand-logos/${themeData.theme.logo}`
          }
        } catch {
          // ignore
        }
      }
      setBrandLogos(logos)
    }
    if (dynamicBrands.length > 0) fetchLogos()
  }, [dynamicBrands])

  const jobsArray = Array.isArray(jobs) ? jobs : []
  const postsArray = Array.isArray(scheduledPosts) ? scheduledPosts : []

  // Greeting based on time of day
  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])

  // Stats
  const totalFollowers = analyticsData?.brands?.reduce((sum, b) => sum + (b.totals?.followers || 0), 0) ?? 0
  const totalViews7d = analyticsData?.brands?.reduce((sum, b) => sum + (b.totals?.views_7d || 0), 0) ?? 0
  const totalLikes7d = analyticsData?.brands?.reduce((sum, b) => sum + (b.totals?.likes_7d || 0), 0) ?? 0

  // Week-over-week percentage changes derived from snapshots
  const lastWeekTotals = useMemo(() => {
    const snapshots: AnalyticsSnapshot[] = snapshotsData?.snapshots || []
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    // Pick the latest snapshot per (brand, platform) that is at least 7 days old
    const latestOld = new Map<string, AnalyticsSnapshot>()
    for (const s of snapshots) {
      const d = new Date(s.snapshot_at)
      if (d <= oneWeekAgo) {
        const key = `${s.brand}|${s.platform}`
        const ex = latestOld.get(key)
        if (!ex || d > new Date(ex.snapshot_at)) latestOld.set(key, s)
      }
    }
    let followers = 0, views = 0, likes = 0
    for (const s of latestOld.values()) {
      followers += s.followers_count
      views += s.views_last_7_days
      likes += s.likes_last_7_days
    }
    return latestOld.size > 0 ? { followers, views, likes } : null
  }, [snapshotsData])

  function calcChange(current: number, prev: number): number | null {
    if (prev === 0 && current === 0) return null
    if (prev === 0) return 100 // went from 0 to something → treat as +100%
    return Math.round(((current - prev) / prev) * 100)
  }

  const followersChange = lastWeekTotals ? calcChange(totalFollowers, lastWeekTotals.followers) : null
  const viewsChange = lastWeekTotals ? calcChange(totalViews7d, lastWeekTotals.views) : null
  const likesChange = lastWeekTotals ? calcChange(totalLikes7d, lastWeekTotals.likes) : null

  // Job counts
  const readyJobs = jobsArray.filter(j => j.status === 'completed').length
  const inProgressJobs = jobsArray.filter(j => j.status === 'generating' || j.status === 'pending').length
  const scheduledCount = postsArray.filter(p => p.status === 'scheduled').length

  // Week-over-week changes for operational metrics
  const _7dAgo = useMemo(() => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), [])
  const _14dAgo = useMemo(() => new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), [])
  const _7dAhead = useMemo(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), [])
  const _now = useMemo(() => new Date(), [])

  const completedThisWeek = jobsArray.filter(j => j.status === 'completed' && new Date(j.created_at) >= _7dAgo).length
  const completedLastWeek = jobsArray.filter(j => j.status === 'completed' && new Date(j.created_at) >= _14dAgo && new Date(j.created_at) < _7dAgo).length
  const jobsReadyChange = calcChange(completedThisWeek, completedLastWeek)

  const scheduledUpcoming = postsArray.filter(p => { const t = new Date(p.scheduled_time); return t >= _now && t <= _7dAhead }).length
  const publishedPastWeek = postsArray.filter(p => { const t = new Date(p.scheduled_time); return t >= _7dAgo && t < _now }).length
  const scheduledChange = calcChange(scheduledUpcoming, publishedPastWeek)

  // Today's schedule
  const today = new Date().toDateString()
  const todayPosts = postsArray
    .filter(p => new Date(p.scheduled_time).toDateString() === today)
    .sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime())

  // Today's slot coverage per brand
  const coverage = useMemo(() => {
    const n = new Date()
    const dayStart = new Date(n)
    dayStart.setHours(0, 0, 0, 0)
    return dynamicBrands.filter(b => b.active).map(brand => {
      const brandToday = todayPosts.filter(p => p.brand === brand.id)
      // Map of hour → actual variant from scheduled post metadata
      const reelsByHour = new Map<number, string>()
      brandToday.filter(p => p.metadata?.variant !== 'post').forEach(p => {
        reelsByHour.set(new Date(p.scheduled_time).getHours(), p.metadata?.variant || 'light')
      })
      const postHours = new Set(
        brandToday.filter(p => p.metadata?.variant === 'post').map(p => new Date(p.scheduled_time).getHours())
      )
      const offset = brand.scheduleOffset || 0
      const reelSlots = BASE_REEL_SLOTS.map(({ hour: base, variant: expectedVariant }) => {
        const hour = (base + offset) % 24
        const t = new Date(dayStart); t.setHours(hour, 0, 0, 0)
        const isPast = t < n
        const isSoon = !isPast && t.getTime() - n.getTime() < 7_200_000
        const filled = reelsByHour.has(hour)
        // Use actual variant from scheduled post, or the expected pattern variant
        const slotVariant: 'light' | 'dark' = filled
          ? (reelsByHour.get(hour) === 'dark' ? 'dark' : 'light')
          : expectedVariant
        return { hour, filled, isPast, isSoon, variant: slotVariant }
      })
      const postSlots = BASE_POST_HOURS_DAY.map(h => {
        const t = new Date(dayStart); t.setHours(h, 0, 0, 0)
        const isPast = t < n
        const isSoon = !isPast && t.getTime() - n.getTime() < 7_200_000
        return { hour: h, filled: postHours.has(h), isPast, isSoon }
      })
      const openReels    = reelSlots.filter(s => !s.filled && !s.isPast).length
      const openPosts    = postSlots.filter(s => !s.filled && !s.isPast).length
      const missedReels  = reelSlots.filter(s => !s.filled && s.isPast).length
      const missedPosts  = postSlots.filter(s => !s.filled && s.isPast).length
      return { brandId: brand.id, reelSlots, postSlots, openReels, openPosts, missedReels, missedPosts }
    }).sort((a, b) => {
      const metrics = analyticsData?.brands || []
      const fa = metrics.find(m => m.brand === a.brandId)?.totals?.followers ?? 0
      const fb = metrics.find(m => m.brand === b.brandId)?.totals?.followers ?? 0
      return fb - fa
    })
  }, [todayPosts, dynamicBrands, analyticsData])

  // Recent jobs (last 6)
  const recentJobs = [...jobsArray]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6)

  // Brand analytics
  const brandMetrics = analyticsData?.brands || []

  // Active brands count
  const activeBrandsCount = dynamicBrands.filter(b => b.active).length

  const brandColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    dynamicBrands.forEach(b => { map[b.id] = b.color })
    brandMetrics.forEach(b => { if (b.color && !map[b.brand]) map[b.brand] = b.color })
    return map
  }, [dynamicBrands, brandMetrics])

  function getBrandColor(brandId: string): string {
    return brandColorMap[brandId] || '#6b7280'
  }

  function getBrandInitials(brandId: string): string {
    const brand = dynamicBrands.find(b => b.id === brandId)
    if (brand?.shortName) return brand.shortName
    const metric = brandMetrics.find(b => b.brand === brandId)
    if (metric?.display_name) {
      return metric.display_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    }
    return brandId.slice(0, 2).toUpperCase()
  }

  function getBrandName(brandId: string): string {
    const brand = dynamicBrands.find(b => b.id === brandId)
    if (brand?.label) return brand.label
    const metric = brandMetrics.find(b => b.brand === brandId)
    return metric?.display_name || brandId
  }

  function getBrandLogo(brandId: string): string | undefined {
    return brandLogos[brandId]
  }

  function BrandAvatar({ brandId, size = 'md' }: { brandId: string; size?: 'sm' | 'md' }) {
    const logo = getBrandLogo(brandId)
    const color = getBrandColor(brandId)
    const initials = getBrandInitials(brandId)
    const sizeClasses = size === 'sm' ? 'w-5 h-5 text-[8px]' : 'w-8 h-8 text-xs'
    const roundClasses = size === 'sm' ? 'rounded' : 'rounded-lg'
    if (logo) {
      return <img src={logo} alt={getBrandName(brandId)} className={`${sizeClasses} ${roundClasses} object-cover shrink-0`} />
    }
    return (
      <div
        className={`${sizeClasses} ${roundClasses} flex items-center justify-center font-bold shrink-0`}
        style={{ backgroundColor: color + '18', color }}
      >
        {initials}
      </div>
    )
  }

  const now = new Date()

  if (analyticsLoading || jobsLoading || scheduledLoading || brandsLoading) {
    return <HomeSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* Greeting + Quick Actions */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting} 👋</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeBrandsCount} brand{activeBrandsCount !== 1 ? 's' : ''} active
            {totalFollowers > 0 && <> · <span className="text-green-600 font-medium">{formatNum(totalFollowers)} followers</span></>}
            {scheduledCount > 0 && <> · {scheduledCount} post{scheduledCount !== 1 ? 's' : ''} scheduled</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/reels')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-sm font-semibold rounded-lg hover:from-violet-700 hover:to-fuchsia-700 transition-all shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            New Reel
          </button>
          <button
            onClick={() => navigate('/posts')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-all shadow-sm"
          >
            <LayoutGrid className="w-4 h-4" />
            New Post
          </button>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatsCard label="Total Followers" value={formatNum(totalFollowers)} change={followersChange} />
        <StatsCard label="Views (7d)" value={formatNum(totalViews7d)} change={viewsChange} />
        <StatsCard label="Likes (7d)" value={formatNum(totalLikes7d)} change={likesChange} />
        <StatsCard
          label="Jobs Ready"
          value={String(readyJobs)}
          change={jobsReadyChange}
          sub={inProgressJobs > 0 ? `${inProgressJobs} in progress` : undefined}
        />
        <StatsCard label="Scheduled" value={String(scheduledCount)} change={scheduledChange} />
      </div>

      {/* Today's Schedule Coverage */}
      {coverage.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between px-5 py-3.5 border-b border-gray-100 gap-y-2">
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Today's Coverage</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Auto-schedule: max 6 reels · 2 carousels per brand ·{' '}
                {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
              {/* Type legend — mini chip previews */}
              <span className="flex items-center gap-1.5 pr-3 border-r border-gray-100">
                <span className="inline-flex flex-col items-center gap-[3px] px-1 pt-0.5 pb-px rounded border bg-gray-100 border-gray-200">
                  <span className="block rounded-full" style={{ width: 5, height: 5, backgroundColor: '#fbbf24' }} />
                  <span className="text-[8px] font-mono font-bold leading-none text-gray-400">☀️</span>
                </span>
                Light
              </span>
              <span className="flex items-center gap-1.5 pr-3 border-r border-gray-100">
                <span className="inline-flex flex-col items-center gap-[3px] px-1 pt-0.5 pb-px rounded border bg-gray-100 border-gray-200">
                  <span className="block rounded-full" style={{ width: 5, height: 5, backgroundColor: '#6366f1' }} />
                  <span className="text-[8px] font-mono font-bold leading-none text-gray-400">🌙</span>
                </span>
                Dark
              </span>
              <span className="flex items-center gap-1.5 pr-3 border-r border-gray-100">
                <span className="inline-flex flex-col items-center gap-[3px] px-1 pt-0.5 pb-px rounded border bg-gray-100 border-gray-200">
                  <span className="block rounded-full" style={{ width: 8, height: 2, backgroundColor: '#9ca3af' }} />
                  <span className="text-[8px] font-mono font-bold leading-none text-gray-400">8AM</span>
                </span>
                Carousel
              </span>
              {/* State legend */}
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded bg-green-100 border border-green-200" />
                Filled
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded bg-amber-50 border border-dashed border-amber-300" />
                Up next
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded bg-rose-50 border border-rose-200" />
                Missed
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded bg-gray-50 border border-gray-200" />
                Open
              </span>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {coverage.map(({ brandId, reelSlots, postSlots, openReels, openPosts, missedReels, missedPosts }) => {
              const allGood = openReels === 0 && openPosts === 0 && missedReels === 0 && missedPosts === 0
              return (
                <div key={brandId} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors flex-wrap md:flex-nowrap">
                  {/* Brand */}
                  <div className="flex items-center gap-2 w-36 shrink-0">
                    <BrandAvatar brandId={brandId} size="sm" />
                    <span className="text-xs font-medium text-gray-800 truncate">{getBrandName(brandId)}</span>
                  </div>

                  {/* All slots in time order */}
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                    {[...reelSlots.map(s => ({ ...s, kind: 'reel' as const })), ...postSlots.map(s => ({ ...s, kind: 'post' as const, variant: undefined as 'light' | 'dark' | undefined }))]
                      .sort((a, b) => a.hour - b.hour)
                      .map(s => <SlotChip key={`${s.kind}-${s.hour}`} {...s} />)
                    }
                  </div>

                  {/* Status summary */}
                  <div className="shrink-0 w-44 text-right">
                    {allGood ? (
                      <span className="text-[11px] font-semibold text-green-600">✓ All filled</span>
                    ) : (
                      <div className="space-y-0.5 text-[11px] font-semibold">
                        {(missedReels > 0 || missedPosts > 0) && (
                          <div className="text-rose-500">
                            {[
                              missedReels > 0 && `${missedReels} reel${missedReels !== 1 ? 's' : ''} missed`,
                              missedPosts > 0 && `${missedPosts} post${missedPosts !== 1 ? 's' : ''} missed`,
                            ].filter(Boolean).join(' · ')}
                          </div>
                        )}
                        {(openReels > 0 || openPosts > 0) && (
                          <div className="text-amber-600">
                            {[
                              openReels > 0 && `${openReels} reel${openReels !== 1 ? 's' : ''} open`,
                              openPosts > 0 && `${openPosts} post${openPosts !== 1 ? 's' : ''} open`,
                            ].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Row 2: Brand Health + Jobs Queue + Publishing Today */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Brand Health */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Brand Health</h2>
            <button onClick={() => navigate('/brands')} className="text-xs text-primary-500 font-medium hover:underline">
              Manage →
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {brandMetrics.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-gray-400">No brand data yet</div>
            )}
            {[...brandMetrics].sort((a, b) => (b.totals?.followers || 0) - (a.totals?.followers || 0)).map(brand => {
              const color = getBrandColor(brand.brand)
              // Check if brand has content scheduled in last 48h
              const hasRecentScheduled = postsArray.some(
                p => p.brand === brand.brand && p.status === 'scheduled'
              )
              return (
                <div key={brand.brand} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <BrandAvatar brandId={brand.brand} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{brand.display_name}</div>
                    <div className="text-xs text-gray-400">@{brand.brand}</div>
                  </div>
                  <div className="text-right space-x-4 flex items-center">
                    <div>
                      <div className="text-sm font-semibold tabular-nums" style={{ color }}>{formatNum(brand.totals.followers)}</div>
                      <div className="text-[10px] text-gray-400">followers</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-700 tabular-nums">{formatNum(brand.totals.views_7d)}</div>
                      <div className="text-[10px] text-gray-400">views/7d</div>
                    </div>
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: hasRecentScheduled ? '#10b981' : '#f59e0b',
                        boxShadow: `0 0 6px ${hasRecentScheduled ? '#10b981' : '#f59e0b'}`,
                      }}
                      title={hasRecentScheduled ? 'Content scheduled' : 'No upcoming content'}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Jobs Queue */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Jobs Queue</h2>
            <button onClick={() => navigate('/jobs')} className="text-xs text-primary-500 font-medium hover:underline">
              View All →
            </button>
          </div>
          {/* Summary row */}
          <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
            <div className="px-4 py-3">
              <div className="text-2xl font-bold tabular-nums text-gray-900">{readyJobs}</div>
              <div className="text-[11px] text-gray-400">Completed</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-2xl font-bold tabular-nums text-gray-900">{inProgressJobs}</div>
              <div className="text-[11px] text-gray-400">In Progress</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-2xl font-bold tabular-nums text-gray-900">{scheduledCount}</div>
              <div className="text-[11px] text-gray-400">Scheduled</div>
            </div>
          </div>
          {/* Recent jobs */}
          <div className="divide-y divide-gray-50">
            {recentJobs.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-gray-400">No jobs yet</div>
            )}
            {recentJobs.slice(0, 4).map(job => {
              const isReel = job.variant !== 'post'
              const brandId = job.brands?.[0]
              return (
                <button
                  key={job.id}
                  onClick={() => navigate(`/job/${job.id}`)}
                  className="flex items-center gap-2.5 px-5 py-2.5 hover:bg-gray-50 transition-colors w-full text-left"
                >
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                    isReel ? 'bg-violet-50 text-violet-600' : 'bg-pink-50 text-pink-600'
                  }`}>
                    {isReel ? 'Reel' : 'Post'}
                  </span>
                  {brandId && <BrandAvatar brandId={brandId} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-800 truncate">{job.title || 'Untitled'}</div>
                    <div className="text-[11px] text-gray-400">{timeAgo(job.created_at)}</div>
                  </div>
                  <JobStatusBadge status={job.status} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Publishing Today */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col max-h-[480px]">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
            <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Publishing Today
              <span className="text-gray-400 normal-case lowercase font-normal">
                ({todayPosts.length} item{todayPosts.length !== 1 ? 's' : ''})
              </span>
            </h2>
            <button onClick={() => navigate('/calendar')} className="text-xs text-primary-500 font-medium hover:underline">
              Calendar →
            </button>
          </div>
          {/* Full timeline */}
          <div className="divide-y divide-gray-50 flex-1 overflow-y-auto">
            {todayPosts.map((post, i) => {
              const postTime = new Date(post.scheduled_time)
              const isPast = postTime < now
              const isPublished = post.status === 'published'
              const isNext = !isPast && (i === 0 || new Date(todayPosts[i - 1].scheduled_time) < now)
              return (
                <div key={post.id}>
                  {isNext && (
                    <div className="flex items-center gap-2 px-5 py-1.5 bg-amber-50 border-b border-gray-50">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">
                        Now — {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                  <div className={`flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors ${isPast ? 'opacity-40' : ''}`}>
                    <span className={`text-xs font-mono tabular-nums min-w-[44px] ${isNext ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                      {formatTime(post.scheduled_time)}
                    </span>
                    <div className="w-px h-6 bg-gray-200 shrink-0" style={isNext ? { backgroundColor: '#f59e0b' } : {}} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800">{getBrandName(post.brand)}</div>
                      <div className="text-[11px] text-gray-400">
                        {post.metadata?.variant === 'post' ? 'Post' : post.metadata?.variant === 'dark' ? '🌙 Dark Reel' : '☀️ Light Reel'}
                        {isPublished && ' · Published ✓'}
                        {isNext && ' · Up next'}
                      </div>
                    </div>
                    <BrandAvatar brandId={post.brand} size="sm" />
                  </div>
                </div>
              )
            })}
            </div>
        </div>
      </div>

      {/* Row 3: Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recent Jobs</h2>
          <button onClick={() => navigate('/jobs')} className="text-xs text-primary-500 font-medium hover:underline">
            All Jobs →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
                <th className="px-5 py-2.5 font-medium">Type</th>
                <th className="px-5 py-2.5 font-medium">Title</th>
                <th className="px-5 py-2.5 font-medium">Brand</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentJobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-400">No jobs yet</td>
                </tr>
              )}
              {recentJobs.map(job => {
                const isReel = job.variant !== 'post'
                const brandId = job.brands?.[0]
                const brandName = brandId ? getBrandName(brandId) : 'Unknown'
                return (
                  <tr
                    key={job.id}
                    onClick={() => navigate(`/job/${job.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-2.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        isReel ? 'bg-violet-50 text-violet-600' : 'bg-pink-50 text-pink-600'
                      }`}>
                        {isReel ? 'Reel' : 'Post'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 max-w-[300px]">
                      <span className="text-gray-800 font-medium text-xs leading-snug line-clamp-2">{job.title || 'Untitled'}</span>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        {brandId && <BrandAvatar brandId={brandId} size="sm" />}
                        <span className="text-gray-600 text-xs">{brandName}</span>
                        {job.brands.length > 1 && (
                          <span className="text-[10px] text-gray-400">+{job.brands.length - 1}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-2.5">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="px-5 py-2.5 text-xs text-gray-400">{timeAgo(job.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ----- Sub-components ----- */

function StatsCard({ label, value, sub, change }: { label: string; value: string; sub?: string; change?: number | null }) {
  const hasChange = change !== undefined
  const isPositive = change != null && change >= 0
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums text-gray-900">{value}</div>
      {hasChange ? (
        change != null ? (
          <div className={`flex items-center gap-0.5 mt-1 text-[11px] font-semibold ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
            {isPositive
              ? <TrendingUp className="w-3 h-3 shrink-0" />
              : <TrendingDown className="w-3 h-3 shrink-0" />}
            <span>{isPositive ? '+' : ''}{change}% vs last week</span>
          </div>
        ) : (
          <div className="flex items-center gap-0.5 mt-1 text-[11px] font-semibold text-gray-400">
            <span>0% vs last week</span>
          </div>
        )
      ) : sub ? (
        <div className="text-[11px] text-gray-400 mt-1">{sub}</div>
      ) : null}
    </div>
  )
}

function SlotChip({ hour, filled, isPast, isSoon, kind, variant }: { hour: number; filled: boolean; isPast: boolean; isSoon: boolean; kind: 'reel' | 'post'; variant?: 'light' | 'dark' }) {
  const label = fmtSlotHour(hour)
  const variantLabel = kind === 'reel' && variant ? (variant === 'dark' ? '🌙 Dark' : '☀️ Light') : ''
  const typeLabel = kind === 'reel' ? 'Reel' : 'Carousel'
  const stateLabel = filled ? 'Filled' : isPast ? 'Missed' : isSoon ? 'Up next' : 'Open'
  const tipText = [typeLabel, variantLabel, stateLabel, label].filter(Boolean).join(' · ')

  // Variant accent colors for reel icons
  const lightAccent = '#f59e0b'  // amber/sun
  const darkAccent = '#6366f1'   // indigo/moon

  // Background & text based on state
  let bg: string, textCls: string, border: string, iconColor: string
  if (filled) {
    bg = 'bg-green-100'; textCls = 'text-green-700'; border = 'border-green-200'
    iconColor = kind === 'reel' ? (variant === 'dark' ? darkAccent : lightAccent) : '#16a34a'
  } else if (isPast) {
    bg = 'bg-rose-50'; textCls = 'text-rose-400'; border = 'border-rose-200'
    iconColor = kind === 'reel' ? (variant === 'dark' ? '#a5b4fc' : '#fcd34d') : '#fb7185'
  } else if (isSoon) {
    bg = 'bg-amber-50'; textCls = 'text-amber-600'; border = 'border-amber-300 border-dashed'
    iconColor = kind === 'reel' ? (variant === 'dark' ? darkAccent : lightAccent) : '#f59e0b'
  } else {
    bg = 'bg-gray-50'; textCls = 'text-gray-300'; border = 'border-gray-200'
    iconColor = kind === 'reel' ? (variant === 'dark' ? '#c7d2fe' : '#fde68a') : '#d1d5db'
  }

  return (
    <span
      className={`inline-flex flex-col items-center gap-[3px] px-1.5 pt-1 pb-0.5 rounded border cursor-default select-none ${bg} ${border}`}
      title={tipText}
    >
      {/* Type icon */}
      {kind === 'reel' ? (
        // Circle dot = reel, colored by variant
        <span
          className="block rounded-full shrink-0"
          style={{ width: 6, height: 6, backgroundColor: iconColor }}
        />
      ) : (
        // Carousel = horizontal line
        <span
          className="block rounded-full shrink-0"
          style={{ width: 8, height: 2, backgroundColor: iconColor }}
        />
      )}
      {/* Time label */}
      <span className={`text-[9px] font-mono font-bold leading-none ${textCls}`}>{label}</span>
    </span>
  )
}

function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    completed: { bg: 'bg-green-50', text: 'text-green-600', label: 'Completed' },
    generating: { bg: 'bg-orange-50', text: 'text-orange-600', label: 'Generating' },
    pending: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Pending' },
    failed: { bg: 'bg-red-50', text: 'text-red-600', label: 'Failed' },
    cancelled: { bg: 'bg-gray-100', text: 'text-gray-400', label: 'Cancelled' },
    scheduled: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Scheduled' },
  }
  const s = map[status] || { bg: 'bg-gray-100', text: 'text-gray-500', label: status }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}
