import { Instagram, Facebook, Youtube } from 'lucide-react'
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
      (brand.youtube.connected ? 1 : 0)
    )
  }, 0)
  const totalPossible = data.brands.length * 3

  return (
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
                {data.brands.filter((b) => b.instagram.connected).length}
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
                {data.brands.filter((b) => b.facebook.connected).length}
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
                {data.brands.filter((b) => b.youtube.connected).length}
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
  )
}
