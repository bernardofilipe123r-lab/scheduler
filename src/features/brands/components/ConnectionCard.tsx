import { useState, useCallback } from 'react'
import {
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
  HelpCircle,
} from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { PlatformIcon } from '@/shared/components'
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
  const [showConnectionHelp, setShowConnectionHelp] = useState(false)
  const disconnectYouTube = useDisconnectYouTube()

  const HELP_DISMISSED_KEY = 'viraltoby_connection_help_dismissed'

  const hasSeenHelp = useCallback(() => {
    try { return localStorage.getItem(HELP_DISMISSED_KEY) === '1' } catch { return false }
  }, [])

  const dismissHelp = useCallback(() => {
    try { localStorage.setItem(HELP_DISMISSED_KEY, '1') } catch { /* noop */ }
    setShowConnectionHelp(false)
  }, [])

  const startConnect = useCallback(async (platform: Platform) => {
    try {
      let authUrl: string
      if (platform === 'instagram') {
        authUrl = await connectInstagram(brand.brand)
      } else if (platform === 'facebook') {
        authUrl = await connectFacebook(brand.brand)
      } else if (platform === 'threads') {
        authUrl = await connectThreads(brand.brand)
      } else if (platform === 'tiktok') {
        authUrl = await connectTikTok(brand.brand)
      } else if (platform === 'youtube') {
        authUrl = await connectYouTube(brand.brand as BrandName)
      } else {
        return
      }
      window.location.href = authUrl
    } catch (error: any) {
      if (platform === 'threads' || platform === 'tiktok') {
        const msg = error?.status === 503
          ? (error.message || `${platform} OAuth not configured — check environment variables`)
          : `Failed to start ${platform} connection`
        alert(msg)
      }
      console.error(`Failed to start ${platform} connection:`, error)
    }
  }, [brand.brand])

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
    startConnect('instagram')
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
    setConnectingFacebook(true)
    startConnect('facebook').finally(() => setConnectingFacebook(false))
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
    startConnect('threads').finally(() => setConnectingThreads(false))
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
    startConnect('tiktok').finally(() => setConnectingTikTok(false))
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
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                        title="Disconnect"
                      >
                        Disconnect
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
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                        title="Disconnect"
                      >
                        Disconnect
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
        <button
          onClick={() => setShowConnectionHelp(true)}
          className="p-1.5 rounded-lg hover:bg-white/50 transition-colors"
          title="Help with connections"
        >
          <HelpCircle className="w-5 h-5 text-gray-400" />
        </button>
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

      {/* Connection Help Modal */}
      <Modal isOpen={showConnectionHelp} onClose={() => setShowConnectionHelp(false)} title="About Connecting Accounts" size="sm">
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            When you click <strong>Connect</strong>, you'll be redirected to log in on that platform.
          </p>
          <p>
            <strong>Make sure you log into the correct account</strong> for this brand. Each social account can only be connected to one brand at a time.
          </p>
          <p className="text-gray-500">
            If an account is already connected to another brand, you'll need to disconnect it there first.
          </p>
        </div>
        <div className="flex justify-end mt-4">
          {!hasSeenHelp() && (
            <button
              onClick={dismissHelp}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors"
            >
              Got it, don't show again
            </button>
          )}
        </div>
      </Modal>
    </div>
  )
}
