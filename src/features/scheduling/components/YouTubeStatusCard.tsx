import { useYouTubeStatus, getYouTubeConnectUrl } from '../hooks'
import { getBrandLabel, getBrandColor } from '@/features/brands'
import type { BrandName } from '@/shared/types'
import { ExternalLink, Youtube, Check, RefreshCw } from 'lucide-react'

interface YouTubeStatusCardProps {
  onRefresh?: () => void
}

export function YouTubeStatusCard({ onRefresh }: YouTubeStatusCardProps) {
  const { data, isLoading, refetch } = useYouTubeStatus()
  
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
            <div className="h-3 bg-gray-100 rounded w-48"></div>
          </div>
        </div>
      </div>
    )
  }
  
  if (!data) return null
  
  const brands = Object.entries(data.brands) as [string, typeof data.brands[string]][]
  const connectedCount = brands.filter(([_, status]) => status.connected).length
  
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Youtube className="w-8 h-8 text-white" />
            <div>
              <h3 className="text-lg font-semibold text-white">YouTube Shorts</h3>
              <p className="text-red-100 text-sm">
                {connectedCount}/{brands.length} channels connected
              </p>
            </div>
          </div>
          <button
            onClick={() => { refetch(); onRefresh?.() }}
            className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
      
      {/* OAuth status */}
      {!data.oauth_configured && (
        <div className="px-6 py-3 bg-yellow-50 border-b border-yellow-100">
          <p className="text-sm text-yellow-800">
            ⚠️ YouTube OAuth not configured. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in your environment.
          </p>
        </div>
      )}
      
      {/* Quota status */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">API Quota</span>
          <span className="text-sm text-gray-500">
            {data.quota.used.toLocaleString()} / {data.quota.limit.toLocaleString()} used
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all ${
              data.quota.can_upload ? 'bg-green-500' : 'bg-red-500'
            }`}
            style={{ width: `${(data.quota.used / data.quota.limit) * 100}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {data.quota.can_upload 
            ? `✅ Can upload ~${Math.floor(data.quota.remaining / data.quota.upload_cost)} more videos today`
            : `❌ Quota exceeded. Resets at ${new Date(data.quota.reset_time).toLocaleTimeString()}`
          }
        </p>
      </div>
      
      {/* Brand connections */}
      <div className="divide-y divide-gray-100">
        {brands.map(([brand, status]) => (
          <BrandYouTubeRow 
            key={brand} 
            brand={brand as BrandName} 
            status={status} 
            oauthConfigured={data.oauth_configured}
          />
        ))}
      </div>
    </div>
  )
}

interface BrandYouTubeRowProps {
  brand: BrandName
  status: {
    connected: boolean
    channel_id: string | null
    channel_name: string | null
  }
  oauthConfigured: boolean
}

function BrandYouTubeRow({ brand, status, oauthConfigured }: BrandYouTubeRowProps) {
  const brandColor = getBrandColor(brand)
  
  const handleConnect = () => {
    // Open connect URL in same window (OAuth redirect)
    window.location.href = getYouTubeConnectUrl(brand)
  }
  
  return (
    <div className="px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-3">
        <div 
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: brandColor }}
        />
        <div>
          <p className="font-medium text-gray-900">{getBrandLabel(brand)}</p>
          {status.connected && status.channel_name && (
            <p className="text-sm text-gray-500">{status.channel_name}</p>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {status.connected ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-sm">
              <Check className="w-3 h-3" />
              Connected
            </span>
            {status.channel_id && (
              <a
                href={`https://youtube.com/channel/${status.channel_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded hover:bg-gray-200 transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-gray-500" />
              </a>
            )}
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={!oauthConfigured}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              oauthConfigured
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            Connect
          </button>
        )}
      </div>
    </div>
  )
}
