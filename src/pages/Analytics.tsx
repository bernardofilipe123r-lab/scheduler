import { useState, useMemo, useEffect, useRef } from 'react'
import { 
  BarChart3, 
  Users, 
  Eye, 
  Heart, 
  RefreshCw,
  Instagram,
  Facebook,
  Youtube,
  Clock,
  AlertCircle,
  CheckCircle2,
  Filter,
  TrendingUp,
  PieChart as PieChartIcon,
  ChevronDown,
  Loader2,
  History
} from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { 
  useAnalytics, 
  useRefreshAnalytics,
  useSnapshots,
  useBackfillHistoricalData,
  type BrandMetrics,
  type PlatformMetrics
} from '@/features/analytics'
import { FullPageLoader } from '@/shared/components'

type Platform = 'instagram' | 'facebook' | 'youtube'
type MetricType = 'followers' | 'views' | 'likes'

// Brand colors
const BRAND_COLORS: Record<string, string> = {
  healthycollege: '#004f00',
  vitalitycollege: '#028f7a',
  longevitycollege: '#019dc8',
  holisticcollege: '#f0836e',
  wellbeingcollege: '#ebbe4d',
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E4405F',
  facebook: '#1877F2',
  youtube: '#FF0000',
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toLocaleString()
}

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return 'Never'
  
  const date = new Date(dateString)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function PlatformIcon({ platform, className = 'w-5 h-5' }: { platform: Platform; className?: string }) {
  switch (platform) {
    case 'instagram':
      return <Instagram className={className} />
    case 'facebook':
      return <Facebook className={className} />
    case 'youtube':
      return <Youtube className={className} />
  }
}

function getPlatformBgColor(platform: Platform): string {
  switch (platform) {
    case 'instagram':
      return 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500'
    case 'facebook':
      return 'bg-blue-600'
    case 'youtube':
      return 'bg-red-500'
  }
}

interface RefreshOverlayProps {
  elapsedSeconds: number
  platformsStatus: { name: string; done: boolean }[]
}

function RefreshOverlay({ elapsedSeconds, platformsStatus }: RefreshOverlayProps) {
  const completedCount = platformsStatus.filter(p => p.done).length
  const totalCount = platformsStatus.length || 15 // 5 brands x 3 platforms
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  
  // Estimate ~15-20 seconds for full refresh
  const estimatedTotal = 18
  const estimatedRemaining = Math.max(0, estimatedTotal - elapsedSeconds)
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" />
      
      {/* Content */}
      <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 animate-in fade-in zoom-in duration-200">
        {/* Animated loader */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-gray-100" />
            <div 
              className="absolute inset-0 w-20 h-20 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-blue-500 animate-pulse" />
            </div>
          </div>
        </div>
        
        <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
          Refreshing Analytics
        </h3>
        
        <p className="text-gray-500 text-center mb-6">
          Fetching latest data from all platforms...
        </p>
        
        {/* Progress bar */}
        <div className="mb-4">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${Math.max(10, progress)}%` }}
            />
          </div>
        </div>
        
        {/* Stats */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <Clock className="w-4 h-4" />
            <span>Elapsed: {elapsedSeconds}s</span>
          </div>
          <div className="text-gray-500">
            {estimatedRemaining > 0 ? (
              <span>~{estimatedRemaining}s remaining</span>
            ) : (
              <span>Finishing up...</span>
            )}
          </div>
        </div>
        
        {/* Platform status */}
        <div className="mt-6 grid grid-cols-3 gap-2">
          {['Instagram', 'Facebook', 'YouTube'].map((platform) => (
            <div 
              key={platform}
              className="flex items-center gap-1.5 text-xs text-gray-500"
            >
              <div className={`w-2 h-2 rounded-full ${
                elapsedSeconds > 5 ? 'bg-green-500' : 'bg-yellow-400 animate-pulse'
              }`} />
              <span>{platform}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: number
  color?: string
  trend?: number
}

function MetricCard({ icon, label, value, color = 'text-gray-600', trend }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-gray-500">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            <TrendingUp className={`w-3 h-3 ${trend < 0 ? 'rotate-180' : ''}`} />
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <p className={`text-3xl font-bold ${color}`}>{formatNumber(value)}</p>
    </div>
  )
}

interface FilterDropdownProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

function FilterDropdown({ label, value, options, onChange }: FilterDropdownProps) {
  return (
    <div className="relative">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  )
}

interface PlatformRowProps {
  platform: string
  metrics: PlatformMetrics
}

function PlatformRow({ platform, metrics }: PlatformRowProps) {
  const platformKey = platform as Platform
  
  return (
    <div className="flex items-center gap-4 py-3 px-4 hover:bg-gray-50 border-b last:border-b-0 border-gray-100">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white ${getPlatformBgColor(platformKey)}`}>
        <PlatformIcon platform={platformKey} className="w-5 h-5" />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 capitalize">{platform}</p>
        <p className="text-xs text-gray-400">
          Updated {formatTimeAgo(metrics.last_fetched_at)}
        </p>
      </div>
      
      <div className="grid grid-cols-3 gap-8 text-center">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Followers</p>
          <p className="font-semibold text-gray-900">{formatNumber(metrics.followers_count)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Views (7d)</p>
          <p className="font-semibold text-gray-900">{formatNumber(metrics.views_last_7_days)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Likes (7d)</p>
          <p className="font-semibold text-gray-900">{formatNumber(metrics.likes_last_7_days)}</p>
        </div>
      </div>
    </div>
  )
}

interface BrandCardProps {
  brand: BrandMetrics
}

function BrandCard({ brand }: BrandCardProps) {
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
              : 'No platforms connected'
            }
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
          {platforms.map(([platform, metrics]) => (
            <PlatformRow key={platform} platform={platform} metrics={metrics} />
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

export function AnalyticsPage() {
  const { data, isLoading, error } = useAnalytics()
  const refreshMutation = useRefreshAnalytics()
  const backfillMutation = useBackfillHistoricalData()
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [backfillSuccess, setBackfillSuccess] = useState<string | null>(null)
  
  // Refresh timer state
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  
  // Start/stop timer based on refresh state
  useEffect(() => {
    if (refreshMutation.isPending) {
      setElapsedSeconds(0)
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [refreshMutation.isPending])
  
  // Filter state
  const [selectedBrand, setSelectedBrand] = useState<string>('all')
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all')
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('followers')
  const [timeRange, setTimeRange] = useState<number>(30)
  
  // Fetch snapshots for charts
  const { data: snapshotsData } = useSnapshots({
    brand: selectedBrand !== 'all' ? selectedBrand : undefined,
    platform: selectedPlatform !== 'all' ? selectedPlatform : undefined,
    days: timeRange
  })
  
  const handleRefresh = async () => {
    setRefreshError(null)
    try {
      await refreshMutation.mutateAsync()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 429) {
        setRefreshError('Rate limit exceeded. Please wait before refreshing again.')
      } else {
        setRefreshError('Failed to refresh analytics. Please try again.')
      }
    }
  }
  
  const handleBackfill = async () => {
    setBackfillSuccess(null)
    setRefreshError(null)
    try {
      const result = await backfillMutation.mutateAsync(28)
      setBackfillSuccess(`Backfilled ${result.snapshots_created} historical snapshots!`)
    } catch {
      setRefreshError('Failed to backfill historical data. Please try again.')
    }
  }
  
  // Calculate totals
  const totals = useMemo(() => {
    const brands = data?.brands || []
    return brands.reduce(
      (acc, brand) => ({
        followers: acc.followers + brand.totals.followers,
        views: acc.views + brand.totals.views_7d,
        likes: acc.likes + brand.totals.likes_7d,
      }),
      { followers: 0, views: 0, likes: 0 }
    )
  }, [data?.brands])
  
  // Prepare chart data
  const chartData = useMemo(() => {
    if (!snapshotsData?.snapshots.length) return []
    
    // Group snapshots by date
    const byDate: Record<string, Record<string, number | string>> = {}
    
    snapshotsData.snapshots.forEach(snapshot => {
      const date = formatDate(snapshot.snapshot_at)
      if (!byDate[date]) {
        byDate[date] = { date }
      }
      
      const key = selectedBrand === 'all' 
        ? snapshot.brand 
        : selectedPlatform === 'all' 
          ? snapshot.platform 
          : 'value'
      
      const value = selectedMetric === 'followers' 
        ? snapshot.followers_count
        : selectedMetric === 'views' 
          ? snapshot.views_last_7_days 
          : snapshot.likes_last_7_days
      
      byDate[date][key] = ((byDate[date][key] as number) || 0) + value
    })
    
    return Object.values(byDate)
  }, [snapshotsData, selectedBrand, selectedPlatform, selectedMetric])
  
  // Prepare pie chart data for distribution
  const pieData = useMemo(() => {
    const brands = data?.brands || []
    
    // When a specific platform is selected, show distribution by brand for that platform
    // When all platforms, show distribution by brand across all platforms
    return brands.map(brand => {
      let value: number
      
      if (selectedPlatform === 'all') {
        // Sum across all platforms
        value = selectedMetric === 'followers' 
          ? brand.totals.followers
          : selectedMetric === 'views' 
            ? brand.totals.views_7d 
            : brand.totals.likes_7d
      } else {
        // Get value for specific platform only
        const platformMetrics = brand.platforms[selectedPlatform]
        if (!platformMetrics) {
          value = 0
        } else {
          value = selectedMetric === 'followers' 
            ? platformMetrics.followers_count
            : selectedMetric === 'views' 
              ? platformMetrics.views_last_7_days 
              : platformMetrics.likes_last_7_days
        }
      }
      
      return {
        name: brand.display_name,
        value,
        color: brand.color
      }
    }).filter(d => d.value > 0)
  }, [data?.brands, selectedPlatform, selectedMetric])
  
  // Bar chart data - compare brands (respects platform filter)
  const barData = useMemo(() => {
    const brands = data?.brands || []
    return brands.map(brand => {
      let followers: number, views: number, likes: number
      
      if (selectedPlatform === 'all') {
        followers = brand.totals.followers
        views = brand.totals.views_7d
        likes = brand.totals.likes_7d
      } else {
        const platformMetrics = brand.platforms[selectedPlatform]
        if (!platformMetrics) {
          followers = 0
          views = 0
          likes = 0
        } else {
          followers = platformMetrics.followers_count
          views = platformMetrics.views_last_7_days
          likes = platformMetrics.likes_last_7_days
        }
      }
      
      return {
        name: brand.display_name.split(' ')[0],
        followers,
        views,
        likes,
        color: brand.color
      }
    })
  }, [data?.brands, selectedPlatform])
  
  // Get line colors for chart
  const getLineColors = () => {
    if (selectedBrand !== 'all') {
      // Show platforms
      return ['instagram', 'facebook', 'youtube'].map(p => PLATFORM_COLORS[p])
    }
    // Show brands
    return Object.values(BRAND_COLORS)
  }
  
  const getLineKeys = () => {
    if (selectedBrand !== 'all') {
      return selectedPlatform === 'all' 
        ? ['instagram', 'facebook', 'youtube']
        : ['value']
    }
    return Object.keys(BRAND_COLORS)
  }
  
  // Filter brands for display
  const filteredBrands = useMemo(() => {
    let brands = data?.brands || []
    
    if (selectedBrand !== 'all') {
      brands = brands.filter(b => b.brand === selectedBrand)
    }
    
    if (selectedPlatform !== 'all') {
      brands = brands.map(b => ({
        ...b,
        platforms: Object.fromEntries(
          Object.entries(b.platforms).filter(([p]) => p === selectedPlatform)
        ),
        totals: {
          followers: b.platforms[selectedPlatform]?.followers_count || 0,
          views_7d: b.platforms[selectedPlatform]?.views_last_7_days || 0,
          likes_7d: b.platforms[selectedPlatform]?.likes_last_7_days || 0,
        }
      }))
    }
    
    return brands
  }, [data?.brands, selectedBrand, selectedPlatform])
  
  if (isLoading) {
    return <FullPageLoader text="Loading analytics..." />
  }
  
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
  const rateLimit = data?.rate_limit
  const lastRefresh = data?.last_refresh
  
  const brandOptions = [
    { value: 'all', label: 'All Brands' },
    ...brands.map(b => ({ value: b.brand, label: b.display_name }))
  ]
  
  const platformOptions = [
    { value: 'all', label: 'All Platforms' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'youtube', label: 'YouTube' }
  ]
  
  const metricOptions = [
    { value: 'followers', label: 'Followers' },
    { value: 'views', label: 'Views (7d)' },
    { value: 'likes', label: 'Likes (7d)' }
  ]
  
  const timeOptions = [
    { value: '7', label: 'Last 7 days' },
    { value: '14', label: 'Last 14 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '60', label: 'Last 60 days' }
  ]
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Refresh Loading Overlay */}
      {refreshMutation.isPending && (
        <RefreshOverlay 
          elapsedSeconds={elapsedSeconds} 
          platformsStatus={[]} 
        />
      )}
      
      <div className={`max-w-7xl mx-auto px-6 py-8 transition-all duration-300 ${
        refreshMutation.isPending ? 'opacity-50 blur-sm pointer-events-none' : ''
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-7 h-7" />
              Analytics
            </h1>
            <p className="text-gray-500 mt-1">
              Track followers, views, and engagement across all platforms
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {lastRefresh && (
              <div className="text-sm text-gray-500 flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Updated: {formatTimeAgo(lastRefresh)}
              </div>
            )}
            
            {rateLimit && (
              <div className="text-sm text-gray-500 px-3 py-1 bg-gray-100 rounded-full">
                {rateLimit.remaining}/{rateLimit.max_per_day} refreshes
              </div>
            )}
            
            <button
              onClick={handleRefresh}
              disabled={refreshMutation.isPending || !rateLimit?.can_refresh}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
                ${rateLimit?.can_refresh 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            
            <button
              onClick={handleBackfill}
              disabled={backfillMutation.isPending}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
                ${!backfillMutation.isPending 
                  ? 'bg-purple-600 text-white hover:bg-purple-700' 
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }
              `}
              title="Fetch 28 days of historical analytics data"
            >
              <History className={`w-4 h-4 ${backfillMutation.isPending ? 'animate-spin' : ''}`} />
              Backfill History
            </button>
          </div>
        </div>
        
        {/* Success/Error Messages */}
        {refreshMutation.isSuccess && !refreshError && (
          <div className="mb-6 px-4 py-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <CheckCircle2 className="w-5 h-5" />
            <span>Analytics refreshed successfully!</span>
          </div>
        )}
        
        {backfillSuccess && (
          <div className="mb-6 px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg flex items-center gap-2 text-purple-700">
            <CheckCircle2 className="w-5 h-5" />
            <span>{backfillSuccess}</span>
          </div>
        )}
        
        {refreshError && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span>{refreshError}</span>
          </div>
        )}
        
        {/* Filters */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-gray-600">
              <Filter className="w-4 h-4" />
              <span className="font-medium text-sm">Filters:</span>
            </div>
            <FilterDropdown
              label="Brand"
              value={selectedBrand}
              options={brandOptions}
              onChange={setSelectedBrand}
            />
            <FilterDropdown
              label="Platform"
              value={selectedPlatform}
              options={platformOptions}
              onChange={setSelectedPlatform}
            />
            <FilterDropdown
              label="Metric"
              value={selectedMetric}
              options={metricOptions}
              onChange={(v) => setSelectedMetric(v as MetricType)}
            />
            <FilterDropdown
              label="Time Range"
              value={timeRange.toString()}
              options={timeOptions}
              onChange={(v) => setTimeRange(parseInt(v))}
            />
          </div>
        </div>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <MetricCard
            icon={<Users className="w-5 h-5" />}
            label="Total Followers"
            value={totals.followers}
            color="text-blue-600"
          />
          <MetricCard
            icon={<Eye className="w-5 h-5" />}
            label="Total Views (7d)"
            value={totals.views}
            color="text-green-600"
          />
          <MetricCard
            icon={<Heart className="w-5 h-5" />}
            label="Total Likes (7d)"
            value={totals.likes}
            color="text-pink-500"
          />
        </div>
        
        {/* Charts Row */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Line/Area Chart - Trend over time */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-gray-500" />
              <h3 className="font-semibold text-gray-900">
                {selectedMetric === 'followers' ? 'Follower' : selectedMetric === 'views' ? 'Views' : 'Likes'} Trend
              </h3>
            </div>
            
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData}>
                  <defs>
                    {getLineKeys().map((key, i) => (
                      <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getLineColors()[i]} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={getLineColors()[i]} stopOpacity={0}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#888" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#888" tickFormatter={formatNumber} />
                  <Tooltip 
                    formatter={(value) => formatNumber(Number(value ?? 0))}
                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  />
                  {getLineKeys().map((key, i) => (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={getLineColors()[i]}
                      fill={`url(#gradient-${key})`}
                      strokeWidth={2}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>No historical data yet</p>
                  <p className="text-sm">Refresh to start tracking trends</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Pie Chart - Distribution */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <PieChartIcon className="w-5 h-5 text-gray-500" />
              <h3 className="font-semibold text-gray-900">
                {selectedMetric === 'followers' ? 'Follower' : selectedMetric === 'views' ? 'Views' : 'Likes'} Distribution
              </h3>
            </div>
            
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => formatNumber(Number(value ?? 0))}
                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  />
                  <Legend 
                    layout="vertical" 
                    align="right" 
                    verticalAlign="middle"
                    formatter={(value) => <span className="text-sm text-gray-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <PieChartIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>No data to display</p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Bar Chart - Compare All Brands */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-gray-500" />
            <h3 className="font-semibold text-gray-900">Brand Comparison</h3>
          </div>
          
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#888" />
                <YAxis tick={{ fontSize: 12 }} stroke="#888" tickFormatter={formatNumber} />
                <Tooltip 
                  formatter={(value) => formatNumber(Number(value ?? 0))}
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Legend />
                <Bar dataKey="followers" name="Followers" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="views" name="Views (7d)" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="likes" name="Likes (7d)" fill="#EC4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-400">
              <p>No brand data available</p>
            </div>
          )}
        </div>
        
        {/* Brand Cards */}
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Detailed Breakdown</h2>
        {filteredBrands.length > 0 ? (
          <div className="space-y-4">
            {filteredBrands.map((brand) => (
              <BrandCard key={brand.brand} brand={brand} />
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
        
        {/* Rate Limit Notice */}
        {rateLimit && !rateLimit.can_refresh && rateLimit.next_available_at && (
          <div className="mt-6 text-center text-sm text-gray-500">
            <Clock className="w-4 h-4 inline mr-1" />
            Next refresh available {formatTimeAgo(rateLimit.next_available_at).replace(' ago', '')}
          </div>
        )}
      </div>
    </div>
  )
}
