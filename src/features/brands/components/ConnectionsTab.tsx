import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, RefreshCw, CheckCircle2, XCircle, Instagram } from 'lucide-react'
import { useBrandConnections } from '@/features/brands/hooks/use-connections'
import { connectInstagram, fetchFacebookPages, selectFacebookPage, type FacebookPage } from '@/features/brands'
import { apiClient } from '@/shared/api/client'
import { ConnectionsSkeleton } from '@/shared/components'
import { ConnectionSummaryBar } from './ConnectionSummaryBar'
import { ConnectionCard } from './ConnectionCard'

export function ConnectionsTab() {
  const { data, isLoading, refetch } = useBrandConnections()
  const [searchParams, setSearchParams] = useSearchParams()
  const [igNotification, setIgNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [fbNotification, setFbNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [threadsNotification, setThreadsNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [tiktokNotification, setTiktokNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [newBrandId, setNewBrandId] = useState<string | null>(null)
  const [fbSelectPageBrand, setFbSelectPageBrand] = useState<string | null>(null)
  const [fbPages, setFbPages] = useState<FacebookPage[]>([])
  const [fbPagesLoading, setFbPagesLoading] = useState(false)
  const [selectingFbPage, setSelectingFbPage] = useState(false)

  // Handle Instagram OAuth redirect params & new brand prompt
  useEffect(() => {
    const igConnected = searchParams.get('ig_connected')
    const igError = searchParams.get('ig_error')
    const fbConnected = searchParams.get('fb_connected')
    const fbError = searchParams.get('fb_error')
    const fbSelectPage = searchParams.get('fb_select_page')
    const newBrand = searchParams.get('new_brand')

    if (igConnected) {
      setIgNotification({ type: 'success', message: `Instagram connected successfully for ${igConnected}!` })
      setNewBrandId(null)
      refetch()
      searchParams.delete('ig_connected')
      setSearchParams(searchParams, { replace: true })
    } else if (igError) {
      setIgNotification({ type: 'error', message: `Instagram connection failed: ${igError}` })
      searchParams.delete('ig_error')
      setSearchParams(searchParams, { replace: true })
    }

    if (fbConnected) {
      setFbNotification({ type: 'success', message: `Facebook connected successfully for ${fbConnected}!` })
      refetch()
      searchParams.delete('fb_connected')
      setSearchParams(searchParams, { replace: true })
    } else if (fbError) {
      const errorMessages: Record<string, string> = {
        denied: 'Permission denied',
        expired: 'Session expired — please try again',
        no_pages: 'No Facebook Pages found on your account',
        failed: 'Connection failed — please try again',
      }
      setFbNotification({ type: 'error', message: `Facebook: ${errorMessages[fbError] || fbError}` })
      searchParams.delete('fb_error')
      setSearchParams(searchParams, { replace: true })
    }

    // Handle multi-page selection redirect from backend
    if (fbSelectPage) {
      setFbSelectPageBrand(fbSelectPage)
      setFbPagesLoading(true)
      searchParams.delete('fb_select_page')
      setSearchParams(searchParams, { replace: true })
      fetchFacebookPages(fbSelectPage).then((pages) => {
        setFbPages(pages)
      }).catch(() => {
        setFbNotification({ type: 'error', message: 'Failed to load Facebook pages. Please try connecting again.' })
        setFbSelectPageBrand(null)
      }).finally(() => {
        setFbPagesLoading(false)
      })
    }

    if (newBrand) {
      setNewBrandId(newBrand)
      searchParams.delete('new_brand')
      setSearchParams(searchParams, { replace: true })
    }

    // Handle Threads OAuth redirect params
    const threadsConnected = searchParams.get('threads_connected')
    const threadsError = searchParams.get('threads_error')
    if (threadsConnected) {
      setThreadsNotification({ type: 'success', message: `Threads connected successfully for ${threadsConnected}!` })
      refetch()
      searchParams.delete('threads_connected')
      setSearchParams(searchParams, { replace: true })
    } else if (threadsError) {
      const errorMessages: Record<string, string> = {
        denied: 'Permission denied',
        expired: 'Session expired — please try again',
        failed: 'Connection failed — please try again',
      }
      setThreadsNotification({ type: 'error', message: `Threads: ${errorMessages[threadsError] || threadsError}` })
      searchParams.delete('threads_error')
      setSearchParams(searchParams, { replace: true })
    }

    // Handle TikTok OAuth redirect params
    const tiktokConnected = searchParams.get('tiktok_connected')
    const tiktokError = searchParams.get('tiktok_error')
    if (tiktokConnected) {
      setTiktokNotification({ type: 'success', message: `TikTok connected successfully for ${tiktokConnected}!` })
      refetch()
      searchParams.delete('tiktok_connected')
      setSearchParams(searchParams, { replace: true })
    } else if (tiktokError) {
      const errorMessages: Record<string, string> = {
        denied: 'Permission denied',
        expired: 'Session expired — please try again',
        pkce_error: 'PKCE verification failed — please try again',
        failed: 'Connection failed — please try again',
      }
      setTiktokNotification({ type: 'error', message: `TikTok: ${errorMessages[tiktokError] || tiktokError}` })
      searchParams.delete('tiktok_error')
      setSearchParams(searchParams, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss notification
  useEffect(() => {
    if (igNotification) {
      const timer = setTimeout(() => setIgNotification(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [igNotification])

  useEffect(() => {
    if (fbNotification) {
      const timer = setTimeout(() => setFbNotification(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [fbNotification])

  useEffect(() => {
    if (threadsNotification) {
      const timer = setTimeout(() => setThreadsNotification(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [threadsNotification])

  useEffect(() => {
    if (tiktokNotification) {
      const timer = setTimeout(() => setTiktokNotification(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [tiktokNotification])

  // Store logos loaded from backend
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({})

  const handleSelectFbPage = async (pageId: string) => {
    if (!fbSelectPageBrand) return
    setSelectingFbPage(true)
    try {
      await selectFacebookPage(fbSelectPageBrand, pageId)
      setFbSelectPageBrand(null)
      setFbPages([])
      setFbNotification({ type: 'success', message: 'Facebook page connected!' })
      refetch()
    } catch {
      setFbNotification({ type: 'error', message: 'Failed to select Facebook page. Please try again.' })
    } finally {
      setSelectingFbPage(false)
    }
  }
  useEffect(() => {
    const fetchBrandLogos = async () => {
      if (!data?.brands) return
      const logos: Record<string, string> = {}
      for (const brand of data.brands) {
        try {
          const themeData = await apiClient.get<{ theme?: { logo?: string } }>(`/api/brands/${brand.brand}/theme`)
          if (themeData.theme?.logo) {
            const logoUrl = themeData.theme.logo.startsWith('http') ? themeData.theme.logo : `/brand-logos/${themeData.theme.logo}`
            logos[brand.brand] = logoUrl
          }
        } catch {
          // ignore
        }
      }
      setBrandLogos(logos)
    }
    if (data?.brands?.length) fetchBrandLogos()
  }, [data?.brands])

  if (isLoading) return <ConnectionsSkeleton />

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

  return (
    <div className="space-y-6">
      {/* New brand: prompt to connect Instagram */}
      {newBrandId && (
        <div className="bg-gradient-to-r from-purple-50 via-pink-50 to-orange-50 border border-purple-200 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center flex-shrink-0">
              <Instagram className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Connect Instagram for {newBrandId}</h3>
              <p className="text-sm text-gray-600 mt-1">
                Your brand was created! Click below to connect your Instagram account — it only takes a few seconds.
              </p>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={async () => {
                    try {
                      const authUrl = await connectInstagram(newBrandId)
                      window.location.href = authUrl
                    } catch (error) {
                      console.error('Failed to start Instagram connection:', error)
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 text-white hover:opacity-90 transition-opacity"
                >
                  <Instagram className="w-4 h-4" />
                  Connect Instagram
                </button>
                <button
                  onClick={() => setNewBrandId(null)}
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instagram OAuth notification */}
      {igNotification && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${
          igNotification.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {igNotification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{igNotification.message}</span>
          <button onClick={() => setIgNotification(null)} className="ml-auto text-sm underline opacity-60 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Facebook OAuth notification */}
      {fbNotification && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${
          fbNotification.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {fbNotification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{fbNotification.message}</span>
          <button onClick={() => setFbNotification(null)} className="ml-auto text-sm underline opacity-60 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Threads OAuth notification */}
      {threadsNotification && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${
          threadsNotification.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {threadsNotification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{threadsNotification.message}</span>
          <button onClick={() => setThreadsNotification(null)} className="ml-auto text-sm underline opacity-60 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* TikTok OAuth notification */}
      {tiktokNotification && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${
          tiktokNotification.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {tiktokNotification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{tiktokNotification.message}</span>
          <button onClick={() => setTiktokNotification(null)} className="ml-auto text-sm underline opacity-60 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Facebook Page Selector (multi-page flow) */}
      {fbSelectPageBrand && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Select a Facebook Page</h3>
          <p className="text-sm text-blue-700 mb-4">
            Choose which Facebook Page to connect for <strong>{fbSelectPageBrand}</strong>:
          </p>
          {fbPagesLoading ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
              <span className="text-sm text-blue-700">Loading pages...</span>
            </div>
          ) : fbPages.length > 0 ? (
            <div className="space-y-2">
              {fbPages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => handleSelectFbPage(page.id)}
                  disabled={selectingFbPage}
                  className="w-full flex items-center gap-3 p-3 bg-white rounded-lg border border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 text-left"
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
          ) : (
            <p className="text-sm text-gray-500 py-2">No pages found.</p>
          )}
          <button
            onClick={() => { setFbSelectPageBrand(null); setFbPages([]) }}
            className="mt-3 text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <ConnectionSummaryBar data={data} />

      {/* Brand cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.brands.map((brand) => (
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
            <strong>Instagram:</strong> Connected via Meta OAuth. Long-lived tokens (60 days) are refreshed automatically every 6 hours — you should never need to reconnect manually.
          </p>
          <p>
            <strong>Facebook:</strong> Connected via Facebook Login. Stores a Page access token that lets the app post on behalf of your Facebook Page.
          </p>
          <p>
            <strong>YouTube:</strong> Connected via Google OAuth. Stores a permanent refresh token — the connection persists until you revoke access in your Google account settings. Token validity is checked every 24 hours.
          </p>
          <p className="text-blue-600 mt-3">
            💡 Each brand can have different social accounts connected. YouTube channels cannot be shared between brands.
          </p>
        </div>
      </div>
    </div>
  )
}
