import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, RefreshCw, CheckCircle2, XCircle, Instagram } from 'lucide-react'
import { useBrandConnections } from '@/features/brands/hooks/use-connections'
import { connectInstagram } from '@/features/brands'
import { apiClient } from '@/shared/api/client'
import { ConnectionsSkeleton } from '@/shared/components'
import { ConnectionSummaryBar } from './ConnectionSummaryBar'
import { ConnectionCard } from './ConnectionCard'

export function ConnectionsTab() {
  const { data, isLoading, refetch } = useBrandConnections()
  const [searchParams, setSearchParams] = useSearchParams()
  const [igNotification, setIgNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [fbNotification, setFbNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [newBrandId, setNewBrandId] = useState<string | null>(null)

  // Handle Instagram OAuth redirect params & new brand prompt
  useEffect(() => {
    const igConnected = searchParams.get('ig_connected')
    const igError = searchParams.get('ig_error')
    const fbConnected = searchParams.get('fb_connected')
    const fbError = searchParams.get('fb_error')
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

    if (newBrand) {
      setNewBrandId(newBrand)
      searchParams.delete('new_brand')
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

  // Store logos loaded from backend
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({})

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
            oauthConfigured={data.oauth_configured}
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
