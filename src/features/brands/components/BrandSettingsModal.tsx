import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  Clock,
  Link2,
  Instagram,
  Facebook,
  Youtube,
  Save,
  Loader2,
} from 'lucide-react'
import { useBrands, useUpdateBrand } from '@/features/brands/api/use-brands'
import {
  type BrandInfo,
  BRAND_SCHEDULES,
  generateSchedule,
  formatHour,
} from '@/features/brands/constants'
import { type BrandConnectionStatus } from '@/features/brands'

export interface BrandSettingsModalProps {
  brand: BrandInfo
  connections: BrandConnectionStatus | undefined
  allBrands: BrandInfo[]
  onClose: () => void
}

export function BrandSettingsModal({ brand, connections, allBrands, onClose }: BrandSettingsModalProps) {
  const navigate = useNavigate()
  const updateBrandMutation = useUpdateBrand()
  const { data: v2Brands } = useBrands()
  
  // Get schedule from v2 API data, fall back to hardcoded constants
  const v2Brand = v2Brands?.find(b => b.id === brand.id)
  const schedule = {
    offset: v2Brand?.schedule_offset ?? BRAND_SCHEDULES[brand.id]?.offset ?? 0,
    postsPerDay: v2Brand?.posts_per_day ?? BRAND_SCHEDULES[brand.id]?.postsPerDay ?? 2,
  }
  
  const [offset, setOffset] = useState(schedule.offset)
  const [postsPerDay, setPostsPerDay] = useState(schedule.postsPerDay)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Generate preview of schedule
  const previewSlots = generateSchedule(offset, postsPerDay)

  // Check if offset conflicts with another brand - use v2 data with fallback
  const getOffsetConflict = (checkOffset: number): string | null => {
    for (const otherBrand of allBrands) {
      if (otherBrand.id === brand.id) continue
      const otherV2 = v2Brands?.find(b => b.id === otherBrand.id)
      const otherOffset = otherV2?.schedule_offset ?? BRAND_SCHEDULES[otherBrand.id]?.offset
      if (otherOffset !== undefined && otherOffset === checkOffset) {
        return otherBrand.name
      }
    }
    return null
  }

  const offsetConflict = getOffsetConflict(offset)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateBrandMutation.mutateAsync({
        id: brand.id,
        schedule_offset: offset,
        posts_per_day: postsPerDay,
      })
      setHasChanges(false)
    } catch (err) {
      console.error('Failed to save schedule:', err)
    } finally {
      setIsSaving(false)
    }
  }
  
  return (
    <div className="p-6 space-y-6">
      {/* Brand header */}
      <div className="flex items-center gap-4">
        <div 
          className="w-16 h-16 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: brand.color }}
        >
          <span className="text-2xl font-bold text-white">
            {brand.name.split(' ').map(w => w[0]).join('')}
          </span>
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900">{brand.name}</h3>
          <p className="text-gray-500">{brand.id}</p>
        </div>
      </div>

      {/* Connection status */}
      <div className="bg-gray-50 rounded-xl p-4">
        <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
          <Link2 className="w-4 h-4" />
          Connected Platforms
        </h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                <Instagram className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium">Instagram</span>
            </div>
            {connections?.instagram.connected ? (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check className="w-4 h-4" />
                {connections.instagram.account_name}
              </span>
            ) : (
              <span className="text-sm text-gray-400">Not connected</span>
            )}
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <Facebook className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium">Facebook</span>
            </div>
            {connections?.facebook.connected ? (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check className="w-4 h-4" />
                {connections.facebook.account_name}
              </span>
            ) : (
              <span className="text-sm text-gray-400">Not connected</span>
            )}
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center">
                <Youtube className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium">YouTube</span>
            </div>
            {connections?.youtube.connected ? (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check className="w-4 h-4" />
                {connections.youtube.account_name}
              </span>
            ) : (
              <span className="text-sm text-gray-400">Not connected</span>
            )}
          </div>
        </div>
        <button
          onClick={() => { onClose(); navigate('/connected'); }}
          className="mt-3 w-full py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
        >
          Manage Connections →
        </button>
      </div>

      {/* Schedule Configuration */}
      <div className="bg-gray-50 rounded-xl p-4">
        <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Posting Schedule
        </h4>
        
        {/* Explanation */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-800">
            <strong>How it works:</strong> Posts are spaced evenly throughout the day, alternating between Light and Dark variants.
            The <strong>offset</strong> determines when the first post of the day goes out.
          </p>
        </div>

        {/* Offset selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Time Offset (First post of the day)
          </label>
          <select
            value={offset}
            onChange={(e) => { setOffset(Number(e.target.value)); setHasChanges(true); }}
            className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
              offsetConflict ? 'border-amber-400 bg-amber-50' : 'border-gray-300'
            }`}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{formatHour(i)} (Offset +{i}h)</option>
            ))}
          </select>
          {offsetConflict && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              ⚠️ Same offset as {offsetConflict} - posts will go out at the same time (different content)
            </p>
          )}
        </div>

        {/* Posts per day */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Posts Per Day
          </label>
          <select
            value={postsPerDay}
            onChange={(e) => { setPostsPerDay(Number(e.target.value)); setHasChanges(true); }}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value={2}>2 posts/day (every 12h)</option>
            <option value={3}>3 posts/day (every 8h)</option>
            <option value={4}>4 posts/day (every 6h)</option>
            <option value={6}>6 posts/day (every 4h)</option>
            <option value={8}>8 posts/day (every 3h)</option>
            <option value={12}>12 posts/day (every 2h)</option>
          </select>
        </div>

        {/* Schedule Preview */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Schedule Preview
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {previewSlots.map((slot, i) => (
              <div
                key={i}
                className={`px-3 py-2 rounded-lg text-center text-sm font-medium ${
                  slot.variant === 'light' 
                    ? 'bg-white border border-gray-200 text-gray-800' 
                    : 'bg-gray-800 text-white'
                }`}
              >
                <span className="text-xs opacity-60 block">{slot.variant.toUpperCase()}</span>
                {formatHour(slot.hour)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium min-w-[120px]"
        >
          Close
        </button>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium flex items-center justify-center gap-2 min-w-[140px] disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        )}
        <button
          onClick={() => { onClose(); navigate('/scheduled'); }}
          className="flex-1 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium min-w-[140px] whitespace-nowrap"
        >
          View Schedule
        </button>
      </div>
    </div>
  )
}
