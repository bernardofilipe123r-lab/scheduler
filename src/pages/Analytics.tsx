import { useState, useMemo, useEffect, useRef } from 'react'
import {
  BarChart3,
  Users,
  Eye,
  Heart,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  Filter,
  TrendingUp,
  ChevronDown,
  Loader2,
  History,
  Instagram,
  Facebook,
  Youtube,
  X,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
} from 'recharts'
import {
  useAnalytics,
  useRefreshAnalytics,
  useSnapshots,
  useBackfillHistoricalData,
  type BrandMetrics,
  type PlatformMetrics,
  type AnalyticsSnapshot,
} from '@/features/analytics'
import { PageLoader } from '@/shared/components'
import { useDynamicBrands } from '@/features/brands'

// ─── Constants ──────────────────────────────────────────────────────

// Brand colors and labels are built dynamically from API data.
// No hardcoded brand entries — populated at runtime from analytics response + useDynamicBrands.

// ─── Utility functions ──────────────────────────────────────────────

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toLocaleString()
}

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return 'Never'
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function formatDateKey(dateString: string): string {
  return new Date(dateString).toISOString().slice(0, 10)
}

// ─── Small components ───────────────────────────────────────────────

function PlatformIcon({ platform, className = 'w-4 h-4' }: { platform: string; className?: string }) {
  switch (platform) {
    case 'instagram': return <Instagram className={className} />
    case 'facebook':  return <Facebook className={className} />
    case 'youtube':   return <Youtube className={className} />
    default:          return null
  }
}

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-gray-50 ${color}`}>{icon}</div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(value)}</p>
        </div>
      </div>
    </div>
  )
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  )
}

function PlatformRow({ platform, metrics }: { platform: string; metrics: PlatformMetrics }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-50 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-2 w-28">
        <PlatformIcon platform={platform} className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700 capitalize">{platform}</span>
      </div>
      <div className="text-xs text-gray-400 flex-shrink-0">
        Updated {formatTimeAgo(metrics.last_fetched_at)}
      </div>
      <div className="flex-1" />
      <div className="text-right w-20">
        <p className="text-xs text-gray-400">Followers</p>
        <p className="text-sm font-semibold text-gray-800">{formatNumber(metrics.followers_count)}</p>
      </div>
      <div className="text-right w-20">
        <p className="text-xs text-gray-400">Views (7d)</p>
        <p className="text-sm font-semibold text-gray-800">{formatNumber(metrics.views_last_7_days)}</p>
      </div>
      <div className="text-right w-20">
        <p className="text-xs text-gray-400">Likes (7d)</p>
        <p className="text-sm font-semibold text-pink-500">{formatNumber(metrics.likes_last_7_days)}</p>
      </div>
    </div>
  )
}

function BrandCard({ brand }: { brand: BrandMetrics }) {
  const platforms = Object.entries(brand.platforms)
  const hasPlatforms = platforms.length > 0

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{ borderLeft: `4px solid ${brand.color}` }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
          style={{ backgroundColor: brand.color }}
        >
          {brand.display_name.charAt(0)}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{brand.display_name}</h3>
          <p className="text-sm text-gray-500">
            {hasPlatforms
              ? `${platforms.length} platform${platforms.length > 1 ? 's' : ''} connected`
              : 'No platforms connected'}
          </p>
        </div>
        {hasPlatforms && (
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-xs text-gray-500">Followers</p>
              <p className="font-bold text-lg" style={{ color: brand.color }}>
                {formatNumber(brand.totals.followers)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Views (7d)</p>
              <p className="font-bold text-lg text-gray-700">
                {formatNumber(brand.totals.views_7d)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Likes (7d)</p>
              <p className="font-bold text-lg text-pink-500">
                {formatNumber(brand.totals.likes_7d)}
              </p>
            </div>
          </div>
        )}
      </div>
      {hasPlatforms ? (
        <div className="border-t border-gray-100">
          {platforms.map(([p, m]) => (
            <PlatformRow key={p} platform={p} metrics={m} />
          ))}
        </div>
      ) : (
        <div className="px-5 py-8 text-center text-gray-400 border-t border-gray-100">
          <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No analytics data yet.</p>
        </div>
      )}
    </div>
  )
}

// ─── Refresh overlay ────────────────────────────────────────────────

// ~12s per brand × 3 platforms; 5 brands = ~60s typical
const ESTIMATED_TOTAL_SECONDS = 60

function RefreshOverlay({
  elapsedSeconds,
  onCancel,
}: {
  elapsedSeconds: number
  onCancel: () => void
}) {
  const remaining = Math.max(0, ESTIMATED_TOTAL_SECONDS - elapsedSeconds)
  const remainingMins = Math.floor(remaining / 60)
  const remainingSecs = remaining % 60

  const estimateLabel =
    remaining === 0
      ? 'Almost done…'
      : remainingMins > 0
        ? `~${remainingMins}m ${remainingSecs}s remaining`
        : `~${remainingSecs}s remaining`

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl relative">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Refreshing Analytics</h3>
        <p className="text-sm text-gray-500 mb-3">
          Fetching data from Instagram, Facebook &amp; YouTube…
        </p>
        <p className="text-xs text-gray-400 font-mono mb-4">
          {estimateLabel}
        </p>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Data helpers ───────────────────────────────────────────────────

/**
 * Build cumulative chart data: {date, brand1: val, brand2: val, ...}
 * Deduplicates to latest snapshot per (brand, platform, day) then
 * sums all platforms per brand.
 */
function buildCumulativeData(
  snapshots: AnalyticsSnapshot[],
  metric: 'followers_count' | 'views_last_7_days' | 'likes_last_7_days',
  filterBrand?: string,
) {
  // 1. Deduplicate: latest per (brand, platform, dateKey)
  const latest = new Map<string, AnalyticsSnapshot>()
  for (const s of snapshots) {
    const dk = formatDateKey(s.snapshot_at)
    const key = `${s.brand}|${s.platform}|${dk}`
    const existing = latest.get(key)
    if (!existing || new Date(s.snapshot_at) > new Date(existing.snapshot_at)) {
      latest.set(key, s)
    }
  }

  // 2. Aggregate by (date, brand) — sum platforms
  const byDateBrand = new Map<string, Map<string, number>>()
  const allDates = new Set<string>()
  const allBrands = new Set<string>()

  for (const s of latest.values()) {
    if (filterBrand && s.brand !== filterBrand) continue
    const dk = formatDateKey(s.snapshot_at)
    allDates.add(dk)
    allBrands.add(s.brand)

    if (!byDateBrand.has(dk)) byDateBrand.set(dk, new Map())
    const bm = byDateBrand.get(dk)!
    bm.set(s.brand, (bm.get(s.brand) || 0) + s[metric])
  }

  // 3. Sorted rows
  const sortedDates = [...allDates].sort()
  return sortedDates.map((dk) => {
    const row: Record<string, number | string> = { date: formatDate(dk), dateKey: dk }
    const bm = byDateBrand.get(dk)
    for (const b of allBrands) {
      row[b] = bm?.get(b) ?? 0
    }
    return row
  })
}

/**
 * Calculate daily delta from cumulative data.
 * Returns the chart rows + overall average.
 */
function buildDailyGainData(
  snapshots: AnalyticsSnapshot[],
  metric: 'followers_count' | 'views_last_7_days' | 'likes_last_7_days',
  filterBrand?: string,
): { data: Record<string, number | string>[]; average: number } {
  const cum = buildCumulativeData(snapshots, metric, filterBrand)
  if (cum.length < 2) return { data: [], average: 0 }

  const brands = Object.keys(cum[0]).filter((k) => k !== 'date' && k !== 'dateKey')
  const dailyData: Record<string, number | string>[] = []
  let totalGain = 0
  let totalEntries = 0

  for (let i = 1; i < cum.length; i++) {
    const row: Record<string, number | string> = { date: cum[i].date as string, dateKey: cum[i].dateKey as string }
    let dayTotal = 0
    for (const b of brands) {
      const prev = (cum[i - 1][b] as number) || 0
      const curr = (cum[i][b] as number) || 0
      const delta = Math.max(0, curr - prev)
      row[b] = delta
      dayTotal += delta
    }
    row['_total'] = dayTotal
    totalGain += dayTotal
    totalEntries++
    dailyData.push(row)
  }

  return {
    data: dailyData,
    average: totalEntries > 0 ? Math.round(totalGain / totalEntries) : 0,
  }
}

// ─── Empty chart placeholder ────────────────────────────────────────

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-gray-400">
      <div className="text-center">
        <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">{message}</p>
        <p className="text-xs mt-1">Analytics auto-refresh every 6 hours</p>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────

export function AnalyticsPage() {
  const { data, isLoading, error } = useAnalytics()
  const refreshMutation = useRefreshAnalytics()
  const backfillMutation = useBackfillHistoricalData()
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [backfillSuccess, setBackfillSuccess] = useState<string | null>(null)
  const [hasAutoRefreshed, setHasAutoRefreshed] = useState(false)
  const { brands: dynamicBrands } = useDynamicBrands()

  // Build brand color/label maps dynamically from API data + dynamic brands
  const BRAND_COLORS = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const b of dynamicBrands) map[b.id] = b.color
    // Also pick up any brands from analytics data not yet in dynamicBrands
    for (const bm of data?.brands || []) if (!map[bm.brand]) map[bm.brand] = bm.color || '#888'
    return map
  }, [dynamicBrands, data?.brands])

  const BRAND_LABELS = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const b of dynamicBrands) map[b.id] = b.label
    for (const bm of data?.brands || []) if (!map[bm.brand]) map[bm.brand] = bm.display_name || bm.brand
    return map
  }, [dynamicBrands, data?.brands])

  // Auto-refresh on page load if data is stale
  useEffect(() => {
    if (data?.needs_refresh && !hasAutoRefreshed && !refreshMutation.isPending) {
      setHasAutoRefreshed(true)
      refreshMutation.mutate()
    }
  }, [data?.needs_refresh, hasAutoRefreshed, refreshMutation])

  // Elapsed timer for refresh overlay
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (refreshMutation.isPending) {
      setElapsedSeconds(0)
      timerRef.current = setInterval(() => setElapsedSeconds((p) => p + 1), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [refreshMutation.isPending])

  // Filters
  const [selectedBrand, setSelectedBrand] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<number>(30)

  // Fetch snapshots (backend now deduplicates per day)
  const { data: snapshotsData } = useSnapshots({ days: timeRange })

  const handleRefresh = async () => {
    setRefreshError(null)
    try { await refreshMutation.mutateAsync() }
    catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 429)
        setRefreshError('Rate limit exceeded. Please wait before refreshing again.')
      else
        setRefreshError('Failed to refresh analytics. Please try again.')
    }
  }

  const handleBackfill = async () => {
    setBackfillSuccess(null)
    setRefreshError(null)
    try {
      const result = await backfillMutation.mutateAsync(28)
      setBackfillSuccess(
        `${result.deleted_count ? `Cleared ${result.deleted_count} old entries. ` : ''}Backfilled ${result.snapshots_created} snapshots.${result.note ? ` ${result.note}` : ''}`
      )
    } catch {
      setRefreshError('Failed to backfill historical data. Please try again.')
    }
  }

  // ── Computed data ──

  const totals = useMemo(() => {
    const brands = data?.brands || []
    return brands.reduce(
      (acc, b) => ({
        followers: acc.followers + b.totals.followers,
        views: acc.views + b.totals.views_7d,
        likes: acc.likes + b.totals.likes_7d,
      }),
      { followers: 0, views: 0, likes: 0 }
    )
  }, [data?.brands])

  const snapshots = snapshotsData?.snapshots || []

  // Cumulative followers over time
  const followerTrendData = useMemo(
    () => buildCumulativeData(snapshots, 'followers_count', selectedBrand !== 'all' ? selectedBrand : undefined),
    [snapshots, selectedBrand]
  )

  // Daily follower growth
  const followerGain = useMemo(
    () => buildDailyGainData(snapshots, 'followers_count', selectedBrand !== 'all' ? selectedBrand : undefined),
    [snapshots, selectedBrand]
  )

  // Daily views
  const viewsGain = useMemo(
    () => buildDailyGainData(snapshots, 'views_last_7_days', selectedBrand !== 'all' ? selectedBrand : undefined),
    [snapshots, selectedBrand]
  )

  // Brands to render in charts
  const chartBrands = useMemo(() => {
    if (selectedBrand !== 'all') return [selectedBrand]
    return Object.keys(BRAND_COLORS)
  }, [selectedBrand, BRAND_COLORS])

  // Filter brand cards
  const filteredBrands = useMemo(() => {
    const brands = data?.brands || []
    if (selectedBrand !== 'all') return brands.filter((b) => b.brand === selectedBrand)
    return brands
  }, [data?.brands, selectedBrand])

  // ── Render ──

  if (isLoading) return <PageLoader page="analytics" />

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to load analytics</h2>
          <p className="text-gray-500">Please try refreshing the page.</p>
        </div>
      </div>
    )
  }

  const brands = data?.brands || []
  const lastRefresh = data?.last_refresh

  const brandOptions = [
    { value: 'all', label: 'All Brands' },
    ...brands.map((b) => ({ value: b.brand, label: b.display_name })),
  ]
  const timeOptions = [
    { value: '7', label: 'Last 7 days' },
    { value: '14', label: 'Last 14 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '60', label: 'Last 60 days' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {refreshMutation.isPending && (
        <RefreshOverlay
          elapsedSeconds={elapsedSeconds}
          onCancel={() => {
            // AbortController not available on mutateAsync; hide overlay
            // The request finishes in the background but user is unblocked
            refreshMutation.reset()
          }}
        />
      )}

      <div
        className={`max-w-7xl mx-auto px-6 py-8 transition-all duration-300 ${
          refreshMutation.isPending ? 'opacity-50 blur-sm pointer-events-none' : ''
        }`}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-7 h-7" />
              Analytics
            </h1>
            <p className="text-gray-500 mt-1">
              Track follower growth &amp; daily performance across all brands
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-sm text-gray-400 flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatTimeAgo(lastRefresh)}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleBackfill}
              disabled={backfillMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
              title="Fetch 28 days of historical data"
            >
              <History className={`w-4 h-4 ${backfillMutation.isPending ? 'animate-spin' : ''}`} />
              Backfill
            </button>
          </div>
        </div>

        {/* ── Status messages ── */}
        {refreshMutation.isSuccess && !refreshError && (
          <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
            <CheckCircle2 className="w-4 h-4" /> Analytics refreshed successfully!
          </div>
        )}
        {backfillSuccess && (
          <div className="mb-4 px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg flex items-center gap-2 text-purple-700 text-sm">
            <CheckCircle2 className="w-4 h-4" /> {backfillSuccess}
          </div>
        )}
        {refreshError && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4" /> {refreshError}
          </div>
        )}

        {/* ── Filters ── */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-6 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-gray-500">
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          <FilterDropdown label="Brand" value={selectedBrand} options={brandOptions} onChange={setSelectedBrand} />
          <FilterDropdown
            label="Time Range"
            value={timeRange.toString()}
            options={timeOptions}
            onChange={(v) => setTimeRange(parseInt(v))}
          />
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <MetricCard icon={<Users className="w-5 h-5" />} label="Total Followers" value={totals.followers} color="text-blue-600" />
          <MetricCard icon={<Eye className="w-5 h-5" />} label="Total Views (7d)" value={totals.views} color="text-green-600" />
          <MetricCard icon={<Heart className="w-5 h-5" />} label="Total Likes (7d)" value={totals.likes} color="text-pink-500" />
        </div>

        {/* ── 1. Followers Over Time (cumulative) ── */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold text-gray-900">Followers Over Time</h3>
          </div>
          <p className="text-xs text-gray-400 mb-4">Cumulative follower count per brand (all platforms combined)</p>

          {followerTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={followerTrendData}>
                <defs>
                  {chartBrands.map((b) => (
                    <linearGradient key={b} id={`fg-${b}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BRAND_COLORS[b] || '#888'} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={BRAND_COLORS[b] || '#888'} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#aaa" />
                <YAxis tick={{ fontSize: 11 }} stroke="#aaa" tickFormatter={formatNumber} />
                <Tooltip
                  formatter={(value, name) => [formatNumber(Number(value ?? 0)), BRAND_LABELS[name ?? ''] || name || '']}
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Legend formatter={(v) => BRAND_LABELS[v] || v} />
                {chartBrands.map((b) => (
                  <Area
                    key={b}
                    type="monotone"
                    dataKey={b}
                    stroke={BRAND_COLORS[b] || '#888'}
                    fill={`url(#fg-${b})`}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No follower data yet" />
          )}
        </div>

        {/* ── 2. Daily Follower Growth ── */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-green-500" />
            <h3 className="font-semibold text-gray-900">Daily New Followers</h3>
            {followerGain.average > 0 && (
              <span className="ml-2 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                avg {formatNumber(followerGain.average)}/day
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-4">
            New followers gained each day — dashed line is the average
          </p>

          {followerGain.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={followerGain.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#aaa" />
                <YAxis tick={{ fontSize: 11 }} stroke="#aaa" tickFormatter={formatNumber} />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'Average') return [formatNumber(Number(value ?? 0)), name]
                    return [formatNumber(Number(value ?? 0)), BRAND_LABELS[name ?? ''] || name || '']
                  }}
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Legend formatter={(v) => (v === 'Average' ? v : BRAND_LABELS[v] || v)} />
                {chartBrands.map((b) => (
                  <Bar key={b} dataKey={b} stackId="stack" fill={BRAND_COLORS[b] || '#888'} radius={[2, 2, 0, 0]} />
                ))}
                <ReferenceLine
                  y={followerGain.average}
                  stroke="#6B7280"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{ value: 'avg', position: 'right', fill: '#6B7280', fontSize: 11 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Tracking started — daily growth chart will appear after 2 days of data collection" />
          )}
        </div>

        {/* ── 3. Daily Views ── */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-5 h-5 text-purple-500" />
            <h3 className="font-semibold text-gray-900">Daily Views</h3>
            {viewsGain.average > 0 && (
              <span className="ml-2 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                avg {formatNumber(viewsGain.average)}/day
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Views per day — dashed line is the average
          </p>

          {viewsGain.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={viewsGain.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#aaa" />
                <YAxis tick={{ fontSize: 11 }} stroke="#aaa" tickFormatter={formatNumber} />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'Average') return [formatNumber(Number(value ?? 0)), name]
                    return [formatNumber(Number(value ?? 0)), BRAND_LABELS[name ?? ''] || name || '']
                  }}
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Legend formatter={(v) => (v === 'Average' ? v : BRAND_LABELS[v] || v)} />
                {chartBrands.map((b) => (
                  <Bar key={b} dataKey={b} stackId="stack" fill={BRAND_COLORS[b] || '#888'} radius={[2, 2, 0, 0]} />
                ))}
                <ReferenceLine
                  y={viewsGain.average}
                  stroke="#6B7280"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{ value: 'avg', position: 'right', fill: '#6B7280', fontSize: 11 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Tracking started — daily views chart will appear after 2 days of data collection" />
          )}
        </div>

        {/* ── Brand Cards ── */}
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Detailed Breakdown</h2>
        {filteredBrands.length > 0 ? (
          <div className="space-y-4">
            {filteredBrands.map((b) => (
              <BrandCard key={b.brand} brand={b} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-200">
            <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No analytics data yet</h2>
            <p className="text-gray-500 mb-6">
              Connect your social media accounts and click refresh to fetch analytics.
            </p>
            <button
              onClick={handleRefresh}
              disabled={refreshMutation.isPending}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 inline mr-2 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
              Fetch Analytics
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
