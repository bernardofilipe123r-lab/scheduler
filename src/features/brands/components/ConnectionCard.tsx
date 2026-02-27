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
  connectInstagram,
  disconnectInstagram,
  connectFacebook,
  disconnectFacebook,
  selectFacebookPage,
  connectThreads,
  disconnectThreads,
  connectTikTok,
  disconnectTikTok,
  type BrandConnectionStatus,
  type PlatformConnection,
  type ConnectionTestResult,
  type FacebookPage,
} from '@/features/brands'
import type { BrandName } from '@/shared/types'

type Platform = 'instagram' | 'facebook' | 'youtube' | 'threads' | 'tiktok'

function ThreadsIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.29 3.276-.866 1.074-2.063 1.678-3.559 1.795-1.12.088-2.198-.154-3.04-.682-1.003-.63-1.607-1.593-1.7-2.716-.154-1.836 1.201-3.454 3.742-3.652.97-.076 1.867-.034 2.687.097-.065-.666-.217-1.195-.463-1.582-.396-.623-1.078-.948-2.022-.966-1.32.012-2.085.437-2.344.696l-1.386-1.57C7.57 6.573 9.003 5.88 11.068 5.862c1.47.013 2.65.497 3.508 1.44.78.857 1.234 2.017 1.35 3.453.478.18.916.404 1.31.675 1.191.818 2.065 2.03 2.52 3.502.628 2.028.478 4.537-1.36 6.336C16.65 22.97 14.59 23.975 12.186 24zm-1.638-7.283c-.078.003-.155.008-.232.015-1.26.098-1.905.701-1.862 1.22.02.233.156.567.589.838.49.308 1.14.446 1.833.388 1.116-.087 2.472-.633 2.716-3.136-.741-.142-1.544-.2-2.41-.2-.216 0-.43.006-.634.017v-.142z" />
    </svg>
  )
}

function TikTokIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.79a8.18 8.18 0 0 0 4.76 1.52V6.87a4.84 4.84 0 0 1-1-.18z" />
    </svg>
  )
}

function PlatformIcon({ platform, className = 'w-5 h-5' }: { platform: Platform; className?: string }) {
  switch (platform) {
    case 'instagram':
      return <Instagram className={className} />
    case 'facebook':
      return <Facebook className={className} />
    case 'youtube':
      return <Youtube className={className} />
    case 'threads':
      return <ThreadsIcon className={className} />
    case 'tiktok':
      return <TikTokIcon className={className} />
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
    case 'threads':
      return 'bg-black'
    case 'tiktok':
      return 'bg-black'
  }
}

interface ConnectionCardProps {
  brand: BrandConnectionStatus
  brandLogo?: string
  onRefresh: () => void
}

export function ConnectionCard({ brand, brandLogo, onRefresh }: ConnectionCardProps) {
  const [disconnectingYouTube, setDisconnectingYouTube] = useState(false)
  const [disconnectingInstagram, setDisconnectingInstagram] = useState(false)
  const [disconnectingFacebook, setDisconnectingFacebook] = useState(false)
  const [disconnectingThreads, setDisconnectingThreads] = useState(false)
  const [disconnectingTikTok, setDisconnectingTikTok] = useState(false)
  const [connectingYouTube, setConnectingYouTube] = useState(false)
  const [connectingFacebook, setConnectingFacebook] = useState(false)
  const [connectingThreads, setConnectingThreads] = useState(false)
  const [connectingTikTok, setConnectingTikTok] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState<Platform | null>(null)
  const [testResult, setTestResult] = useState<{ meta?: ConnectionTestResult; youtube?: ConnectionTestResult }>({})
  const [testing, setTesting] = useState<{ meta: boolean; youtube: boolean }>({ meta: false, youtube: false })
  const [fbPages, setFbPages] = useState<FacebookPage[]>([])
  const [showPageSelector, setShowPageSelector] = useState(false)
  const [selectingPage, setSelectingPage] = useState(false)
  const [confirmConnect, setConfirmConnect] = useState<Platform | null>(null)
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

  const handleInstagramConnect = () => {
    setConfirmConnect('instagram')
  }

  const handleInstagramDisconnect = async () => {
    setDisconnectingInstagram(true)
    try {
      await disconnectInstagram(brand.brand)
      setConfirmDisconnect(null)
      onRefresh()
    } catch (error) {
      console.error('Failed to disconnect Instagram:', error)
    } finally {
      setDisconnectingInstagram(false)
    }
  }

  const handleFacebookConnect = () => {
    setConfirmConnect('facebook')
  }

  const handleFacebookDisconnect = async () => {
    setDisconnectingFacebook(true)
    try {
      await disconnectFacebook(brand.brand)
      setConfirmDisconnect(null)
      onRefresh()
    } catch (error) {
      console.error('Failed to disconnect Facebook:', error)
    } finally {
      setDisconnectingFacebook(false)
    }
  }

  const handleThreadsConnect = async () => {
    setConnectingThreads(true)
    try {
      const authUrl = await connectThreads(brand.brand)
      window.location.href = authUrl
    } catch (error) {
      console.error('Failed to start Threads connection:', error)
      setConnectingThreads(false)
    }
  }

  const handleThreadsDisconnect = async () => {
    setDisconnectingThreads(true)
    try {
      await disconnectThreads(brand.brand)
      setConfirmDisconnect(null)
      onRefresh()
    } catch (error) {
      console.error('Failed to disconnect Threads:', error)
    } finally {
      setDisconnectingThreads(false)
    }
  }

  const handleTikTokConnect = async () => {
    setConnectingTikTok(true)
    try {
      const authUrl = await connectTikTok(brand.brand)
      window.location.href = authUrl
    } catch (error) {
      console.error('Failed to start TikTok connection:', error)
      setConnectingTikTok(false)
    }
  }

  const handleTikTokDisconnect = async () => {
    setDisconnectingTikTok(true)
    try {
      await disconnectTikTok(brand.brand)
      setConfirmDisconnect(null)
      onRefresh()
    } catch (error) {
      console.error('Failed to disconnect TikTok:', error)
    } finally {
      setDisconnectingTikTok(false)
    }
  }

  const proceedConnect = async () => {
    const platform = confirmConnect
    setConfirmConnect(null)
    if (platform === 'instagram') {
      try {
        const authUrl = await connectInstagram(brand.brand)
        window.location.href = authUrl
      } catch (error) {
        console.error('Failed to start Instagram connection:', error)
      }
    } else if (platform === 'facebook') {
      setConnectingFacebook(true)
      try {
        const authUrl = await connectFacebook(brand.brand)
        window.location.href = authUrl
      } catch (error) {
        console.error('Failed to start Facebook connection:', error)
        setConnectingFacebook(false)
      }
    } else if (platform === 'threads') {
      await handleThreadsConnect()
    } else if (platform === 'tiktok') {
      await handleTikTokConnect()
    }
  }

  const handleFacebookSelectPage = async (pageId: string) => {
    setSelectingPage(true)
    try {
      await selectFacebookPage(brand.brand, pageId)
      setShowPageSelector(false)
      setFbPages([])
      onRefresh()
    } catch (error) {
      console.error('Failed to select Facebook page:', error)
    } finally {
      setSelectingPage(false)
    }
  }

  const formatError = (error: string): string => {
    const match = error.match(/^(\d{3})\s+Client Error:\s+([^\n]+?)(?:\s+for url:.*)?$/i)
    if (match) {
      const code = match[1]
      if (code === '403') return 'Access forbidden — reconnect your account'
      if (code === '401') return 'Unauthorized — reconnect required'
      return `${code}: ${match[2].trim()}`
    }
    return error.length > 80 ? error.slice(0, 80) + '…' : error
  }

  const renderPlatformRow = (platform: Platform, connection: PlatformConnection) => {
    const isYouTube = platform === 'youtube'
    const isInstagram = platform === 'instagram'
    const isFacebook = platform === 'facebook'
    const isThreads = platform === 'threads'
    const isTikTok = platform === 'tiktok'
    const isActionable = true
    const isRevoked = connection.status === 'revoked'
    const hasError = connection.status === 'error'

    return (
      <div
        key={platform}
        className="flex items-center justify-between gap-3 py-3 px-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white ${getPlatformBgColor(platform)}`}>
            <PlatformIcon platform={platform} className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 capitalize">{platform}</p>
            {connection.connected && connection.account_name && (
              <p className="text-sm text-gray-500 truncate">{connection.account_name}</p>
            )}
            {isRevoked && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                Access revoked — reconnect required
              </p>
            )}
            {hasError && connection.last_error && (
              <p className="text-xs text-orange-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                {formatError(connection.last_error)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {connection.connected ? (
            <>
              {confirmDisconnect === platform ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Disconnect?</span>
                  <button
                    onClick={isYouTube ? handleYouTubeDisconnect : isInstagram ? handleInstagramDisconnect : isFacebook ? handleFacebookDisconnect : isThreads ? handleThreadsDisconnect : isTikTok ? handleTikTokDisconnect : undefined}
                    disabled={disconnectingYouTube || disconnectingInstagram || disconnectingFacebook || disconnectingThreads || disconnectingTikTok || !isActionable}
                    className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                  >
                    {(disconnectingYouTube || disconnectingInstagram || disconnectingFacebook || disconnectingThreads || disconnectingTikTok) ? '...' : 'Yes'}
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
                      onClick={isYouTube ? handleYouTubeConnect : isInstagram ? handleInstagramConnect : isFacebook ? handleFacebookConnect : isThreads ? handleThreadsConnect : isTikTok ? handleTikTokConnect : undefined}
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
                          : platform === 'threads'
                          ? `https://threads.net/${connection.account_name?.replace('@', '')}`
                          : platform === 'tiktok'
                          ? `https://tiktok.com/@${connection.account_name?.replace('@', '')}`
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

                  {isInstagram && (
                    <>
                      <button
                        onClick={handleInstagramConnect}
                        className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                        title="Reconnect"
                      >
                        <RefreshCw className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => setConfirmDisconnect('instagram')}
                        className="p-1.5 rounded hover:bg-red-100 transition-colors"
                        title="Disconnect"
                      >
                        <Unlink className="w-4 h-4 text-gray-500 hover:text-red-500" />
                      </button>
                    </>
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

                  {isFacebook && (
                    <>
                      <button
                        onClick={handleFacebookConnect}
                        className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                        title="Change page"
                      >
                        <RefreshCw className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => setConfirmDisconnect('facebook')}
                        className="p-1.5 rounded hover:bg-red-100 transition-colors"
                        title="Disconnect"
                      >
                        <Unlink className="w-4 h-4 text-gray-500 hover:text-red-500" />
                      </button>
                    </>
                  )}

                  {isThreads && (
                    <>
                      <button
                        onClick={handleThreadsConnect}
                        className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                        title="Reconnect"
                      >
                        <RefreshCw className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => setConfirmDisconnect('threads')}
                        className="p-1.5 rounded hover:bg-red-100 transition-colors"
                        title="Disconnect"
                      >
                        <Unlink className="w-4 h-4 text-gray-500 hover:text-red-500" />
                      </button>
                    </>
                  )}

                  {isTikTok && (
                    <>
                      <button
                        onClick={handleTikTokConnect}
                        className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                        title="Reconnect"
                      >
                        <RefreshCw className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => setConfirmDisconnect('tiktok')}
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
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-500 text-sm whitespace-nowrap">
                <X className="w-3 h-3 flex-shrink-0" />
                Not connected
              </span>

              {isInstagram && (
                <button
                  onClick={handleInstagramConnect}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 text-white hover:opacity-90 transition-opacity"
                >
                  Connect
                </button>
              )}

              {isYouTube && (
                <button
                  onClick={handleYouTubeConnect}
                  disabled={connectingYouTube}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {connectingYouTube ? 'Connecting...' : 'Connect'}
                </button>
              )}

              {isFacebook && (
                <button
                  onClick={handleFacebookConnect}
                  disabled={connectingFacebook}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {connectingFacebook ? 'Connecting...' : 'Connect'}
                </button>
              )}

              {isThreads && (
                <button
                  onClick={handleThreadsConnect}
                  disabled={connectingThreads}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {connectingThreads ? 'Connecting...' : 'Connect'}
                </button>
              )}

              {isTikTok && (
                <button
                  onClick={handleTikTokConnect}
                  disabled={connectingTikTok}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {connectingTikTok ? 'Connecting...' : 'Connect'}
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
              {[brand.instagram, brand.facebook, brand.youtube, brand.threads, brand.tiktok].filter((p) => p?.connected).length}/5 platforms connected
            </p>
          </div>
        </div>
      </div>

      {/* Platform connections */}
      <div className="divide-y divide-gray-100">
        {renderPlatformRow('instagram', brand.instagram)}
        {renderPlatformRow('facebook', brand.facebook)}
        {renderPlatformRow('youtube', brand.youtube)}
        {brand.threads && renderPlatformRow('threads', brand.threads)}
        {brand.tiktok && renderPlatformRow('tiktok', brand.tiktok)}
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

      {/* Facebook Page Selector Modal */}
      {showPageSelector && fbPages.length > 0 && (
        <div className="px-4 py-3 bg-blue-50 border-t border-blue-200">
          <p className="text-sm font-medium text-blue-900 mb-2">Select a Facebook Page to connect:</p>
          <div className="space-y-2">
            {fbPages.map((page) => (
              <button
                key={page.id}
                onClick={() => handleFacebookSelectPage(page.id)}
                disabled={selectingPage}
                className="w-full flex items-center gap-3 p-2 bg-white rounded-lg border border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 text-left"
              >
                {page.picture && (
                  <img src={page.picture} alt="" className="w-8 h-8 rounded-full" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{page.name}</p>
                  {page.category && (
                    <p className="text-xs text-gray-500">{page.category}</p>
                  )}
                </div>
                {page.fan_count != null && (
                  <span className="text-xs text-gray-400">{page.fan_count.toLocaleString()} followers</span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setShowPageSelector(false); setFbPages([]) }}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Confirm Connect Dialog — prevents connecting wrong account */}
      {confirmConnect && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                Connect {confirmConnect === 'instagram' ? 'Instagram' : 'Facebook'} for {brand.display_name}
              </p>
              <p className="text-xs text-amber-700 mt-1">
                You'll be asked to log in. Make sure you log into the correct {confirmConnect === 'instagram' ? 'Instagram' : 'Facebook'} account for <strong>{brand.display_name}</strong>.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={proceedConnect}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors ${
                    confirmConnect === 'instagram'
                      ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 hover:opacity-90'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  Continue
                </button>
                <button
                  onClick={() => setConfirmConnect(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
