import { useState } from 'react'
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
  CheckCircle2
} from 'lucide-react'
import { 
  useAnalytics, 
  useRefreshAnalytics,
  type BrandMetrics,
  type PlatformMetrics
} from '@/features/analytics'
import { FullPageLoader } from '@/shared/components'

type Platform = 'instagram' | 'facebook' | 'youtube'

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

function getPlatformName(platform: string): string {
  return platform.charAt(0).toUpperCase() + platform.slice(1)
}

interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: number
  color?: string
}

function MetricCard({ icon, label, value, color = 'text-gray-600' }: MetricCardProps) {
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 text-gray-500 mb-1">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{formatNumber(value)}</p>
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
        <p className="font-medium text-gray-900">{getPlatformName(platform)}</p>
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
      {/* Brand Header */}
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
        
        {/* Totals */}
        {hasPlatforms && (
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-xs text-gray-500">Total Followers</p>
              <p className="font-bold text-lg" style={{ color: brand.color }}>
                {formatNumber(brand.totals.followers)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Views (7d)</p>
              <p className="font-bold text-lg text-gray-700">
                {formatNumber(brand.totals.views_7d)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Likes (7d)</p>
              <p className="font-bold text-lg text-pink-500">
                {formatNumber(brand.totals.likes_7d)}
              </p>
            </div>
          </div>
        )}
      </div>
      
      {/* Platform Rows */}
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
          <p className="text-sm">Connect platforms in the Brands page to see metrics.</p>
        </div>
      )}
    </div>
  )
}

interface TotalsSummaryProps {
  brands: BrandMetrics[]
}

function TotalsSummary({ brands }: TotalsSummaryProps) {
  const totals = brands.reduce(
    (acc, brand) => ({
      followers: acc.followers + brand.totals.followers,
      views: acc.views + brand.totals.views_7d,
      likes: acc.likes + brand.totals.likes_7d,
    }),
    { followers: 0, views: 0, likes: 0 }
  )
  
  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      <MetricCard
        icon={<Users className="w-4 h-4" />}
        label="Total Followers"
        value={totals.followers}
        color="text-blue-600"
      />
      <MetricCard
        icon={<Eye className="w-4 h-4" />}
        label="Total Views (7d)"
        value={totals.views}
        color="text-green-600"
      />
      <MetricCard
        icon={<Heart className="w-4 h-4" />}
        label="Total Likes (7d)"
        value={totals.likes}
        color="text-pink-500"
      />
    </div>
  )
}

export function AnalyticsPage() {
  const { data, isLoading, error } = useAnalytics()
  const refreshMutation = useRefreshAnalytics()
  const [refreshError, setRefreshError] = useState<string | null>(null)
  
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
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-7 h-7" />
              Analytics
            </h1>
            <p className="text-gray-500 mt-1">
              Track followers, views, and engagement across all platforms
            </p>
          </div>
          
          {/* Refresh Button */}
          <div className="flex items-center gap-4">
            {/* Last Refresh Time */}
            {lastRefresh && (
              <div className="text-sm text-gray-500 flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Last updated: {formatTimeAgo(lastRefresh)}
              </div>
            )}
            
            {/* Rate Limit Info */}
            {rateLimit && (
              <div className="text-sm text-gray-500 px-3 py-1 bg-gray-100 rounded-full">
                {rateLimit.remaining}/{rateLimit.max_per_hour} refreshes left
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
              title={!rateLimit?.can_refresh ? 'Rate limit reached' : 'Refresh analytics'}
            >
              <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
              {refreshMutation.isPending ? 'Refreshing...' : 'Refresh'}
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
        
        {refreshError && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span>{refreshError}</span>
          </div>
        )}
        
        {/* Totals Summary */}
        {brands.length > 0 && <TotalsSummary brands={brands} />}
        
        {/* Brand Cards */}
        {brands.length > 0 ? (
          <div className="space-y-6">
            {brands.map((brand) => (
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
