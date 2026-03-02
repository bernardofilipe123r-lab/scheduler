import { useState, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  History,
  Instagram,
  Facebook,
  Youtube,
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
  useRefreshStatus,
  useSnapshots,
  useBackfillHistoricalData,
  type BrandMetrics,
  type PlatformMetrics,
  type AnalyticsSnapshot,
} from '@/features/analytics'
import { AnalyticsSkeleton } from '@/shared/components'
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
    case 'facebook':  return <Facebook className={className} />
    case 'youtube':   return <Youtube className={className} />
    case 'threads':   return <ThreadsIcon className={className} />
    case 'tiktok':    return <TikTokIcon className={className} />
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

function PlatformRow({ platform, metrics, connected = true }: { platform: string; metrics: PlatformMetrics; connected?: boolean }) {
  return (
    <div className={`flex items-center gap-4 px-5 py-3 border-t border-gray-50 hover:bg-gray-50 transition-colors ${!connected ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 w-28">
        <PlatformIcon platform={platform} className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700 capitalize">{platform}</span>
      </div>
      <div className="text-xs text-gray-400 flex-shrink-0">
        {connected ? `Updated ${formatTimeAgo(metrics.last_fetched_at)}` : 'Not connected'}
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

function BrandCard({ brand, platformFilter }: { brand: BrandMetrics; platformFilter?: string }) {
  const allPlatforms = Object.entries(brand.platforms)
  const connectedPlatforms = platformFilter
    ? allPlatforms.filter(([p]) => p === platformFilter)
    : allPlatforms
  const isConnected = connectedPlatforms.length > 0

  // When filtering a platform not connected, show a "not connected" row with 0s
  const platforms: [string, PlatformMetrics][] = platformFilter && !isConnected
    ? [[platformFilter, { platform: platformFilter, followers_count: 0, views_last_7_days: 0, likes_last_7_days: 0, last_fetched_at: null }]]
    : connectedPlatforms

  // Compute totals based on filtered platforms
  const cardTotals = platformFilter
    ? platforms.reduce(
        (acc, [, m]) => ({
          followers: acc.followers + m.followers_count,
          views_7d: acc.views_7d + m.views_last_7_days,
          likes_7d: acc.likes_7d + m.likes_last_7_days,
        }),
        { followers: 0, views_7d: 0, likes_7d: 0 }
      )
    : brand.totals

  const connectedCount = platformFilter
    ? (brand.platforms[platformFilter] ? 1 : 0)
    : allPlatforms.length

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
            {connectedCount > 0
              ? `${connectedCount} platform${connectedCount > 1 ? 's' : ''} connected`
              : platformFilter
                ? `${platformFilter} not connected`
                : 'No platforms connected'}
          </p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-xs text-gray-500">Followers</p>
            <p className="font-bold text-lg" style={{ color: brand.color }}>
              {formatNumber(cardTotals.followers)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Views (7d)</p>
            <p className="font-bold text-lg text-gray-700">
              {formatNumber(cardTotals.views_7d)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Likes (7d)</p>
            <p className="font-bold text-lg text-pink-500">
              {formatNumber(cardTotals.likes_7d)}
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-gray-100">
        {platforms.map(([p, m]) => (
          <PlatformRow key={p} platform={p} metrics={m} connected={!!brand.platforms[p]} />
        ))}
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
  filterPlatform?: string,
) {
  // 1. Deduplicate: latest per (brand, platform, dateKey)
  const latest = new Map<string, AnalyticsSnapshot>()
  for (const s of snapshots) {
    if (filterPlatform && s.platform !== filterPlatform) continue
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
  filterPlatform?: string,
): { data: Record<string, number | string>[]; average: number } {
  const cum = buildCumulativeData(snapshots, metric, filterBrand, filterPlatform)
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
  const { data, isLoading, error, refetch: refetchAnalytics } = useAnalytics()
  const refreshMutation = useRefreshAnalytics()
  const { data: refreshStatus } = useRefreshStatus()
  const backfillMutation = useBackfillHistoricalData()
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [backfillSuccess, setBackfillSuccess] = useState<string | null>(null)
  const { brands: dynamicBrands } = useDynamicBrands()
  const queryClient = useQueryClient()

  // Server-side refresh tracking — is_refreshing comes from backend poll
  const isRefreshing = refreshStatus?.is_refreshing ?? false
  // Track previous refreshing state to detect completion
  const [wasRefreshing, setWasRefreshing] = useState(false)

  useEffect(() => {
    if (wasRefreshing && !isRefreshing) {
      // Refresh just completed — reload analytics data + snapshots
      refetchAnalytics()
      queryClient.invalidateQueries({ queryKey: ['analytics-snapshots'] })
    }
    setWasRefreshing(isRefreshing)
  }, [isRefreshing])

  // 3-hour cooldown tracked in localStorage
  const COOLDOWN_MS = 3 * 60 * 60 * 1000
  const LS_KEY = 'analytics_last_refresh'
  const getLastRefresh = () => Number(localStorage.getItem(LS_KEY) || 0)
  const [cooldownMs, setCooldownMs] = useState(() => {
    const remaining = COOLDOWN_MS - (Date.now() - getLastRefresh())
    return remaining > 0 ? remaining : 0
  })

  // Tick cooldown every second
  useEffect(() => {
    if (cooldownMs <= 0) return
    const id = setInterval(() => {
      const remaining = COOLDOWN_MS - (Date.now() - getLastRefresh())
      setCooldownMs(remaining > 0 ? remaining : 0)
    }, 1000)
    return () => clearInterval(id)
  }, [cooldownMs > 0])

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

  // Filters
  const [selectedBrand, setSelectedBrand] = useState<string>('all')
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<number>(30)

  // All supported platforms — always shown in filter even if not connected
  const ALL_PLATFORMS = ['facebook', 'instagram', 'threads', 'tiktok', 'youtube']

  // Fetch snapshots (backend now deduplicates per day)
  const { data: snapshotsData } = useSnapshots({ days: timeRange })

  const handleRefresh = async () => {
    setRefreshError(null)
    try {
      await refreshMutation.mutateAsync()
      localStorage.setItem(LS_KEY, String(Date.now()))
      setCooldownMs(COOLDOWN_MS)
    } catch (err: unknown) {
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
    const filtered = selectedBrand !== 'all' ? brands.filter(b => b.brand === selectedBrand) : brands
    if (selectedPlatform !== 'all') {
      // Sum only the selected platform across brands
      return filtered.reduce(
        (acc, b) => {
          const pm = b.platforms[selectedPlatform]
          if (!pm) return acc
          return {
            followers: acc.followers + pm.followers_count,
            views: acc.views + pm.views_last_7_days,
            likes: acc.likes + pm.likes_last_7_days,
          }
        },
        { followers: 0, views: 0, likes: 0 }
      )
    }
    return filtered.reduce(
      (acc, b) => ({
        followers: acc.followers + b.totals.followers,
        views: acc.views + b.totals.views_7d,
        likes: acc.likes + b.totals.likes_7d,
      }),
      { followers: 0, views: 0, likes: 0 }
    )
  }, [data?.brands, selectedBrand, selectedPlatform])

  const snapshots = snapshotsData?.snapshots || []

  const brandFilter = selectedBrand !== 'all' ? selectedBrand : undefined
  const platformFilter = selectedPlatform !== 'all' ? selectedPlatform : undefined

  // Cumulative followers over time
  const followerTrendData = useMemo(
    () => buildCumulativeData(snapshots, 'followers_count', brandFilter, platformFilter),
    [snapshots, brandFilter, platformFilter]
  )

  // Daily follower growth
  const followerGain = useMemo(
    () => buildDailyGainData(snapshots, 'followers_count', brandFilter, platformFilter),
    [snapshots, brandFilter, platformFilter]
  )

  // Daily views
  const viewsGain = useMemo(
    () => buildDailyGainData(snapshots, 'views_last_7_days', brandFilter, platformFilter),
    [snapshots, brandFilter, platformFilter]
  )

  // Brands to render in charts
  const chartBrands = useMemo(() => {
    if (selectedBrand !== 'all') return [selectedBrand]
    return Object.keys(BRAND_COLORS)
  }, [selectedBrand, BRAND_COLORS])

  // Filter brand cards
  const filteredBrands = useMemo(() => {
    let brands = data?.brands || []
    if (selectedBrand !== 'all') brands = brands.filter((b) => b.brand === selectedBrand)
    // Don't filter brands out when platform has no data — show them with 0s
    return brands
  }, [data?.brands, selectedBrand, selectedPlatform])

  // ── Render ──

  if (isLoading) return <AnalyticsSkeleton />

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
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
  const platformOptions = [
    { value: 'all', label: 'All Platforms' },
    ...ALL_PLATFORMS.map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) })),
  ]
  const timeOptions = [
    { value: '7', label: 'Last 7 days' },
    { value: '14', label: 'Last 14 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '60', label: 'Last 60 days' },
  ]

  return (
    <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
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
              disabled={isRefreshing || refreshMutation.isPending || cooldownMs > 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
              title={isRefreshing ? 'Refresh in progress…' : cooldownMs > 0 ? `Available in ${Math.ceil(cooldownMs / 60000)}m` : undefined}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing || refreshMutation.isPending ? 'animate-spin' : ''}`} />
              {isRefreshing
                ? 'Refreshing…'
                : cooldownMs > 0
                  ? `${Math.ceil(cooldownMs / 60000)}m cooldown`
                  : 'Refresh'}
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
        {isRefreshing && (
          <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-blue-700 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Analytics refresh in progress…
          </div>
        )}
        {!isRefreshing && refreshMutation.isSuccess && !refreshError && (
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
          <FilterDropdown label="Platform" value={selectedPlatform} options={platformOptions} onChange={setSelectedPlatform} />
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
          <p className="text-xs text-gray-400 mb-4">Cumulative follower count per brand{platformFilter ? ` (${platformFilter} only)` : ' (all platforms combined)'}</p>

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
              <BrandCard key={b.brand} brand={b} platformFilter={platformFilter} />
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
              disabled={isRefreshing || refreshMutation.isPending}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 inline mr-2 ${isRefreshing || refreshMutation.isPending ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing…' : 'Fetch Analytics'}
            </button>
          </div>
        )}
    </div>
  )
}
