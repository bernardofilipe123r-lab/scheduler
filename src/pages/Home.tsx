import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, Sparkles } from 'lucide-react'
import { useAnalytics } from '@/features/analytics'
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

export function HomePage() {
  const navigate = useNavigate()
  const { data: analyticsData, isLoading: analyticsLoading } = useAnalytics()
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

  // Job counts
  const readyJobs = jobsArray.filter(j => j.status === 'completed').length
  const inProgressJobs = jobsArray.filter(j => j.status === 'generating' || j.status === 'pending').length
  const scheduledCount = postsArray.filter(p => p.status === 'scheduled').length

  // Today's schedule
  const today = new Date().toDateString()
  const todayPosts = postsArray
    .filter(p => new Date(p.scheduled_time).toDateString() === today)
    .sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime())

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
        <StatsCard label="Total Followers" value={formatNum(totalFollowers)} />
        <StatsCard label="Views (7d)" value={formatNum(totalViews7d)} />
        <StatsCard label="Likes (7d)" value={formatNum(totalLikes7d)} />
        <StatsCard
          label="Jobs Ready"
          value={String(readyJobs)}
          sub={inProgressJobs > 0 ? `${inProgressJobs} in progress` : undefined}
        />
        <StatsCard label="Scheduled" value={String(scheduledCount)} />
      </div>

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
                        {post.metadata?.variant === 'post' ? 'Post' : 'Reel'}
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

function StatsCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums text-gray-900">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-1">{sub}</div>}
    </div>
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
