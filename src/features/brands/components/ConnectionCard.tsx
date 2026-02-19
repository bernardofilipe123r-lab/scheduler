import { useState } from 'react'
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
  Zap,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import {
  useDisconnectYouTube,
  connectYouTube,
  testMetaConnection,
  testYouTubeConnection,
  type BrandConnectionStatus,
  type PlatformConnection,
  type ConnectionTestResult,
} from '@/features/brands'
import type { BrandName } from '@/shared/types'

type Platform = 'instagram' | 'facebook' | 'youtube'

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

interface ConnectionCardProps {
  brand: BrandConnectionStatus
  brandLogo?: string
  onRefresh: () => void
}

export function ConnectionCard({ brand, brandLogo, onRefresh }: ConnectionCardProps) {
  const [disconnectingYouTube, setDisconnectingYouTube] = useState(false)
  const [connectingYouTube, setConnectingYouTube] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState<Platform | null>(null)
  const [testResult, setTestResult] = useState<{ meta?: ConnectionTestResult; youtube?: ConnectionTestResult }>({})
  const [testing, setTesting] = useState<{ meta: boolean; youtube: boolean }>({ meta: false, youtube: false })
  const disconnectYouTube = useDisconnectYouTube()

  const handleTestMeta = async () => {
    setTesting(p => ({ ...p, meta: true }))
    setTestResult(p => ({ ...p, meta: undefined }))
    try {
      const result = await testMetaConnection(brand.brand)
      setTestResult(p => ({ ...p, meta: result }))
    } catch (err) {
      setTestResult(p => ({ ...p, meta: { platform: 'meta', status: 'error', message: err instanceof Error ? err.message : 'Test failed' } }))
    } finally {
      setTesting(p => ({ ...p, meta: false }))
    }
  }

  const handleTestYouTube = async () => {
    setTesting(p => ({ ...p, youtube: true }))
    setTestResult(p => ({ ...p, youtube: undefined }))
    try {
      const result = await testYouTubeConnection(brand.brand)
      setTestResult(p => ({ ...p, youtube: result }))
    } catch (err) {
      setTestResult(p => ({ ...p, youtube: { platform: 'youtube', status: 'error', message: err instanceof Error ? err.message : 'Test failed' } }))
    } finally {
      setTesting(p => ({ ...p, youtube: false }))
    }
  }

  const handleYouTubeConnect = async () => {
    setConnectingYouTube(true)
    try {
      const authUrl = await connectYouTube(brand.brand as BrandName)
      window.location.href = authUrl
    } catch (error) {
      console.error('Failed to start YouTube connection:', error)
      setConnectingYouTube(false)
    }
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
                  disabled={connectingYouTube}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {connectingYouTube ? 'Connecting...' : 'Connect'}
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
              <img src={brandLogo} alt={brand.display_name} className="w-full h-full object-contain" />
            ) : (
              <span className="text-white font-bold text-lg">{brand.display_name.charAt(0)}</span>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{brand.display_name}</h3>
            <p className="text-sm text-gray-500">
              {[brand.instagram, brand.facebook, brand.youtube].filter((p) => p.connected).length}/3 platforms connected
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

      {/* Test Connection Buttons */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-2">
        {(brand.instagram.connected || brand.facebook.connected) && (
          <button
            onClick={handleTestMeta}
            disabled={testing.meta}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            {testing.meta ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Test Meta
          </button>
        )}
        {brand.youtube.connected && (
          <button
            onClick={handleTestYouTube}
            disabled={testing.youtube}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {testing.youtube ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Test YouTube
          </button>
        )}
        {testResult.meta && (
          <span className={`flex items-center gap-1 text-xs ${testResult.meta.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {testResult.meta.status === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {testResult.meta.message}
          </span>
        )}
        {testResult.youtube && (
          <span className={`flex items-center gap-1 text-xs ${testResult.youtube.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {testResult.youtube.status === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {testResult.youtube.message}
          </span>
        )}
      </div>
    </div>
  )
}
