import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Layers,
  Plus,
  Settings,
  Palette,
  Check,
  Clock,
  BarChart3,
  Link2,
  Instagram,
  Facebook,
  Youtube,
  Image,
  Type,
  Sparkles,
  Save,
  Sun,
  Moon,
  ArrowRight
} from 'lucide-react'
import { useBrandsList, useBrandConnections, type BrandConnectionStatus } from '@/features/brands'
import { FullPageLoader, Modal } from '@/shared/components'

interface BrandInfo {
  id: string
  name: string
  color: string
  logo: string
}

// Brand scheduling configuration - OFFSET based system
// Each brand has an offset (0-23 hours) from the base schedule
// Posts alternate: LIGHT, DARK, LIGHT, DARK, etc. every (24/postsPerDay) hours
const BRAND_SCHEDULES: Record<string, { offset: number; postsPerDay: number }> = {
  healthycollege: { offset: 0, postsPerDay: 6 },    // Starts at 12:00 AM
  longevitycollege: { offset: 1, postsPerDay: 6 },  // Starts at 1:00 AM
  wellbeingcollege: { offset: 2, postsPerDay: 6 },  // Starts at 2:00 AM
  vitalitycollege: { offset: 3, postsPerDay: 6 },   // Starts at 3:00 AM
  holisticcollege: { offset: 4, postsPerDay: 6 },   // Starts at 4:00 AM
}

// Generate schedule times from offset and posts per day
function generateSchedule(offset: number, postsPerDay: number): Array<{ hour: number; variant: 'light' | 'dark' }> {
  const interval = Math.floor(24 / postsPerDay)
  const slots: Array<{ hour: number; variant: 'light' | 'dark' }> = []
  
  for (let i = 0; i < postsPerDay; i++) {
    const hour = (offset + i * interval) % 24
    const variant = i % 2 === 0 ? 'light' : 'dark'
    slots.push({ hour, variant })
  }
  
  return slots
}

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM'
  if (hour === 12) return '12:00 PM'
  if (hour < 12) return `${hour}:00 AM`
  return `${hour - 12}:00 PM`
}

interface SettingsModalProps {
  brand: BrandInfo
  connections: BrandConnectionStatus | undefined
  allBrands: BrandInfo[]
  onClose: () => void
}

function BrandSettingsModal({ brand, connections, allBrands, onClose }: SettingsModalProps) {
  const navigate = useNavigate()
  const schedule = BRAND_SCHEDULES[brand.id] || { offset: 0, postsPerDay: 6 }
  const [offset, setOffset] = useState(schedule.offset)
  const [postsPerDay, setPostsPerDay] = useState(schedule.postsPerDay)
  const [hasChanges, setHasChanges] = useState(false)

  // Generate preview of schedule
  const previewSlots = generateSchedule(offset, postsPerDay)

  // Check if offset conflicts with another brand
  const getOffsetConflict = (checkOffset: number): string | null => {
    for (const otherBrand of allBrands) {
      if (otherBrand.id === brand.id) continue
      const otherSchedule = BRAND_SCHEDULES[otherBrand.id]
      if (otherSchedule && otherSchedule.offset === checkOffset) {
        return otherBrand.name
      }
    }
    return null
  }

  const offsetConflict = getOffsetConflict(offset)

  const handleSave = () => {
    // TODO: Save to backend
    console.log('Saving schedule:', { offset, postsPerDay })
    setHasChanges(false)
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
            className="flex-1 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium flex items-center justify-center gap-2 min-w-[140px]"
          >
            <Save className="w-4 h-4" />
            Save Changes
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

interface ThemeModalProps {
  brand: BrandInfo
  onClose: () => void
}

function BrandThemeModal({ brand, onClose }: ThemeModalProps) {
  // Theme state - editable colors
  const [brandColor, setBrandColor] = useState(brand.color)
  const [lightTitleColor, setLightTitleColor] = useState('#000000')
  const [lightBgColor, setLightBgColor] = useState('#dcf6c8')
  const [darkTitleColor, setDarkTitleColor] = useState('#ffffff')
  const [darkBgColor, setDarkBgColor] = useState(brand.color)
  const [hasChanges, setHasChanges] = useState(false)

  // Parse color to RGB for display
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 }
  }
  
  const rgb = hexToRgb(brandColor)

  const handleColorChange = (setter: (v: string) => void) => (value: string) => {
    setter(value)
    setHasChanges(true)
  }

  const handleSave = () => {
    // TODO: Save to backend
    console.log('Saving theme:', { 
      brandColor, 
      lightTitleColor, 
      lightBgColor, 
      darkTitleColor, 
      darkBgColor 
    })
    setHasChanges(false)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Preview header */}
      <div 
        className="rounded-xl p-6 text-center"
        style={{ backgroundColor: brandColor }}
      >
        <span className="text-4xl font-bold text-white/30">
          {brand.name.split(' ').map(w => w[0]).join('')}
        </span>
        <h3 className="text-xl font-bold text-white mt-2">{brand.name}</h3>
      </div>

      {/* Brand Color */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Brand Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={brandColor}
              onChange={(e) => handleColorChange(setBrandColor)(e.target.value)}
              className="w-12 h-12 rounded-lg cursor-pointer border-2 border-gray-200"
            />
            <div className="flex-1">
              <input
                type="text"
                value={brandColor.toUpperCase()}
                onChange={(e) => handleColorChange(setBrandColor)(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">RGB({rgb.r}, {rgb.g}, {rgb.b})</p>
            </div>
          </div>
        </div>

        {/* Theme elements */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Theme Elements</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Image className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">Logo</span>
              </div>
              <p className="text-xs text-gray-500">{brand.logo || `${brand.id}_logo.png`}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Type className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">Typography</span>
              </div>
              <p className="text-xs text-gray-500">Inter font family</p>
            </div>
          </div>
        </div>

        {/* Light/Dark mode colors - Editable */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-3 block">Reel Variant Colors</label>
          
          {/* Light Mode */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <Sun className="w-4 h-4 text-yellow-500" />
              <span className="font-medium text-gray-900">Light Mode</span>
            </div>
            
            {/* Light mode preview */}
            <div 
              className="w-full h-16 rounded-lg mb-3 flex items-center justify-center border"
              style={{ backgroundColor: lightBgColor }}
            >
              <span style={{ color: lightTitleColor }} className="font-bold text-sm">
                Sample Title Text
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Title Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={lightTitleColor}
                    onChange={(e) => handleColorChange(setLightTitleColor)(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                  />
                  <input
                    type="text"
                    value={lightTitleColor.toUpperCase()}
                    onChange={(e) => handleColorChange(setLightTitleColor)(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Background Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={lightBgColor}
                    onChange={(e) => handleColorChange(setLightBgColor)(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                  />
                  <input
                    type="text"
                    value={lightBgColor.toUpperCase()}
                    onChange={(e) => handleColorChange(setLightBgColor)(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dark Mode */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Moon className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-white">Dark Mode</span>
            </div>
            
            {/* Dark mode preview */}
            <div 
              className="w-full h-16 rounded-lg mb-3 flex items-center justify-center"
              style={{ backgroundColor: darkBgColor }}
            >
              <span style={{ color: darkTitleColor }} className="font-bold text-sm">
                Sample Title Text
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Title Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={darkTitleColor}
                    onChange={(e) => handleColorChange(setDarkTitleColor)(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-600"
                  />
                  <input
                    type="text"
                    value={darkTitleColor.toUpperCase()}
                    onChange={(e) => handleColorChange(setDarkTitleColor)(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs border border-gray-600 rounded font-mono bg-gray-800 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Background Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={darkBgColor}
                    onChange={(e) => handleColorChange(setDarkBgColor)(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-600"
                  />
                  <input
                    type="text"
                    value={darkBgColor.toUpperCase()}
                    onChange={(e) => handleColorChange(setDarkBgColor)(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs border border-gray-600 rounded font-mono bg-gray-800 text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Changes will update the brand's color configuration. 
          These colors are used for generating reels and thumbnails.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium min-w-[100px]"
        >
          Close
        </button>
        {hasChanges && (
          <button
            onClick={handleSave}
            className="flex-1 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium flex items-center justify-center gap-2 min-w-[120px]"
          >
            <Save className="w-4 h-4" />
            Save Theme
          </button>
        )}
      </div>
    </div>
  )
}

interface CreateBrandModalProps {
  onClose: () => void
}

function CreateBrandModal({ onClose }: CreateBrandModalProps) {
  const [step, setStep] = useState(1)
  const [brandName, setBrandName] = useState('')
  const [brandColor, setBrandColor] = useState('#6366f1')
  const [brandId, setBrandId] = useState('')

  const handleNameChange = (name: string) => {
    setBrandName(name)
    // Auto-generate ID from name
    setBrandId(name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, ''))
  }

  return (
    <div className="p-6 space-y-6">
      {/* Progress steps */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {[1, 2, 3].map(s => (
          <div
            key={s}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              s === step 
                ? 'bg-primary-500 text-white' 
                : s < step 
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-500'
            }`}
          >
            {s < step ? <Check className="w-4 h-4" /> : s}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="text-center mb-6">
            <Sparkles className="w-12 h-12 text-primary-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Brand Identity</h3>
            <p className="text-sm text-gray-500">Set up your brand name and visual identity</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., Fitness College"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand ID</label>
            <input
              type="text"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              placeholder="fitnesscollege"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Used for internal identification</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="w-12 h-12 rounded-lg cursor-pointer border-0"
              />
              <input
                type="text"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm"
              />
            </div>
          </div>

          {/* Preview */}
          {brandName && (
            <div 
              className="rounded-xl p-4 text-center mt-4"
              style={{ backgroundColor: brandColor }}
            >
              <span className="text-white font-bold">{brandName}</span>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="text-center mb-6">
            <Image className="w-12 h-12 text-primary-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Brand Assets</h3>
            <p className="text-sm text-gray-500">Upload your logo and visual assets</p>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
            <Image className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600 mb-2">Drop your logo here or click to upload</p>
            <p className="text-xs text-gray-400">PNG or SVG, max 2MB</p>
            <button className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
              Choose File
            </button>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              <strong>Coming Soon:</strong> Logo upload will be available in a future update.
            </p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="text-center mb-6">
            <Link2 className="w-12 h-12 text-primary-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Connect Platforms</h3>
            <p className="text-sm text-gray-500">Link your social media accounts</p>
          </div>

          <div className="space-y-3">
            <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                <Instagram className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium">Instagram</p>
                <p className="text-sm text-gray-500">Connect business account</p>
              </div>
              <Plus className="w-5 h-5 text-gray-400" />
            </button>

            <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                <Facebook className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium">Facebook</p>
                <p className="text-sm text-gray-500">Connect page</p>
              </div>
              <Plus className="w-5 h-5 text-gray-400" />
            </button>

            <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
                <Youtube className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium">YouTube</p>
                <p className="text-sm text-gray-500">Connect channel</p>
              </div>
              <Plus className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              <strong>Coming Soon:</strong> Full brand creation with platform connections will be available in a future update. 
              Currently, brands require backend configuration.
            </p>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3 pt-4 border-t">
        {step > 1 ? (
          <button
            onClick={() => setStep(step - 1)}
            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Back
          </button>
        ) : (
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Cancel
          </button>
        )}
        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 1 && !brandName}
            className="flex-1 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        ) : (
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
          >
            Done
          </button>
        )}
      </div>
    </div>
  )
}

export function BrandsPage() {
  const { data: brandsData, isLoading: brandsLoading } = useBrandsList()
  const { data: connectionsData, isLoading: connectionsLoading } = useBrandConnections()
  
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedBrandForSettings, setSelectedBrandForSettings] = useState<BrandInfo | null>(null)
  const [selectedBrandForTheme, setSelectedBrandForTheme] = useState<BrandInfo | null>(null)

  // Sort brands by offset
  const sortedBrands = useMemo(() => {
    const brands = brandsData?.brands || []
    return [...brands].sort((a, b) => {
      const offsetA = BRAND_SCHEDULES[a.id]?.offset ?? 99
      const offsetB = BRAND_SCHEDULES[b.id]?.offset ?? 99
      return offsetA - offsetB
    })
  }, [brandsData?.brands])

  if (brandsLoading || connectionsLoading) {
    return <FullPageLoader text="Loading brands..." />
  }

  const connections = connectionsData?.brands || []

  // Get connection count for a brand
  const getConnectionCount = (brandId: string) => {
    const brand = connections.find(b => b.brand === brandId)
    if (!brand) return 0
    return (brand.instagram.connected ? 1 : 0) + 
           (brand.facebook.connected ? 1 : 0) + 
           (brand.youtube.connected ? 1 : 0)
  }

  // Get connection status for a brand
  const getConnectionStatus = (brandId: string) => {
    return connections.find(b => b.brand === brandId)
  }

  // Get schedule info for a brand
  const getBrandSchedule = (brandId: string) => {
    return BRAND_SCHEDULES[brandId] || { offset: 0, postsPerDay: 6 }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Layers className="w-7 h-7 text-primary-500" />
            Brands
          </h1>
          <p className="text-gray-500 mt-1">
            Manage your brand configurations and settings
          </p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Brand
        </button>
      </div>

      {/* Schedule explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          How Scheduling Works
        </h3>
        <p className="text-sm text-blue-800">
          Each brand has a <strong>time offset</strong> that determines when its first post goes out each day. 
          Posts alternate between Light and Dark variants throughout the day.
          Brands are ordered below by their offset to show the posting sequence.
        </p>
      </div>

      {/* Brand list - Vertical layout sorted by offset */}
      <div className="space-y-4">
        {sortedBrands.map((brand, index) => {
          const schedule = getBrandSchedule(brand.id)
          const previewSlots = generateSchedule(schedule.offset, schedule.postsPerDay)
          
          return (
            <div
              key={brand.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
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
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: brand.color }}
                      >
                        <span className="text-lg font-bold text-white">
                          {brand.name.split(' ').map(w => w[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{brand.name}</h3>
                        <p className="text-sm text-gray-500">{brand.id}</p>
                      </div>
                    </div>
                    
                    {/* Connection count */}
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-green-500" />
                      <span>{getConnectionCount(brand.id)}/3</span>
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
                    onClick={() => setSelectedBrandForSettings(brand)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </button>
                  <button
                    onClick={() => setSelectedBrandForTheme(brand)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Palette className="w-4 h-4" />
                    Theme
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {/* Add new brand card */}
        <button
          onClick={() => setShowCreateModal(true)}
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

      {/* Features info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Brand Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
              <Palette className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Custom Theming</h3>
              <p className="text-sm text-gray-500 mt-1">
                Each brand has unique colors, logos, and visual identity for reels
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Independent Scheduling</h3>
              <p className="text-sm text-gray-500 mt-1">
                Staggered posting times to maximize reach across brands
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Multi-Platform</h3>
              <p className="text-sm text-gray-500 mt-1">
                Publish to Instagram, Facebook, and YouTube from one place
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <Modal 
        isOpen={!!selectedBrandForSettings} 
        onClose={() => setSelectedBrandForSettings(null)}
        title={`${selectedBrandForSettings?.name} Settings`}
      >
        {selectedBrandForSettings && (
          <BrandSettingsModal 
            brand={selectedBrandForSettings} 
            connections={getConnectionStatus(selectedBrandForSettings.id)}
            allBrands={sortedBrands}
            onClose={() => setSelectedBrandForSettings(null)} 
          />
        )}
      </Modal>

      {/* Theme Modal */}
      <Modal 
        isOpen={!!selectedBrandForTheme} 
        onClose={() => setSelectedBrandForTheme(null)}
        title={`${selectedBrandForTheme?.name} Theme`}
      >
        {selectedBrandForTheme && (
          <BrandThemeModal 
            brand={selectedBrandForTheme} 
            onClose={() => setSelectedBrandForTheme(null)} 
          />
        )}
      </Modal>

      {/* Create brand modal */}
      <Modal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        title="Create New Brand"
      >
        <CreateBrandModal onClose={() => setShowCreateModal(false)} />
      </Modal>
    </div>
  )
}
