import { Settings, Palette, Trash2, Check } from 'lucide-react'
import type { BrandInfo } from '@/features/brands/constants'
import { generateSchedule, formatHour } from '@/features/brands/constants'

interface BrandCardProps {
  brand: BrandInfo
  index: number
  schedule: { offset: number; postsPerDay: number }
  connectionCount: number
  logoUrl?: string
  onSettings: () => void
  onTheme: () => void
  onDelete: () => void
}

export function BrandCard({
  brand,
  index,
  schedule,
  connectionCount,
  logoUrl,
  onSettings,
  onTheme,
  onDelete,
}: BrandCardProps) {
  const previewSlots = generateSchedule(schedule.offset, schedule.postsPerDay)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      <div className="flex items-stretch">
        {/* Offset indicator */}
        <div
          className="w-20 flex flex-col items-center justify-center text-white shrink-0"
          style={{ backgroundColor: brand.color }}
        >
          <span className="text-xs opacity-80">OFFSET</span>
          <span className="text-2xl font-bold">+{schedule.offset}h</span>
          <span className="text-xs opacity-80">#{index + 1}</span>
        </div>

        {/* Brand info */}
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: brand.color }}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={brand.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-lg font-bold text-white">
                    {brand.name
                      .split(' ')
                      .map((w) => w[0])
                      .join('')}
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{brand.name}</h3>
                <p className="text-sm text-gray-500">{brand.id}</p>
              </div>
            </div>

            {/* Connection count */}
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <Check className="w-4 h-4 text-green-500" />
              <span>{connectionCount}/3</span>
            </div>
          </div>

          {/* Schedule preview */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 mr-1">Schedule:</span>
            {previewSlots.slice(0, 6).map((slot, i) => (
              <span
                key={i}
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  slot.variant === 'light'
                    ? 'bg-gray-100 text-gray-700'
                    : 'bg-gray-800 text-white'
                }`}
              >
                {formatHour(slot.hour)}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 p-4 border-l border-gray-100">
          <button
            onClick={onSettings}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button
            onClick={onTheme}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Palette className="w-4 h-4" />
            Theme
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            title="Delete brand"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
