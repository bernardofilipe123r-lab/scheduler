import { useState, useMemo, useEffect } from 'react'
import {
  Palette,
  Check,
  Clock,
  Link2,
  Instagram,
  Facebook,
  Youtube,
  Sparkles,
  Sun,
  Moon,
  ArrowRight,
  Upload,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { useBrands, useCreateBrand, type CreateBrandInput, type BrandColors } from '@/features/brands/api/use-brands'
import {
  BRAND_SCHEDULES,
  BRAND_THEMES,
  COLOR_PRESETS,
  generateModeColors,
  adjustColorBrightness,
} from '@/features/brands/constants'

export interface CreateBrandModalProps {
  onClose: () => void
  onSuccess?: () => void
}

export function CreateBrandModal({ onClose, onSuccess }: CreateBrandModalProps) {
  const createBrandMutation = useCreateBrand()
  const { data: existingBrands } = useBrands()
  
  // Compute smart default offset: +1 from the highest existing offset
  const defaultOffset = useMemo(() => {
    if (!existingBrands?.length) return 0
    // Also check hardcoded fallbacks for brands that haven't been migrated yet
    const maxOffset = existingBrands.reduce((max, b) => {
      const offset = b.schedule_offset ?? BRAND_SCHEDULES[b.id]?.offset ?? 0
      return Math.max(max, offset)
    }, -1)
    return (maxOffset + 1) % 24
  }, [existingBrands])
  
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
  
  // Step 3: Schedule - default offset is smart: +1 from last brand
  const [scheduleOffset, setScheduleOffset] = useState(defaultOffset)
  
  // Update default offset when data loads
  useEffect(() => {
    setScheduleOffset(defaultOffset)
  }, [defaultOffset])
  
  // Logo
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  // Step 4: Platform credentials (optional)
  const [instagramHandle, setInstagramHandle] = useState('')
  const [facebookPageId, setFacebookPageId] = useState('')
  const [instagramBusinessAccountId, setInstagramBusinessAccountId] = useState('')
  const [metaAccessToken, setMetaAccessToken] = useState('')

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
      schedule_offset: scheduleOffset,
      posts_per_day: 2,
      colors,
      // Platform credentials
      facebook_page_id: facebookPageId || undefined,
      instagram_business_account_id: instagramBusinessAccountId || undefined,
      meta_access_token: metaAccessToken || undefined,
    }
    
    try {
      await createBrandMutation.mutateAsync(input)

      // Upload logo if provided
      if (logoFile) {
        try {
          const formData = new FormData()
          formData.append('logo', logoFile)
          // Theme endpoint requires color fields too
          formData.append('brand_color', primaryColor)
          formData.append('light_title_color', '#000000')
          formData.append('light_bg_color', adjustColorBrightness(primaryColor, 180))
          formData.append('dark_title_color', '#ffffff')
          formData.append('dark_bg_color', adjustColorBrightness(primaryColor, -40))
          await fetch(`/api/brands/${brandId}/theme`, { method: 'POST', body: formData })
        } catch {
          console.warn('Logo upload failed — can be added later via theme editor')
        }
      }

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

          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Brand Logo</label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <div className="relative">
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-white p-1"
                  />
                  <button
                    onClick={() => { setLogoPreview(null); setLogoFile(null) }}
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
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setLogoFile(file)
                        const reader = new FileReader()
                        reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
                        reader.readAsDataURL(file)
                      }
                    }}
                    className="hidden"
                  />
                  <div className="w-16 h-16 rounded-lg bg-gray-100 flex flex-col items-center justify-center group-hover:bg-gray-200 transition-colors border-2 border-dashed border-gray-300">
                    <Upload className="w-5 h-5 text-gray-400" />
                    <span className="text-[10px] text-gray-400 mt-1">Upload</span>
                  </div>
                </label>
              )}
              <div className="flex-1">
                <p className="text-xs text-gray-500">
                  PNG or SVG recommended. Used on reels and thumbnails.
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  If no logo, the short name <strong>{shortName || '???'}</strong> will be used.
                </p>
              </div>
            </div>
          </div>

          {/* Preview */}
          {displayName && (
            <div className="bg-gray-100 rounded-xl p-4 text-center mt-4">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-16 h-16 object-contain mx-auto mb-2" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary-500 flex items-center justify-center mx-auto mb-2">
                  <span className="text-white font-bold text-xl">{shortName || '?'}</span>
                </div>
              )}
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

          {/* Color preview — Reel Mockups */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {/* Light Mode Reel */}
            <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              <div className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-xs text-gray-600 font-medium">
                <Sun className="w-3 h-3" /> Light Mode Reel
              </div>
              <div
                className="relative"
                style={{
                  aspectRatio: '9/16',
                  background: `linear-gradient(180deg, ${adjustColorBrightness(primaryColor, 180)} 0%, ${adjustColorBrightness(accentColor, 150)} 100%)`,
                }}
              >
                {/* Brand logo / abbreviation */}
                <div className="absolute top-3 left-0 right-0 flex justify-center">
                  {logoPreview ? (
                    <img src={logoPreview} alt="" className="h-4 object-contain opacity-70" />
                  ) : (
                    <span className="text-[10px] font-bold tracking-wider opacity-60" style={{ color: primaryColor }}>
                      {shortName || 'BRD'}
                    </span>
                  )}
                </div>
                {/* Title */}
                <div className="absolute top-7 left-3 right-3 flex justify-center">
                  <p className="text-[9px] font-black text-center leading-tight uppercase" style={{ color: '#000000' }}>
                    YOUR BRAIN HAS A CLEANING SYSTEM
                  </p>
                </div>
                {/* Content lines */}
                <div className="absolute top-[42%] left-2 right-2 space-y-1">
                  {['Sleep cycles — Reset every 90 minutes', 'Cold showers — Activate brown fat', 'Fasting — Triggers autophagy'].map((line, i) => (
                    <div
                      key={i}
                      className="rounded-md px-1.5 py-0.5"
                      style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}
                    >
                      <p className="text-[6px] font-medium" style={{ color: '#000000' }}>
                        {i + 1}. {line}
                      </p>
                    </div>
                  ))}
                </div>
                {/* CTA */}
                <div className="absolute bottom-3 left-3 right-3">
                  <div
                    className="rounded-md py-1 text-center"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <p className="text-[5px] font-bold text-white">Follow for more health tips!</p>
                  </div>
                </div>
              </div>
            </div>
            {/* Dark Mode Reel */}
            <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              <div className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 text-xs text-gray-300 font-medium">
                <Moon className="w-3 h-3" /> Dark Mode Reel
              </div>
              <div
                className="relative"
                style={{
                  aspectRatio: '9/16',
                  background: `linear-gradient(180deg, ${adjustColorBrightness(primaryColor, -40)} 0%, ${adjustColorBrightness(primaryColor, -20)} 100%)`,
                }}
              >
                {/* Brand logo / abbreviation */}
                <div className="absolute top-3 left-0 right-0 flex justify-center">
                  {logoPreview ? (
                    <img src={logoPreview} alt="" className="h-4 object-contain opacity-70" />
                  ) : (
                    <span className="text-[10px] font-bold tracking-wider opacity-60" style={{ color: accentColor }}>
                      {shortName || 'BRD'}
                    </span>
                  )}
                </div>
                {/* Title */}
                <div className="absolute top-7 left-3 right-3 flex justify-center">
                  <p className="text-[9px] font-black text-center leading-tight uppercase text-white">
                    YOUR BRAIN HAS A CLEANING SYSTEM
                  </p>
                </div>
                {/* Content lines */}
                <div className="absolute top-[42%] left-2 right-2 space-y-1">
                  {['Sleep cycles — Reset every 90 minutes', 'Cold showers — Activate brown fat', 'Fasting — Triggers autophagy'].map((line, i) => (
                    <div
                      key={i}
                      className="rounded-md px-1.5 py-0.5"
                      style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                    >
                      <p className="text-[6px] font-medium text-white">
                        {i + 1}. {line}
                      </p>
                    </div>
                  ))}
                </div>
                {/* CTA */}
                <div className="absolute bottom-3 left-3 right-3">
                  <div
                    className="rounded-md py-1 text-center"
                    style={{ backgroundColor: accentColor }}
                  >
                    <p className="text-[5px] font-bold text-white">Follow for more health tips!</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Schedule */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <Clock className="w-10 h-10 text-primary-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Publishing Schedule</h3>
            <p className="text-sm text-gray-500">Your brand's offset determines all posting times</p>
          </div>

          {/* Offset slider */}
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
              This offset shifts both reel and post times — choose a unique hour to avoid overlap
            </p>
            {/* Conflict warning */}
            {existingBrands?.some(b => (b.schedule_offset ?? BRAND_SCHEDULES[b.id]?.offset) === scheduleOffset) && (
              <div className="mt-2 flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg px-3 py-2 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  This offset is already used by <strong>{existingBrands.find(b => (b.schedule_offset ?? BRAND_SCHEDULES[b.id]?.offset) === scheduleOffset)?.display_name}</strong> — pick a different hour!
                </span>
              </div>
            )}
          </div>

          {/* Reels schedule — fixed, read-only */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-indigo-900">📹 Reels — 6 per day</p>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Fixed</span>
            </div>
            <p className="text-xs text-indigo-600 mb-3">Every 4 hours · alternating Light → Dark</p>
            <div className="flex flex-wrap gap-1.5">
              {[0, 4, 8, 12, 16, 20].map((baseHour, i) => {
                const hour = (baseHour + scheduleOffset) % 24
                const isLight = i % 2 === 0
                return (
                  <div
                    key={i}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                      isLight ? 'bg-amber-100 text-amber-800' : 'bg-gray-700 text-white'
                    }`}
                  >
                    {hour.toString().padStart(2, '0')}:00 {isLight ? '☀️' : '🌙'}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Posts schedule — fixed, read-only */}
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-purple-900">📄 Posts — 2 per day</p>
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Fixed</span>
            </div>
            <p className="text-xs text-purple-600 mb-3">Morning + Afternoon</p>
            <div className="flex flex-wrap gap-1.5">
              {[8, 14].map((baseHour, i) => {
                const hour = (baseHour + scheduleOffset) % 24
                return (
                  <div
                    key={i}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-purple-200 text-purple-800"
                  >
                    {hour.toString().padStart(2, '0')}:00 {i === 0 ? '🌅' : '☀️'}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Full schedule map — all brands */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-800 mb-3">🗺️ Full Schedule Map</p>
            <p className="text-xs text-gray-500 mb-3">All brands — no two should share the same offset</p>

            {/* 24-hour timeline header */}
            <div className="mb-1 flex">
              <div className="w-28 flex-shrink-0" />
              <div className="flex-1 flex">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="flex-1 text-center text-[9px] text-gray-400 font-mono">
                    {h}
                  </div>
                ))}
              </div>
            </div>

            {/* Existing brands */}
            {(existingBrands ?? []).map(brand => {
              const off = brand.schedule_offset ?? BRAND_SCHEDULES[brand.id]?.offset ?? 0
              const reelHours = [0, 4, 8, 12, 16, 20].map(h => (h + off) % 24)
              const postHours = [8, 14].map(h => (h + off) % 24)
              const bColor = BRAND_THEMES[brand.id]?.brandColor || brand.colors?.primary || '#6b7280'
              return (
                <div key={brand.id} className="flex items-center mb-1">
                  <div className="w-28 flex-shrink-0 flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: bColor }} />
                    <span className="text-xs text-gray-600 truncate">{brand.display_name || brand.id}</span>
                  </div>
                  <div className="flex-1 flex h-5 bg-gray-100 rounded-sm relative">
                    {Array.from({ length: 24 }, (_, h) => {
                      const isReel = reelHours.includes(h)
                      const isPost = postHours.includes(h)
                      return (
                        <div key={h} className="flex-1 relative border-r border-gray-200/50 last:border-r-0">
                          {isReel && (
                            <div
                              className="absolute inset-0.5 rounded-[2px]"
                              style={{ backgroundColor: bColor, opacity: 0.7 }}
                              title={`${brand.display_name} reel @ ${h}:00`}
                            />
                          )}
                          {isPost && (
                            <div
                              className="absolute inset-0.5 rounded-[2px] border-2"
                              style={{ borderColor: bColor, backgroundColor: 'white' }}
                              title={`${brand.display_name} post @ ${h}:00`}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* New brand (highlighted) */}
            <div className="flex items-center mb-1 mt-1">
              <div className="w-28 flex-shrink-0 flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-primary-400" style={{ backgroundColor: primaryColor }} />
                <span className="text-xs font-semibold text-primary-700 truncate">{displayName || 'New Brand'} ✨</span>
              </div>
              <div className="flex-1 flex h-5 bg-primary-50 rounded-sm ring-1 ring-primary-200 relative">
                {Array.from({ length: 24 }, (_, h) => {
                  const reelHours = [0, 4, 8, 12, 16, 20].map(bh => (bh + scheduleOffset) % 24)
                  const postHours = [8, 14].map(bh => (bh + scheduleOffset) % 24)
                  const isReel = reelHours.includes(h)
                  const isPost = postHours.includes(h)
                  return (
                    <div key={h} className="flex-1 relative border-r border-primary-100/50 last:border-r-0">
                      {isReel && (
                        <div
                          className="absolute inset-0.5 rounded-[2px]"
                          style={{ backgroundColor: primaryColor }}
                          title={`New brand reel @ ${h}:00`}
                        />
                      )}
                      {isPost && (
                        <div
                          className="absolute inset-0.5 rounded-[2px] border-2"
                          style={{ borderColor: primaryColor, backgroundColor: 'white' }}
                          title={`New brand post @ ${h}:00`}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 pt-2 border-t border-gray-200">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-3 h-3 rounded-[2px] bg-gray-400" />
                <span>Reel</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-3 h-3 rounded-[2px] border-2 border-gray-400 bg-white" />
                <span>Post</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="text-[10px]">☀️</span>
                <span>Light</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="text-[10px]">🌙</span>
                <span>Dark</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Platform Connections */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <Link2 className="w-12 h-12 text-primary-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Platform Connections</h3>
            <p className="text-sm text-gray-500">Connect your social accounts to enable auto-publishing</p>
          </div>

          {/* Meta (Instagram + Facebook) — shared token */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <Facebook className="w-4 h-4 text-white" />
              </div>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                <Instagram className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-800">Meta (Instagram & Facebook)</span>
            </div>
            <p className="text-xs text-gray-500 -mt-2">
              One Meta access token works for both platforms. The Page ID and IG Account ID are specific to this brand.
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Instagram Handle
              </label>
              <input
                type="text"
                value={instagramHandle}
                onChange={(e) => setInstagramHandle(e.target.value)}
                placeholder="@yourbrand"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Facebook Page ID <span className="text-gray-400 font-normal">— found in Page Settings → Transparency</span>
              </label>
              <input
                type="text"
                value={facebookPageId}
                onChange={(e) => setFacebookPageId(e.target.value)}
                placeholder="e.g., 421725411022067"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Instagram Business Account ID <span className="text-gray-400 font-normal">— from Graph API Explorer</span>
              </label>
              <input
                type="text"
                value={instagramBusinessAccountId}
                onChange={(e) => setInstagramBusinessAccountId(e.target.value)}
                placeholder="e.g., 17841468847801005"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Meta Access Token <span className="text-gray-400 font-normal">— long-lived page token</span>
              </label>
              <input
                type="password"
                value={metaAccessToken}
                onChange={(e) => setMetaAccessToken(e.target.value)}
                placeholder="EAAx..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Shared across all brands — only needed once. Leave blank if already set globally.
              </p>
            </div>
          </div>

          {/* YouTube */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center">
                <Youtube className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-800">YouTube</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              YouTube uses OAuth — connect after the brand is created from the Connected page.
            </p>
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg border border-gray-200">
              <AlertCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-600">Available after creation via Settings → Connected Accounts</span>
            </div>
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
