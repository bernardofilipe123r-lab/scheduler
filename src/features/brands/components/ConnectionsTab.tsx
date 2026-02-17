import { useState, useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useBrandConnections } from '@/features/brands/hooks/use-connections'
import { apiClient } from '@/shared/api/client'
import { PageLoader } from '@/shared/components'
import { ConnectionSummaryBar } from './ConnectionSummaryBar'
import { ConnectionCard } from './ConnectionCard'

export function ConnectionsTab() {
  const { data, isLoading, refetch } = useBrandConnections()

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

  if (isLoading) {
    return <PageLoader page="connections" />
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

  return (
    <div className="space-y-6">
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
            <strong>Instagram & Facebook:</strong> Connected via Meta Business Suite. These use long-lived System User tokens that don't expire.
          </p>
          <p>
            <strong>YouTube:</strong> Connected via OAuth. Click "Connect" to authorize your YouTube channel. The connection persists until you revoke access.
          </p>
          <p className="text-blue-600 mt-3">
            💡 Each brand can have different social accounts connected. YouTube channels cannot be shared between brands.
          </p>
        </div>
      </div>
    </div>
  )
}
