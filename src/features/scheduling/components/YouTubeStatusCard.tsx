import { useYouTubeStatus, useDisconnectYouTube, connectYouTube } from '../hooks'
import { getBrandLabel, getBrandColor } from '@/features/brands'
import type { BrandName } from '@/shared/types'
import { ExternalLink, Youtube, Check, RefreshCw, Unlink, AlertTriangle, Loader2 } from 'lucide-react'
import { useState } from 'react'

interface YouTubeStatusCardProps {
  onRefresh?: () => void
}

export function YouTubeStatusCard({ onRefresh }: YouTubeStatusCardProps) {
  const { data, isLoading, refetch } = useYouTubeStatus()
  
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
          <span className="ml-2 text-sm text-gray-500">Loading YouTube status...</span>
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
            onStatusChange={() => refetch()}
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
    status?: string
    last_error?: string | null
  }
  oauthConfigured: boolean
  onStatusChange: () => void
}

function BrandYouTubeRow({ brand, status, oauthConfigured, onStatusChange }: BrandYouTubeRowProps) {
  const brandColor = getBrandColor(brand)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const disconnectMutation = useDisconnectYouTube()
  
  const [connecting, setConnecting] = useState(false)

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const authUrl = await connectYouTube(brand)
      window.location.href = authUrl
    } catch (error) {
      console.error('Failed to start YouTube connection:', error)
      setConnecting(false)
    }
  }
  
  const handleDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync(brand)
      setShowDisconnectConfirm(false)
      onStatusChange()
    } catch (error) {
      console.error('Failed to disconnect:', error)
    }
  }
  
  const isRevoked = status.status === 'revoked'
  const hasError = status.status === 'error'
  
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
          {isRevoked && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Access revoked - reconnect required
            </p>
          )}
          {hasError && status.last_error && (
            <p className="text-xs text-orange-600">{status.last_error}</p>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {status.connected ? (
          <>
            {showDisconnectConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Disconnect?</span>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                  className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                >
                  {disconnectMutation.isPending ? '...' : 'Yes'}
                </button>
                <button
                  onClick={() => setShowDisconnectConfirm(false)}
                  className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  No
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {isRevoked ? (
                  <button
                    onClick={handleConnect}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                  >
                    Reconnect
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-sm">
                    <Check className="w-3 h-3" />
                    Connected
                  </span>
                )}
                {status.channel_id && (
                  <a
                    href={`https://youtube.com/channel/${status.channel_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                    title="View channel"
                  >
                    <ExternalLink className="w-4 h-4 text-gray-500" />
                  </a>
                )}
                <button
                  onClick={handleConnect}
                  className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                  title="Change channel"
                >
                  <RefreshCw className="w-4 h-4 text-gray-500" />
                </button>
                <button
                  onClick={() => setShowDisconnectConfirm(true)}
                  className="p-1.5 rounded hover:bg-red-100 transition-colors"
                  title="Disconnect"
                >
                  <Unlink className="w-4 h-4 text-gray-500 hover:text-red-500" />
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            onClick={handleConnect}
            disabled={!oauthConfigured || connecting}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              oauthConfigured && !connecting
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  )
}
