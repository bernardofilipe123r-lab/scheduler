import { useState, useEffect } from 'react'
import { 
  Instagram, 
  Facebook, 
  Youtube, 
  Check, 
  X, 
  ExternalLink, 
  RefreshCw,
  Unlink,
  AlertTriangle,
  Link2
} from 'lucide-react'
import { 
  useBrandConnections, 
  useDisconnectYouTube,
  getYouTubeConnectUrl,
  type BrandConnectionStatus,
  type PlatformConnection
} from '@/features/brands'
import { FullPageLoader, PasswordGate } from '@/shared/components'
import type { BrandName } from '@/shared/types'

type Platform = 'instagram' | 'facebook' | 'youtube'

interface PlatformIconProps {
  platform: Platform
  className?: string
}

function PlatformIcon({ platform, className = 'w-5 h-5' }: PlatformIconProps) {
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

interface ConnectionCardProps {
  brand: BrandConnectionStatus
  brandLogo?: string
  onRefresh: () => void
}

function ConnectionCard({ brand, brandLogo, onRefresh }: ConnectionCardProps) {
  const [disconnectingYouTube, setDisconnectingYouTube] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState<Platform | null>(null)
  const disconnectYouTube = useDisconnectYouTube()

  const handleYouTubeConnect = () => {
    window.location.href = getYouTubeConnectUrl(brand.brand as BrandName)
  }

  const handleYouTubeDisconnect = async () => {
    setDisconnectingYouTube(true)
    try {
      await disconnectYouTube.mutateAsync(brand.brand as BrandName)
      setConfirmDisconnect(null)
      onRefresh()
    } catch (error) {
      console.error('Failed to disconnect YouTube:', error)
    } finally {
      setDisconnectingYouTube(false)
    }
  }

  const renderPlatformRow = (platform: Platform, connection: PlatformConnection) => {
    const isYouTube = platform === 'youtube'
    const isRevoked = connection.status === 'revoked'
    const hasError = connection.status === 'error'
    
    return (
      <div 
        key={platform}
        className="flex items-center justify-between py-3 px-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${getPlatformBgColor(platform)}`}>
            <PlatformIcon platform={platform} className="w-4 h-4" />
          </div>
          <div>
            <p className="font-medium text-gray-900 capitalize">{platform}</p>
            {connection.connected && connection.account_name && (
              <p className="text-sm text-gray-500">{connection.account_name}</p>
            )}
            {isRevoked && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Access revoked - reconnect required
              </p>
            )}
            {hasError && connection.last_error && (
              <p className="text-xs text-orange-600">{connection.last_error}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {connection.connected ? (
            <>
              {confirmDisconnect === platform ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Disconnect?</span>
                  <button
                    onClick={isYouTube ? handleYouTubeDisconnect : undefined}
                    disabled={disconnectingYouTube || !isYouTube}
                    className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                  >
                    {disconnectingYouTube ? '...' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setConfirmDisconnect(null)}
                    className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    No
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {isRevoked ? (
                    <button
                      onClick={isYouTube ? handleYouTubeConnect : undefined}
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
                  
                  {connection.account_id && (
                    <a
                      href={
                        platform === 'instagram' 
                          ? `https://instagram.com/${connection.account_name?.replace('@', '')}`
                          : platform === 'facebook'
                          ? `https://facebook.com/${connection.account_id}`
                          : `https://youtube.com/channel/${connection.account_id}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                      title="View page"
                    >
                      <ExternalLink className="w-4 h-4 text-gray-500" />
                    </a>
                  )}
                  
                  {isYouTube && (
                    <>
                      <button
                        onClick={handleYouTubeConnect}
                        className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                        title="Change channel"
                      >
                        <RefreshCw className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => setConfirmDisconnect('youtube')}
                        className="p-1.5 rounded hover:bg-red-100 transition-colors"
                        title="Disconnect"
                      >
                        <Unlink className="w-4 h-4 text-gray-500 hover:text-red-500" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-500 text-sm">
                <X className="w-3 h-3" />
                Not connected
              </span>
              
              {isYouTube && (
                <button
                  onClick={handleYouTubeConnect}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  Connect
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Brand header */}
      <div 
        className="px-6 py-4 flex items-center justify-between"
        style={{ backgroundColor: brand.color + '15' }}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: brand.color }}
          >
            {brandLogo ? (
              <img 
                src={brandLogo} 
                alt={brand.display_name}
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-white font-bold text-lg">
                {brand.display_name.charAt(0)}
              </span>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{brand.display_name}</h3>
            <p className="text-sm text-gray-500">
              {[brand.instagram, brand.facebook, brand.youtube].filter(p => p.connected).length}/3 platforms connected
            </p>
          </div>
        </div>
      </div>

      {/* Platform connections */}
      <div className="divide-y divide-gray-100">
        {renderPlatformRow('instagram', brand.instagram)}
        {renderPlatformRow('facebook', brand.facebook)}
        {renderPlatformRow('youtube', brand.youtube)}
      </div>
    </div>
  )
}

export function ConnectedPage() {
  return (
    <PasswordGate
      title="Connected Accounts"
      description="Enter the password to manage connected accounts"
      buttonLabel="Unlock Connections"
    >
      <ConnectedContent />
    </PasswordGate>
  )
}

function ConnectedContent() {
  const { data, isLoading, refetch } = useBrandConnections()
  
  // Store logos loaded from backend (keyed by brand id)
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({})
  
  // Fetch saved logos for all brands on mount
  useEffect(() => {
    const fetchBrandLogos = async () => {
      if (!data?.brands) return
      
      const logos: Record<string, string> = {}
      
      for (const brand of data.brands) {
        try {
          const response = await fetch(`/api/brands/${brand.brand}/theme`)
          if (response.ok) {
            const themeData = await response.json()
            if (themeData.theme?.logo) {
              const logoUrl = `/brand-logos/${themeData.theme.logo}`
              const logoCheck = await fetch(logoUrl, { method: 'HEAD' })
              if (logoCheck.ok) {
                logos[brand.brand] = logoUrl
              }
            }
          }
        } catch (error) {
          console.error(`Failed to fetch logo for ${brand.brand}:`, error)
        }
      }
      
      setBrandLogos(logos)
    }
    
    if (data?.brands?.length) {
      fetchBrandLogos()
    }
  }, [data?.brands])

  if (isLoading) {
    return <FullPageLoader text="Loading connections..." />
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to load connections</h2>
        <p className="text-gray-500 mb-4">Please try refreshing the page</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  const totalConnections = data.brands.reduce((acc, brand) => {
    return acc + (brand.instagram.connected ? 1 : 0) + (brand.facebook.connected ? 1 : 0) + (brand.youtube.connected ? 1 : 0)
  }, 0)

  const totalPossible = data.brands.length * 3

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Link2 className="w-7 h-7 text-primary-500" />
            Connected Pages
          </h1>
          <p className="text-gray-500 mt-1">
            Manage your social media connections for each brand
          </p>
        </div>
        
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Connection Summary</h2>
            <p className="text-sm text-gray-500 mt-1">
              {totalConnections} of {totalPossible} platform connections active
            </p>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                  <Instagram className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-2xl font-bold text-gray-900">
                  {data.brands.filter(b => b.instagram.connected).length}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Instagram</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
                  <Facebook className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-2xl font-bold text-gray-900">
                  {data.brands.filter(b => b.facebook.connected).length}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Facebook</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-red-500 flex items-center justify-center">
                  <Youtube className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-2xl font-bold text-gray-900">
                  {data.brands.filter(b => b.youtube.connected).length}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">YouTube</p>
            </div>
          </div>
        </div>

        {/* OAuth status warnings */}
        {!data.oauth_configured.youtube && (
          <div className="mt-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              ⚠️ YouTube OAuth not configured. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to enable YouTube connections.
            </p>
          </div>
        )}
      </div>

      {/* Brand cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.brands.map(brand => (
          <ConnectionCard 
            key={brand.brand} 
            brand={brand}
            brandLogo={brandLogos[brand.brand]}
            onRefresh={() => refetch()} 
          />
        ))}
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-semibold text-blue-900 mb-2">About Platform Connections</h3>
        <div className="space-y-2 text-sm text-blue-800">
          <p>
            <strong>Instagram & Facebook:</strong> Connected via Meta Business Suite. 
            These use long-lived System User tokens that don't expire.
          </p>
          <p>
            <strong>YouTube:</strong> Connected via OAuth. Click "Connect" to authorize your YouTube channel. 
            The connection persists until you revoke access.
          </p>
          <p className="text-blue-600 mt-3">
            💡 Each brand can have different social accounts connected. YouTube channels cannot be shared between brands.
          </p>
        </div>
      </div>
    </div>
  )
}
