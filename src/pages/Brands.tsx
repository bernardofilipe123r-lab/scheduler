import { useState, useMemo, useEffect } from 'react'
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
  Sparkles,
  Save,
  Sun,
  Moon,
  ArrowRight,
  Upload,
  X,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { useBrandsList, useBrandConnections, type BrandConnectionStatus } from '@/features/brands'
import { useBrands, useCreateBrand, type CreateBrandInput, type BrandColors } from '@/features/brands/api/use-brands'
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

// Brand theme colors - matches Python brand_colors.py
// Each brand has a primary color, and light/dark mode title and background colors
interface BrandTheme {
  brandColor: string
  lightTitleColor: string
  lightBgColor: string
  darkTitleColor: string
  darkBgColor: string
}

const BRAND_THEMES: Record<string, BrandTheme> = {
  healthycollege: {
    brandColor: '#004f00',      // Dark green
    lightTitleColor: '#000000',
    lightBgColor: '#dcf6c8',    // Light green
    darkTitleColor: '#ffffff',
    darkBgColor: '#004f00',     // Dark green
  },
  longevitycollege: {
    brandColor: '#019dc8',      // Cyan
    lightTitleColor: '#000000',
    lightBgColor: '#c8eaf6',    // Light cyan
    darkTitleColor: '#ffffff',
    darkBgColor: '#019dc8',     // Cyan
  },
  wellbeingcollege: {
    brandColor: '#ebbe4d',      // Yellow/gold
    lightTitleColor: '#000000',
    lightBgColor: '#fff4d6',    // Light yellow
    darkTitleColor: '#ffffff',
    darkBgColor: '#ebbe4d',     // Yellow
  },
  vitalitycollege: {
    brandColor: '#028f7a',      // Teal
    lightTitleColor: '#ffffff',
    lightBgColor: '#028f7a',    // Teal
    darkTitleColor: '#ffffff',
    darkBgColor: '#028f7a',     // Teal
  },
  holisticcollege: {
    brandColor: '#f0836e',      // Coral
    lightTitleColor: '#000000',
    lightBgColor: '#f9e0db',    // Light coral
    darkTitleColor: '#ffffff',
    darkBgColor: '#f0836e',     // Coral
  },
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
  onSave?: () => void
}

function BrandThemeModal({ brand, onClose, onSave }: ThemeModalProps) {
  // Get theme defaults from BRAND_THEMES
  const themeDefaults = BRAND_THEMES[brand.id] || {
    brandColor: brand.color,
    lightTitleColor: '#000000',
    lightBgColor: '#dcf6c8',
    darkTitleColor: '#ffffff',
    darkBgColor: brand.color
  }

  // Theme state - editable colors (initialized from brand-specific defaults)
  const [brandColor, setBrandColor] = useState(themeDefaults.brandColor)
  const [lightTitleColor, setLightTitleColor] = useState(themeDefaults.lightTitleColor)
  const [lightBgColor, setLightBgColor] = useState(themeDefaults.lightBgColor)
  const [darkTitleColor, setDarkTitleColor] = useState(themeDefaults.darkTitleColor)
  const [darkBgColor, setDarkBgColor] = useState(themeDefaults.darkBgColor)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  // Logo state
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  
  // Fetch saved theme on mount
  useEffect(() => {
    const fetchSavedTheme = async () => {
      try {
        const response = await fetch(`/api/brands/${brand.id}/theme`)
        if (response.ok) {
          const data = await response.json()
          if (data.has_overrides && data.theme) {
            // Use saved values
            if (data.theme.brand_color) setBrandColor(data.theme.brand_color)
            if (data.theme.light_title_color) setLightTitleColor(data.theme.light_title_color)
            if (data.theme.light_bg_color) setLightBgColor(data.theme.light_bg_color)
            if (data.theme.dark_title_color) setDarkTitleColor(data.theme.dark_title_color)
            if (data.theme.dark_bg_color) setDarkBgColor(data.theme.dark_bg_color)
            
            // Load logo if exists
            if (data.theme.logo) {
              const logoUrl = `/brand-logos/${data.theme.logo}?t=${Date.now()}`
              const logoCheck = await fetch(logoUrl, { method: 'HEAD' })
              if (logoCheck.ok) {
                setLogoPreview(logoUrl)
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch saved theme:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchSavedTheme()
  }, [brand.id])

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onload = (event) => {
        setLogoPreview(event.target?.result as string)
      }
      reader.readAsDataURL(file)
      setHasChanges(true)
    }
  }

  const removeLogo = () => {
    setLogoPreview(null)
    setLogoFile(null)
    setHasChanges(true)
  }

  const handleColorChange = (setter: (v: string) => void) => (value: string) => {
    setter(value)
    setHasChanges(true)
    setSaveError(null)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    
    try {
      // Create form data
      const formData = new FormData()
      formData.append('brand_color', brandColor)
      formData.append('light_title_color', lightTitleColor)
      formData.append('light_bg_color', lightBgColor)
      formData.append('dark_title_color', darkTitleColor)
      formData.append('dark_bg_color', darkBgColor)
      
      if (logoFile) {
        formData.append('logo', logoFile)
      }
      
      const response = await fetch(`/api/brands/${brand.id}/theme`, {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to save theme')
      }
      
      // Success - notify parent and close modal
      onSave?.()
      onClose()
    } catch (error) {
      console.error('Failed to save theme:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to save theme')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Loading theme...</span>
        </div>
      )}
      
      {!isLoading && (
        <>
      {/* Main content - horizontal layout */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left column - Logo and Brand Color */}
        <div className="space-y-4">
          {/* Logo upload */}
          <div 
            className="rounded-xl p-4 text-center"
            style={{ backgroundColor: brandColor }}
          >
            {logoPreview ? (
              <div className="relative inline-block">
                <img 
                  src={logoPreview} 
                  alt={brand.name} 
                  className="w-16 h-16 object-contain mx-auto"
                />
                <button
                  onClick={removeLogo}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <label className="cursor-pointer group">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <div className="w-16 h-16 mx-auto rounded-lg bg-white/20 flex flex-col items-center justify-center group-hover:bg-white/30 transition-colors border-2 border-dashed border-white/40">
                  <Upload className="w-5 h-5 text-white/60" />
                  <span className="text-[10px] text-white/60 mt-1">Upload</span>
                </div>
              </label>
            )}
            <p className="text-white text-sm font-medium mt-2">{brand.name}</p>
          </div>

          {/* Brand Color */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Brand Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => handleColorChange(setBrandColor)(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200"
              />
              <div className="flex-1">
                <input
                  type="text"
                  value={brandColor.toUpperCase()}
                  onChange={(e) => handleColorChange(setBrandColor)(e.target.value)}
                  className="w-full px-2 py-1 border border-gray-300 rounded font-mono text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Middle column - Light Mode */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sun className="w-4 h-4 text-yellow-500" />
            <span className="font-medium text-gray-900 text-sm">Light Mode</span>
          </div>
          
          <div 
            className="w-full h-12 rounded-lg mb-3 flex items-center justify-center border"
            style={{ backgroundColor: lightBgColor }}
          >
            <span style={{ color: lightTitleColor }} className="font-bold text-xs">
              Sample Title
            </span>
          </div>

          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Title Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={lightTitleColor}
                  onChange={(e) => handleColorChange(setLightTitleColor)(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border border-gray-300"
                />
                <input
                  type="text"
                  value={lightTitleColor.toUpperCase()}
                  onChange={(e) => handleColorChange(setLightTitleColor)(e.target.value)}
                  className="flex-1 px-2 py-1 text-xs font-mono border border-gray-300 rounded bg-white text-gray-800"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Background</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={lightBgColor}
                  onChange={(e) => handleColorChange(setLightBgColor)(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border border-gray-300"
                />
                <input
                  type="text"
                  value={lightBgColor.toUpperCase()}
                  onChange={(e) => handleColorChange(setLightBgColor)(e.target.value)}
                  className="flex-1 px-2 py-1 text-xs font-mono border border-gray-300 rounded bg-white text-gray-800"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right column - Dark Mode */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Moon className="w-4 h-4 text-gray-400" />
            <span className="font-medium text-white text-sm">Dark Mode</span>
          </div>
          
          <div 
            className="w-full h-12 rounded-lg mb-3 flex items-center justify-center border border-gray-600"
            style={{ backgroundColor: darkBgColor }}
          >
            <span style={{ color: darkTitleColor }} className="font-bold text-xs">
              Sample Title
            </span>
          </div>

          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Title Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={darkTitleColor}
                  onChange={(e) => handleColorChange(setDarkTitleColor)(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border border-gray-600"
                />
                <input
                  type="text"
                  value={darkTitleColor.toUpperCase()}
                  onChange={(e) => handleColorChange(setDarkTitleColor)(e.target.value)}
                  className="flex-1 px-2 py-1 text-xs font-mono border border-gray-600 rounded"
                  style={{ backgroundColor: '#374151', color: '#f3f4f6' }}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Background</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={darkBgColor}
                  onChange={(e) => handleColorChange(setDarkBgColor)(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border border-gray-600"
                />
                <input
                  type="text"
                  value={darkBgColor.toUpperCase()}
                  onChange={(e) => handleColorChange(setDarkBgColor)(e.target.value)}
                  className="flex-1 px-2 py-1 text-xs font-mono border border-gray-600 rounded"
                  style={{ backgroundColor: '#374151', color: '#f3f4f6' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error message */}
      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">
            <strong>Error:</strong> {saveError}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={onClose}
          disabled={isSaving}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Theme
            </>
          )}
        </button>
      </div>
      </>
      )}
    </div>
  )
}

interface CreateBrandModalProps {
  onClose: () => void
  onSuccess?: () => void
}

// Color presets for quick selection
const COLOR_PRESETS = [
  { name: 'Forest Green', primary: '#004f00', accent: '#16a34a', colorName: 'vibrant green' },
  { name: 'Ocean Blue', primary: '#019dc8', accent: '#0ea5e9', colorName: 'ocean blue' },
  { name: 'Royal Purple', primary: '#6b21a8', accent: '#a855f7', colorName: 'royal purple' },
  { name: 'Sunset Orange', primary: '#c2410c', accent: '#f97316', colorName: 'sunset orange' },
  { name: 'Ruby Red', primary: '#9f1239', accent: '#f43f5e', colorName: 'ruby red' },
  { name: 'Golden Yellow', primary: '#a16207', accent: '#eab308', colorName: 'golden yellow' },
  { name: 'Slate Gray', primary: '#334155', accent: '#64748b', colorName: 'modern slate' },
  { name: 'Teal', primary: '#0d9488', accent: '#14b8a6', colorName: 'refreshing teal' },
]

// Helper to generate light/dark mode colors from primary
function generateModeColors(primary: string, accent: string) {
  // Lighten for light mode background
  const lightBg = adjustColorBrightness(primary, 180)
  // Darken for dark mode background
  const darkBg = adjustColorBrightness(primary, -40)
  
  return {
    light_mode: {
      background: lightBg,
      gradient_start: lightBg,
      gradient_end: adjustColorBrightness(accent, 150),
      text: '#000000',
      cta_bg: primary,
      cta_text: '#ffffff',
    },
    dark_mode: {
      background: darkBg,
      gradient_start: darkBg,
      gradient_end: adjustColorBrightness(primary, -20),
      text: '#ffffff',
      cta_bg: accent,
      cta_text: '#ffffff',
    }
  }
}

// Adjust color brightness (positive = lighter, negative = darker)
function adjustColorBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount))
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function CreateBrandModal({ onClose, onSuccess }: CreateBrandModalProps) {
  const createBrandMutation = useCreateBrand()
  const { data: existingBrands } = useBrands()
  
  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)
  
  // Step 1: Brand Identity
  const [displayName, setDisplayName] = useState('')
  const [brandId, setBrandId] = useState('')
  const [shortName, setShortName] = useState('')
  
  // Step 2: Colors
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [primaryColor, setPrimaryColor] = useState('#6366f1')
  const [accentColor, setAccentColor] = useState('#818cf8')
  const [colorName, setColorName] = useState('indigo')
  const [useCustomColors, setUseCustomColors] = useState(false)
  
  // Step 3: Schedule
  const [scheduleOffset, setScheduleOffset] = useState(0)
  const [postsPerDay, setPostsPerDay] = useState(6)
  
  // Step 4: Social handles (optional)
  const [instagramHandle, setInstagramHandle] = useState('')
  const [facebookPage, setFacebookPage] = useState('')
  const [youtubeChannel, setYoutubeChannel] = useState('')

  // Auto-generate ID and short name from display name
  const handleNameChange = (name: string) => {
    setDisplayName(name)
    setError(null)
    
    // Auto-generate ID (lowercase, no spaces/special chars)
    const genId = name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
    setBrandId(genId)
    
    // Auto-generate short name (first letters of each word, max 4 chars)
    const words = name.split(/\s+/).filter(w => w.length > 0)
    let abbrev = ''
    if (words.length === 1) {
      abbrev = words[0].substring(0, 3).toUpperCase()
    } else {
      abbrev = words.map(w => w[0]).join('').substring(0, 4).toUpperCase()
    }
    setShortName(abbrev)
  }

  // Apply color preset
  const applyPreset = (index: number) => {
    const preset = COLOR_PRESETS[index]
    setSelectedPreset(index)
    setPrimaryColor(preset.primary)
    setAccentColor(preset.accent)
    setColorName(preset.colorName)
    setUseCustomColors(false)
  }

  // Validate current step before proceeding
  const validateStep = (): boolean => {
    setError(null)
    
    if (step === 1) {
      if (!displayName.trim()) {
        setError('Brand name is required')
        return false
      }
      if (!brandId.trim()) {
        setError('Brand ID is required')
        return false
      }
      if (brandId.length < 3) {
        setError('Brand ID must be at least 3 characters')
        return false
      }
      // Check for duplicate ID
      if (existingBrands?.some(b => b.id === brandId)) {
        setError('A brand with this ID already exists')
        return false
      }
      if (!shortName.trim()) {
        setError('Short name is required (used for logo fallback)')
        return false
      }
    }
    
    if (step === 2) {
      if (!primaryColor || !accentColor) {
        setError('Colors are required')
        return false
      }
    }
    
    return true
  }

  // Handle next step
  const handleNext = () => {
    if (validateStep()) {
      setStep(step + 1)
    }
  }

  // Handle brand creation
  const handleCreate = async () => {
    if (!validateStep()) return
    
    setError(null)
    
    // Build colors object with auto-generated mode colors
    const modeColors = generateModeColors(primaryColor, accentColor)
    const colors: BrandColors = {
      primary: primaryColor,
      accent: accentColor,
      color_name: colorName,
      ...modeColors,
    }
    
    const input: CreateBrandInput = {
      id: brandId,
      display_name: displayName,
      short_name: shortName,
      instagram_handle: instagramHandle || undefined,
      facebook_page_name: facebookPage || undefined,
      youtube_channel_name: youtubeChannel || undefined,
      schedule_offset: scheduleOffset,
      posts_per_day: postsPerDay,
      colors,
    }
    
    try {
      await createBrandMutation.mutateAsync(input)
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create brand')
    }
  }

  const totalSteps = 4

  return (
    <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
      {/* Progress steps */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                s === step 
                  ? 'bg-primary-500 text-white' 
                  : s < step 
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {s < step ? <Check className="w-4 h-4" /> : s}
            </div>
            {s < 4 && <div className={`w-8 h-0.5 ${s < step ? 'bg-green-500' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Step 1: Brand Identity */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="text-center mb-6">
            <Sparkles className="w-12 h-12 text-primary-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Brand Identity</h3>
            <p className="text-sm text-gray-500">Set up your brand name and identifiers</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Brand Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., THE FITNESS COLLEGE"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={brandId}
                onChange={(e) => setBrandId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                placeholder="fitnesscollege"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Unique identifier</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Short Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={shortName}
                onChange={(e) => setShortName(e.target.value.toUpperCase().substring(0, 4))}
                placeholder="FCO"
                maxLength={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm uppercase"
              />
              <p className="text-xs text-gray-500 mt-1">Logo fallback (3-4 chars)</p>
            </div>
          </div>

          {/* Preview */}
          {displayName && (
            <div className="bg-gray-100 rounded-xl p-4 text-center mt-4">
              <div className="w-16 h-16 rounded-full bg-primary-500 flex items-center justify-center mx-auto mb-2">
                <span className="text-white font-bold text-xl">{shortName || '?'}</span>
              </div>
              <p className="font-semibold">{displayName}</p>
              <p className="text-sm text-gray-500 font-mono">{brandId || 'brand-id'}</p>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Colors */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="text-center mb-6">
            <Palette className="w-12 h-12 text-primary-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Brand Colors</h3>
            <p className="text-sm text-gray-500">Choose your brand's color scheme</p>
          </div>

          {/* Color presets */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color Presets</label>
            <div className="grid grid-cols-4 gap-2">
              {COLOR_PRESETS.map((preset, index) => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(index)}
                  className={`relative p-2 rounded-lg border-2 transition-all ${
                    selectedPreset === index && !useCustomColors
                      ? 'border-primary-500 ring-2 ring-primary-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex gap-1 mb-1">
                    <div 
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: preset.primary }}
                    />
                    <div 
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: preset.accent }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 truncate">{preset.name}</p>
                  {selectedPreset === index && !useCustomColors && (
                    <Check className="absolute top-1 right-1 w-4 h-4 text-primary-500" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Custom colors toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="customColors"
              checked={useCustomColors}
              onChange={(e) => {
                setUseCustomColors(e.target.checked)
                if (e.target.checked) setSelectedPreset(null)
              }}
              className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
            />
            <label htmlFor="customColors" className="text-sm text-gray-700">
              Use custom colors
            </label>
          </div>

          {/* Custom color pickers */}
          {useCustomColors && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Primary Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Color Name (for AI prompts)
                </label>
                <input
                  type="text"
                  value={colorName}
                  onChange={(e) => setColorName(e.target.value)}
                  placeholder="e.g., vibrant blue"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
                />
              </div>
            </div>
          )}

          {/* Color preview */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-lg overflow-hidden border">
              <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-xs text-gray-600">
                <Sun className="w-3 h-3" /> Light Mode
              </div>
              <div 
                className="p-4 text-center"
                style={{ 
                  backgroundColor: adjustColorBrightness(primaryColor, 180),
                }}
              >
                <div 
                  className="w-10 h-10 rounded-full mx-auto mb-2"
                  style={{ backgroundColor: primaryColor }}
                >
                  <span className="text-white text-xs font-bold leading-10">{shortName}</span>
                </div>
                <p className="text-sm font-medium" style={{ color: primaryColor }}>
                  {displayName || 'Brand Name'}
                </p>
              </div>
            </div>
            <div className="rounded-lg overflow-hidden border">
              <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 text-xs text-gray-300">
                <Moon className="w-3 h-3" /> Dark Mode
              </div>
              <div 
                className="p-4 text-center"
                style={{ 
                  backgroundColor: adjustColorBrightness(primaryColor, -40),
                }}
              >
                <div 
                  className="w-10 h-10 rounded-full mx-auto mb-2"
                  style={{ backgroundColor: accentColor }}
                >
                  <span className="text-white text-xs font-bold leading-10">{shortName}</span>
                </div>
                <p className="text-sm font-medium text-white">
                  {displayName || 'Brand Name'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Schedule */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="text-center mb-6">
            <Clock className="w-12 h-12 text-primary-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Posting Schedule</h3>
            <p className="text-sm text-gray-500">Configure when this brand publishes content</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Schedule Offset (Hour)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={23}
                value={scheduleOffset}
                onChange={(e) => setScheduleOffset(parseInt(e.target.value))}
                className="flex-1"
              />
              <span className="w-16 text-center font-mono text-lg">{scheduleOffset}:00</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              First post of the day starts at this hour (relative to base schedule)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Posts Per Day
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={12}
                value={postsPerDay}
                onChange={(e) => setPostsPerDay(parseInt(e.target.value))}
                className="flex-1"
              />
              <span className="w-16 text-center font-mono text-lg">{postsPerDay}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Posts are evenly distributed throughout the day (every {Math.floor(24/postsPerDay)} hours)
            </p>
          </div>

          {/* Schedule preview */}
          <div className="bg-gray-50 rounded-lg p-4 mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Posting Times Preview</p>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: postsPerDay }, (_, i) => {
                const hour = (scheduleOffset + i * Math.floor(24/postsPerDay)) % 24
                const isLight = i % 2 === 0
                return (
                  <div
                    key={i}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                      isLight ? 'bg-amber-100 text-amber-800' : 'bg-gray-700 text-white'
                    }`}
                  >
                    {hour.toString().padStart(2, '0')}:00 {isLight ? '☀️' : '🌙'}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              ☀️ = Light mode posts, 🌙 = Dark mode posts
            </p>
          </div>
        </div>
      )}

      {/* Step 4: Social Handles */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="text-center mb-6">
            <Link2 className="w-12 h-12 text-primary-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Social Media Handles</h3>
            <p className="text-sm text-gray-500">Add your social media accounts (optional)</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                <Instagram className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">Instagram Handle</label>
                <input
                  type="text"
                  value={instagramHandle}
                  onChange={(e) => setInstagramHandle(e.target.value)}
                  placeholder="@yourbrand"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm mt-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                <Facebook className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">Facebook Page</label>
                <input
                  type="text"
                  value={facebookPage}
                  onChange={(e) => setFacebookPage(e.target.value)}
                  placeholder="Your Page Name"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm mt-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl">
              <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
                <Youtube className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">YouTube Channel</label>
                <input
                  type="text"
                  value={youtubeChannel}
                  onChange={(e) => setYoutubeChannel(e.target.value)}
                  placeholder="Your Channel Name"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm mt-1"
                />
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> API credentials (access tokens, page IDs) can be configured in the brand settings after creation.
            </p>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3 pt-4 border-t">
        {step > 1 ? (
          <button
            onClick={() => setStep(step - 1)}
            disabled={createBrandMutation.isPending}
            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
          >
            Back
          </button>
        ) : (
          <button
            onClick={onClose}
            disabled={createBrandMutation.isPending}
            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        {step < totalSteps ? (
          <button
            onClick={handleNext}
            disabled={step === 1 && !displayName}
            className="flex-1 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={createBrandMutation.isPending}
            className="flex-1 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {createBrandMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Create Brand
              </>
            )}
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
  
  // Store logos loaded from backend (keyed by brand id)
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({})
  
  // Fetch saved themes/logos for all brands on mount
  useEffect(() => {
    const fetchBrandThemes = async () => {
      const brands = brandsData?.brands || []
      const logos: Record<string, string> = {}
      
      for (const brand of brands) {
        try {
          const response = await fetch(`/api/brands/${brand.id}/theme`)
          if (response.ok) {
            const data = await response.json()
            if (data.theme?.logo) {
              // Check if logo file actually exists by trying to fetch it
              const logoUrl = `/brand-logos/${data.theme.logo}`
              const logoCheck = await fetch(logoUrl, { method: 'HEAD' })
              if (logoCheck.ok) {
                logos[brand.id] = logoUrl
              }
            }
          }
        } catch (error) {
          console.error(`Failed to fetch theme for ${brand.id}:`, error)
        }
      }
      
      setBrandLogos(logos)
    }
    
    if (brandsData?.brands?.length) {
      fetchBrandThemes()
    }
  }, [brandsData?.brands])
  
  // Function to refresh a single brand's logo
  const refreshBrandLogo = async (brandId: string) => {
    try {
      const response = await fetch(`/api/brands/${brandId}/theme`)
      if (response.ok) {
        const data = await response.json()
        if (data.theme?.logo) {
          const logoUrl = `/brand-logos/${data.theme.logo}?t=${Date.now()}` // Cache bust
          const logoCheck = await fetch(logoUrl, { method: 'HEAD' })
          if (logoCheck.ok) {
            setBrandLogos(prev => ({ ...prev, [brandId]: logoUrl }))
          }
        }
      }
    } catch (error) {
      console.error(`Failed to refresh logo for ${brandId}:`, error)
    }
  }

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
                        className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                        style={{ backgroundColor: brand.color }}
                      >
                        {brandLogos[brand.id] ? (
                          <img 
                            src={brandLogos[brand.id]} 
                            alt={brand.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <span className="text-lg font-bold text-white">
                            {brand.name.split(' ').map(w => w[0]).join('')}
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
        size="xl"
      >
        {selectedBrandForTheme && (
          <BrandThemeModal 
            brand={selectedBrandForTheme} 
            onClose={() => setSelectedBrandForTheme(null)}
            onSave={() => refreshBrandLogo(selectedBrandForTheme.id)}
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
