import { PlatformIcon } from '@/shared/components'
import type { BrandConnectionsResponse } from '@/features/brands'

interface ConnectionSummaryBarProps {
  data: BrandConnectionsResponse
}

export function ConnectionSummaryBar({ data }: ConnectionSummaryBarProps) {
  const totalConnections = data.brands.reduce((acc, brand) => {
    return (
      acc +
      (brand.instagram.connected ? 1 : 0) +
      (brand.facebook.connected ? 1 : 0) +
      (brand.youtube.connected ? 1 : 0) +
      (brand.threads?.connected ? 1 : 0) +
      (brand.tiktok?.connected ? 1 : 0) +
      (brand.bluesky?.connected ? 1 : 0)
    )
  }, 0)
  const totalPossible = data.brands.length * 6

  const platforms = [
    { key: 'instagram' as const, label: 'Instagram', bg: 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500', count: data.brands.filter((b) => b.instagram.connected).length },
    { key: 'facebook' as const, label: 'Facebook', bg: 'bg-blue-600', count: data.brands.filter((b) => b.facebook.connected).length },
    { key: 'youtube' as const, label: 'YouTube', bg: 'bg-red-500', count: data.brands.filter((b) => b.youtube.connected).length },
    { key: 'threads' as const, label: 'Threads', bg: 'bg-black', count: data.brands.filter((b) => b.threads?.connected).length },
    { key: 'tiktok' as const, label: 'TikTok', bg: 'bg-black', count: data.brands.filter((b) => b.tiktok?.connected).length },
    { key: 'bluesky' as const, label: 'Bluesky', bg: 'bg-sky-500', count: data.brands.filter((b) => b.bluesky?.connected).length },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Connection Summary</h2>
          <p className="text-sm text-gray-500 mt-1">
            {totalConnections} of {totalPossible} platform connections active
          </p>
        </div>

        <div className="flex items-center gap-5">
          {platforms.map(({ key, label, bg, count }) => (
            <div key={key} className="text-center">
              <div className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded ${bg} flex items-center justify-center`}>
                  <PlatformIcon platform={key} className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-xl font-bold text-gray-900">{count}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          ))}
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
  )
}
