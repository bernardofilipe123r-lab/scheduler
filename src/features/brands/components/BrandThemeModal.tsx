import { useState, useEffect } from 'react'
import {
  Sun,
  Moon,
  Upload,
  X,
  Loader2,
  Save,
} from 'lucide-react'
import { useBrands } from '@/features/brands/api/use-brands'
import { apiClient } from '@/shared/api/client'
import { supabase } from '@/shared/api/supabase'
import {
  type BrandInfo,
  BRAND_THEMES,
} from '@/features/brands/constants'

export interface BrandThemeModalProps {
  brand: BrandInfo
  onClose: () => void
  onSave?: () => void
}

export function BrandThemeModal({ brand, onClose, onSave }: BrandThemeModalProps) {
  // Get theme from v2 API data, fall back to hardcoded BRAND_THEMES constants
  const { data: v2Brands } = useBrands()
  const v2Brand = v2Brands?.find(b => b.id === brand.id)
  
  // Build theme defaults: v2 API colors > hardcoded BRAND_THEMES > generic fallback
  const themeDefaults = (() => {
    const hardcoded = BRAND_THEMES[brand.id]
    const v2Colors = v2Brand?.colors
    return {
      brandColor: v2Colors?.primary ?? hardcoded?.brandColor ?? brand.color,
      lightTitleColor: v2Colors?.light_mode?.text ?? hardcoded?.lightTitleColor ?? '#000000',
      lightBgColor: v2Colors?.light_mode?.background ?? hardcoded?.lightBgColor ?? '#dcf6c8',
      darkTitleColor: v2Colors?.dark_mode?.text ?? hardcoded?.darkTitleColor ?? '#ffffff',
      darkBgColor: v2Colors?.dark_mode?.background ?? hardcoded?.darkBgColor ?? brand.color,
    }
  })()

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
        const data = await apiClient.get<{ has_overrides: boolean; theme: Record<string, string> }>(`/api/brands/${brand.id}/theme`)
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
      
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/brands/${brand.id}/theme`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
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
