import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, ArrowRight, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Instagram, HelpCircle, ChevronDown } from 'lucide-react'
import { useBrandConnections } from '@/features/brands/hooks/use-connections'
import { useBrands, useUpdateBrand } from '@/features/brands/api/use-brands'
import { connectInstagram, fetchFacebookPages, selectFacebookPage, type FacebookPage } from '@/features/brands'
import { apiClient } from '@/shared/api/client'
import { BrandsSkeleton } from '@/shared/components'
import { ConnectionSummaryBar } from './ConnectionSummaryBar'
import { ConnectionCard } from './ConnectionCard'
import { DeleteBrandDialog } from './DeleteBrandDialog'

export function MyBrandsTab() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: v2Brands, isLoading: brandsLoading } = useBrands()
  const { data: connectionsData, isLoading: connectionsLoading, refetch } = useBrandConnections()
  const updateBrand = useUpdateBrand()

  // OAuth notification state
  const [igNotification, setIgNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [fbNotification, setFbNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [threadsNotification, setThreadsNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [tiktokNotification, setTiktokNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [newBrandId, setNewBrandId] = useState<string | null>(null)
  const [fbSelectPageBrand, setFbSelectPageBrand] = useState<string | null>(null)
  const [fbPages, setFbPages] = useState<FacebookPage[]>([])
  const [fbPagesLoading, setFbPagesLoading] = useState(false)
  const [selectingFbPage, setSelectingFbPage] = useState(false)

  const [deletingBrandId, setDeletingBrandId] = useState<string | null>(null)
  const [deletingBrandName, setDeletingBrandName] = useState<string | null>(null)
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({})
  const [showHelp, setShowHelp] = useState(false)

  // Handle OAuth redirect params
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
      const dupAccount = searchParams.get('ig_duplicate_account')
      const dupBrand = searchParams.get('ig_duplicate_brand')
      const msg = igError.startsWith('duplicate') && dupAccount
        ? `Instagram account ${dupAccount} is already connected to "${dupBrand}". Disconnect it there first.`
        : { denied: 'Permission denied', expired: 'Session expired — please try again', failed: 'Connection failed — please try again' }[igError] || igError
      setIgNotification({ type: 'error', message: `Instagram: ${msg}` })
      searchParams.delete('ig_error')
      searchParams.delete('ig_duplicate_account')
      searchParams.delete('ig_duplicate_brand')
      setSearchParams(searchParams, { replace: true })
    }

    if (fbConnected) {
      setFbNotification({ type: 'success', message: `Facebook connected successfully for ${fbConnected}!` })
      refetch()
      searchParams.delete('fb_connected')
      setSearchParams(searchParams, { replace: true })
    } else if (fbError) {
      const dupAccount = searchParams.get('fb_duplicate_account')
      const dupBrand = searchParams.get('fb_duplicate_brand')
      let msg: string
      if (fbError.startsWith('duplicate') && dupAccount) {
        msg = `Facebook page "${dupAccount}" is already connected to "${dupBrand}". Disconnect it there first.`
      } else {
        const errorMessages: Record<string, string> = {
          denied: 'Permission denied',
          expired: 'Session expired — please try again',
          no_pages: 'No Facebook Pages found on your account',
          failed: 'Connection failed — please try again',
        }
        msg = errorMessages[fbError] || fbError
      }
      setFbNotification({ type: 'error', message: `Facebook: ${msg}` })
      searchParams.delete('fb_error')
      searchParams.delete('fb_duplicate_account')
      searchParams.delete('fb_duplicate_brand')
      setSearchParams(searchParams, { replace: true })
    }

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
      const dupAccount = searchParams.get('threads_duplicate_account')
      const dupBrand = searchParams.get('threads_duplicate_brand')
      let msg: string
      if (threadsError.startsWith('duplicate') && dupAccount) {
        msg = `Threads account ${dupAccount} is already connected to "${dupBrand}". Disconnect it there first.`
      } else {
        const errorMessages: Record<string, string> = {
          denied: 'Permission denied',
          expired: 'Session expired — please try again',
          failed: 'Connection failed — please try again',
        }
        msg = errorMessages[threadsError] || threadsError
      }
      setThreadsNotification({ type: 'error', message: `Threads: ${msg}` })
      searchParams.delete('threads_error')
      searchParams.delete('threads_duplicate_account')
      searchParams.delete('threads_duplicate_brand')
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
      const dupAccount = searchParams.get('tiktok_duplicate_account')
      const dupBrand = searchParams.get('tiktok_duplicate_brand')
      let msg: string
      if (tiktokError.startsWith('duplicate') && dupAccount) {
        msg = `TikTok account ${dupAccount} is already connected to "${dupBrand}". Disconnect it there first.`
      } else {
        const errorMessages: Record<string, string> = {
          denied: 'Permission denied',
          expired: 'Session expired — please try again',
          pkce_error: 'PKCE verification failed — please try again',
          failed: 'Connection failed — please try again',
        }
        msg = errorMessages[tiktokError] || tiktokError
      }
      setTiktokNotification({ type: 'error', message: `TikTok: ${msg}` })
      searchParams.delete('tiktok_error')
      searchParams.delete('tiktok_duplicate_account')
      searchParams.delete('tiktok_duplicate_brand')
      setSearchParams(searchParams, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss notifications
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

  // Fetch brand logos
  useEffect(() => {
    const fetchLogos = async () => {
      if (!connectionsData?.brands) return
      const logos: Record<string, string> = {}
      for (const brand of connectionsData.brands) {
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
    if (connectionsData?.brands?.length) fetchLogos()
  }, [connectionsData?.brands])

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

  // Build schedule data for all brands (for conflict detection)
  const allBrandSchedules = useMemo(() => {
    if (!v2Brands) return []
    return v2Brands.map(b => ({
      id: b.id,
      name: b.display_name,
      offset: b.schedule_offset ?? 0,
    }))
  }, [v2Brands])

  const getSchedule = (brandId: string) => {
    const v2Brand = v2Brands?.find(b => b.id === brandId)
    return {
      offset: v2Brand?.schedule_offset ?? 0,
      postsPerDay: v2Brand?.posts_per_day ?? 6,
    }
  }

  // Sort connections by schedule offset
  const sortedConnections = useMemo(() => {
    if (!connectionsData?.brands) return []
    return [...connectionsData.brands].sort((a, b) => {
      const offsetA = v2Brands?.find(v => v.id === a.brand)?.schedule_offset ?? 0
      const offsetB = v2Brands?.find(v => v.id === b.brand)?.schedule_offset ?? 0
      return offsetA - offsetB
    })
  }, [connectionsData, v2Brands])

  const handleSaveSchedule = async (brandId: string, offset: number, postsPerDay: number) => {
    await updateBrand.mutateAsync({
      id: brandId,
      schedule_offset: offset,
      posts_per_day: postsPerDay,
    })
  }

  if (brandsLoading || connectionsLoading) return <BrandsSkeleton />

  if (!connectionsData) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to load brands</h2>
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

      {/* OAuth notification banners */}
      {[
        { notification: igNotification, dismiss: () => setIgNotification(null) },
        { notification: fbNotification, dismiss: () => setFbNotification(null) },
        { notification: threadsNotification, dismiss: () => setThreadsNotification(null) },
        { notification: tiktokNotification, dismiss: () => setTiktokNotification(null) },
      ].map(({ notification, dismiss }, i) =>
        notification ? (
          <div key={i} className={`flex items-center gap-3 p-4 rounded-xl border ${
            notification.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{notification.message}</span>
            <button onClick={dismiss} className="ml-auto text-sm underline opacity-60 hover:opacity-100">
              Dismiss
            </button>
          </div>
        ) : null
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

      <ConnectionSummaryBar data={connectionsData} />

      {/* Collapsible help section */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="w-full px-5 py-3 flex items-center gap-2 text-left hover:bg-blue-100/50 transition-colors"
        >
          <HelpCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="text-sm font-medium text-blue-900">About Platform Connections</span>
          <ChevronDown className={`w-4 h-4 text-blue-400 ml-auto transition-transform ${showHelp ? 'rotate-180' : ''}`} />
        </button>
        {showHelp && (
          <div className="px-5 pb-4 space-y-2 text-sm text-blue-800 border-t border-blue-200 pt-3">
            <p><strong>Instagram:</strong> Connected via Meta OAuth. Long-lived tokens (60 days) are refreshed automatically every 6 hours.</p>
            <p><strong>Facebook:</strong> Connected via Facebook Login. Stores a Page access token for posting on your behalf.</p>
            <p><strong>YouTube:</strong> Connected via Google OAuth. Stores a permanent refresh token — persists until you revoke access in Google settings.</p>
            <p className="text-blue-600 mt-3">💡 Each brand can have different social accounts. No account can be shared between brands.</p>
          </div>
        )}
      </div>

      {/* Brand cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sortedConnections.map((brand) => (
          <ConnectionCard
            key={brand.brand}
            brand={brand}
            brandLogo={brandLogos[brand.brand]}
            onRefresh={() => refetch()}
            schedule={getSchedule(brand.brand)}
            allBrandSchedules={allBrandSchedules}
            onSaveSchedule={(offset, postsPerDay) => handleSaveSchedule(brand.brand, offset, postsPerDay)}
            onDelete={() => {
              setDeletingBrandId(brand.brand)
              setDeletingBrandName(brand.display_name)
            }}
          />
        ))}

        {/* Add new brand card */}
        <button
          onClick={() => navigate('/brands/new')}
          className="w-full bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 flex items-center justify-center gap-3 hover:border-primary-400 hover:bg-primary-50/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
            <Plus className="w-5 h-5 text-gray-500" />
          </div>
          <div className="text-left">
            <span className="font-medium text-gray-600 block">Create New Brand</span>
            <span className="text-sm text-gray-400">Set up a new brand with custom colors and schedule</span>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400 ml-auto" />
        </button>
      </div>

      {/* Delete confirmation */}
      {deletingBrandId && deletingBrandName && (
        <DeleteBrandDialog
          isOpen={!!deletingBrandId}
          brandId={deletingBrandId}
          brandName={deletingBrandName}
          onClose={() => { setDeletingBrandId(null); setDeletingBrandName(null) }}
          onDeleted={() => { setDeletingBrandId(null); setDeletingBrandName(null) }}
        />
      )}
    </div>
  )
}
