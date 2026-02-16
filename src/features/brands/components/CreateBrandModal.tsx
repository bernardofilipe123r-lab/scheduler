import { useState, useEffect, useMemo } from 'react'
import {
  Palette,
  Check,
  Link2,
  Instagram,
  Facebook,
  Youtube,
  Sparkles,
  ArrowRight,
  Upload,
  X,
  Loader2,
  AlertCircle,
  Type,
} from 'lucide-react'
import { useBrands, useCreateBrand, type CreateBrandInput, type BrandColors } from '@/features/brands/api/use-brands'
import { apiClient } from '@/shared/api/client'
import { supabase } from '@/shared/api/supabase'
import {
  COLOR_PRESETS,
  generateModeColors,
  adjustColorBrightness,
} from '@/features/brands/constants'

export interface CreateBrandModalProps {
  onClose: () => void
  onSuccess?: () => void
}

/* ── Proportional scale: 1080px canvas → 240px preview ────────── */
const CANVAS_W = 1080
const CANVAS_H = 1920
const PREVIEW_W = 240
const S = PREVIEW_W / CANVAS_W
const PREVIEW_H = Math.round(CANVAS_H * S)

const PX = {
  thumbTitleFont: Math.round(80 * S),
  thumbSideMargin: Math.round(80 * S),
  thumbLineSpacing: Math.round(20 * S),
  thumbBrandFont: Math.max(6, Math.round(28 * S)),
  thumbBrandGap: Math.round(254 * S),
  barStartY: Math.round(280 * S),
  barHeight: Math.round(100 * S),
  hPadding: Math.round(20 * S),
  barTitleFont: Math.round(56 * S),
  titleContentGap: Math.round(70 * S),
  contentSidePad: Math.round(108 * S),
  contentFont: Math.round(44 * S),
  contentLineH: Math.round(44 * 1.5 * S),
  bulletSpacing: Math.round(44 * 0.6 * S),
  brandFont: Math.max(4, Math.round(15 * S)),
  brandBottom: Math.round(12 * S),
}

const DARK_BG =
  'linear-gradient(145deg, #1a3a2a 0%, #0d1f15 25%, #1a2030 50%, #2d1a0a 75%, #1a0a1a 100%)'

const SAMPLE_TITLE = 'SURPRISING TRUTHS ABOUT DETOXIFICATION'
const SAMPLE_CONTENT = [
  'Your liver does an incredible job filtering toxins',
  'Drinking more water supports natural detox',
  'Sleep is the most underrated detox mechanism',
]

function hexToRgba(hex: string, opacity: number): string {
  const h = hex.replace('#', '')
  if (h.length < 6) return `rgba(0,0,0,${opacity})`
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

export function CreateBrandModal({ onClose, onSuccess }: CreateBrandModalProps) {
  const createBrandMutation = useCreateBrand()
  const { data: existingBrands } = useBrands()

  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)

  // Step 1: Brand Identity
  const [displayName, setDisplayName] = useState('')
  const [brandId, setBrandId] = useState('')
  const [shortName, setShortName] = useState('')

  // Logo
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  // Step 2: Colors & Preview
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [primaryColor, setPrimaryColor] = useState('#6366f1')
  const [accentColor, setAccentColor] = useState('#818cf8')
  const [colorName, setColorName] = useState('indigo')
  const [useCustomColors, setUseCustomColors] = useState(false)
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light')
  const [previewTitle, setPreviewTitle] = useState(SAMPLE_TITLE)
  const [previewContent, setPreviewContent] = useState(SAMPLE_CONTENT.join('\n'))

  // Step 3: Platform credentials (all required)
  const [instagramHandle, setInstagramHandle] = useState('')
  const [facebookPageId, setFacebookPageId] = useState('')
  const [instagramBusinessAccountId, setInstagramBusinessAccountId] = useState('')
  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [step3Attempted, setStep3Attempted] = useState(false)

  // Pre-fill Meta token from existing brands
  useEffect(() => {
    const prefillToken = async () => {
      try {
        const data = await apiClient.get<{
          brands: Array<{
            meta_access_token?: string
            facebook_page_id?: string
            instagram_business_account_id?: string
          }>
        }>('/api/v2/brands/credentials')
        const existing = data.brands?.find(b => b.meta_access_token)
        if (existing?.meta_access_token) setMetaAccessToken(existing.meta_access_token)
      } catch { /* ignore — first brand or no creds */ }
    }
    prefillToken()
  }, [])

  // Title lines for preview (split into ~3 lines)
  const titleLines = useMemo(() => {
    const words = previewTitle.split(/\s+/).filter(Boolean)
    if (words.length <= 2) return [previewTitle]
    const third = Math.ceil(words.length / 3)
    return [
      words.slice(0, third).join(' '),
      words.slice(third, third * 2).join(' '),
      words.slice(third * 2).join(' '),
    ].filter(l => l.trim())
  }, [previewTitle])

  // Content lines for preview
  const contentLines = useMemo(() => {
    return previewContent.split('\n').filter(l => l.trim())
  }, [previewContent])

  // Preview colors derived from primaryColor
  const thumbnailTextColor = previewMode === 'light' ? primaryColor : '#ffffff'
  const contentTitleTextColor = '#ffffff'
  const contentTitleBgColor = primaryColor
  const contentTextColor = previewMode === 'light' ? '#000000' : '#ffffff'
  const brandNameColor = previewMode === 'light' ? primaryColor : '#ffffff'

  const contentStartY = PX.barStartY + titleLines.length * PX.barHeight + PX.titleContentGap

  // Auto-generate ID and short name from display name
  const handleNameChange = (name: string) => {
    setDisplayName(name)
    setError(null)
    const genId = name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
    setBrandId(genId)
    const words = name.split(/\s+/).filter(w => w.length > 0)
    let abbrev = ''
    if (words.length === 1) {
      abbrev = words[0].substring(0, 3).toUpperCase()
    } else {
      abbrev = words.map(w => w[0]).join('').substring(0, 4).toUpperCase()
    }
    setShortName(abbrev)
  }

  const applyPreset = (index: number) => {
    const preset = COLOR_PRESETS[index]
    setSelectedPreset(index)
    setPrimaryColor(preset.primary)
    setAccentColor(preset.accent)
    setColorName(preset.colorName)
    setUseCustomColors(false)
  }

  // Validation helpers
  const isStep1Valid =
    displayName.trim().length > 0 &&
    brandId.trim().length >= 3 &&
    /^[a-z0-9]+$/.test(brandId) &&
    shortName.trim().length > 0 &&
    !existingBrands?.some(b => b.id === brandId)

  const isStep3Valid =
    instagramHandle.trim().length > 0 &&
    facebookPageId.trim().length > 0 &&
    instagramBusinessAccountId.trim().length > 0 &&
    metaAccessToken.trim().length > 0

  const validateStep = (): boolean => {
    setError(null)
    if (step === 1) {
      if (!displayName.trim()) { setError('Brand name is required'); return false }
      if (!brandId.trim()) { setError('Brand ID is required'); return false }
      if (brandId.length < 3) { setError('Brand ID must be at least 3 characters'); return false }
      if (!/^[a-z0-9]+$/.test(brandId)) { setError('Brand ID must be alphanumeric (lowercase)'); return false }
      if (existingBrands?.some(b => b.id === brandId)) { setError('A brand with this ID already exists'); return false }
      if (!shortName.trim()) { setError('Short name is required'); return false }
    }
    if (step === 3) {
      if (!isStep3Valid) {
        setError('All platform fields are required')
        setStep3Attempted(true)
        return false
      }
    }
    return true
  }

  const handleNext = () => {
    if (validateStep()) setStep(step + 1)
  }

  const handleCreate = async () => {
    if (!validateStep()) return
    setError(null)

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
      posts_per_day: 2,
      colors,
      facebook_page_id: facebookPageId || undefined,
      instagram_business_account_id: instagramBusinessAccountId || undefined,
      meta_access_token: metaAccessToken || undefined,
    }

    try {
      await createBrandMutation.mutateAsync(input)

      if (logoFile) {
        try {
          const formData = new FormData()
          formData.append('logo', logoFile)
          formData.append('brand_color', primaryColor)
          formData.append('light_title_color', '#000000')
          formData.append('light_bg_color', adjustColorBrightness(primaryColor, 180))
          formData.append('dark_title_color', '#ffffff')
          formData.append('dark_bg_color', adjustColorBrightness(primaryColor, -40))
          const { data: sessionData } = await supabase.auth.getSession()
          const token = sessionData.session?.access_token
          await fetch(`${import.meta.env.VITE_API_URL || ''}/api/brands/${brandId}/theme`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          })
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

  const totalSteps = 3

  return (
    <div className="space-y-6">
      {/* Progress steps */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {[1, 2, 3].map(s => (
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
            {s < 3 && <div className={`w-8 h-0.5 ${s < step ? 'bg-green-500' : 'bg-gray-200'}`} />}
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

      {/* ═══ Step 1: Brand Identity ═══ */}
      {step === 1 && (
        <div className="max-w-xl mx-auto space-y-4">
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
              <p className="text-xs text-gray-500 mt-1">Unique identifier (≥3 chars, alphanumeric)</p>
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

      {/* ═══ Step 2: Colors — Two-column layout ═══ */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <Palette className="w-10 h-10 text-primary-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Brand Colors</h3>
            <p className="text-sm text-gray-500">Choose your brand's color scheme</p>
          </div>

          <div className="flex gap-6">
            {/* ── Left: Color Controls ── */}
            <div className="flex-1 space-y-4 min-w-0">
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
                        <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.primary }} />
                        <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.accent }} />
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

              {/* Preview text editing */}
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Type className="w-4 h-4 text-gray-500" />
                  <label className="text-sm font-medium text-gray-700">Preview Text</label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                  <input
                    type="text"
                    value={previewTitle}
                    onChange={(e) => setPreviewTitle(e.target.value.toUpperCase())}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Content Lines</label>
                  <textarea
                    value={previewContent}
                    onChange={(e) => setPreviewContent(e.target.value)}
                    rows={3}
                    placeholder="One line per row"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm resize-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">One bullet point per line</p>
                </div>
              </div>
            </div>

            {/* ── Right: Pixel-Accurate Preview ── */}
            <div className="flex-shrink-0">
              {/* Mode toggle */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-3">
                <button
                  onClick={() => setPreviewMode('light')}
                  className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                    previewMode === 'light'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  ☀️ Light
                </button>
                <button
                  onClick={() => setPreviewMode('dark')}
                  className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                    previewMode === 'dark'
                      ? 'bg-gray-800 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🌙 Dark
                </button>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                {/* ── Thumbnail Preview (9:16) ── */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Thumbnail</p>
                  <div
                    style={{
                      width: PREVIEW_W,
                      height: PREVIEW_H,
                      position: 'relative',
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: '1px solid #e5e7eb',
                      backgroundColor: previewMode === 'light' ? '#f4f4f4' : undefined,
                      background: previewMode === 'dark' ? DARK_BG : undefined,
                    }}
                  >
                    {previewMode === 'dark' && (
                      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1,
                      }}
                    >
                      <div
                        style={{
                          paddingLeft: PX.thumbSideMargin,
                          paddingRight: PX.thumbSideMargin,
                          textAlign: 'center',
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            fontFamily: "'Poppins', sans-serif",
                            fontWeight: 700,
                            fontSize: PX.thumbTitleFont,
                            lineHeight: `${PX.thumbTitleFont + PX.thumbLineSpacing}px`,
                            color: thumbnailTextColor,
                            textTransform: 'uppercase',
                            wordBreak: 'break-word',
                          }}
                        >
                          {previewTitle}
                        </div>
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            marginTop: PX.thumbBrandGap,
                            fontFamily: "'Poppins', sans-serif",
                            fontWeight: 700,
                            fontSize: PX.thumbBrandFont,
                            color: thumbnailTextColor,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {displayName || 'BRAND NAME'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Content Preview (9:16) ── */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Content</p>
                  <div
                    style={{
                      width: PREVIEW_W,
                      height: PREVIEW_H,
                      position: 'relative',
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: '1px solid #e5e7eb',
                      backgroundColor: previewMode === 'light' ? '#f4f4f4' : undefined,
                      background: previewMode === 'dark' ? DARK_BG : undefined,
                    }}
                  >
                    {previewMode === 'dark' && (
                      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)' }} />
                    )}
                    {/* Title bars */}
                    <div
                      style={{
                        position: 'absolute',
                        top: PX.barStartY,
                        left: 0,
                        right: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        zIndex: 1,
                      }}
                    >
                      {titleLines.map((line, i) => (
                        <div
                          key={i}
                          style={{
                            height: PX.barHeight,
                            paddingLeft: PX.hPadding,
                            paddingRight: PX.hPadding,
                            backgroundColor: hexToRgba(contentTitleBgColor, 200 / 255),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "'Poppins', sans-serif",
                              fontWeight: 700,
                              fontSize: PX.barTitleFont,
                              color: contentTitleTextColor,
                              textTransform: 'uppercase',
                              lineHeight: 1,
                            }}
                          >
                            {line}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Content lines */}
                    <div
                      style={{
                        position: 'absolute',
                        top: contentStartY,
                        left: PX.contentSidePad,
                        right: PX.contentSidePad,
                        zIndex: 1,
                      }}
                    >
                      {contentLines.map((line, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            gap: 3,
                            marginBottom: PX.bulletSpacing,
                            lineHeight: `${PX.contentLineH}px`,
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "'Inter', sans-serif",
                              fontWeight: 500,
                              fontSize: PX.contentFont,
                              color: contentTextColor,
                              flexShrink: 0,
                            }}
                          >
                            {i + 1}.
                          </span>
                          <span
                            style={{
                              fontFamily: "'Inter', sans-serif",
                              fontWeight: 500,
                              fontSize: PX.contentFont,
                              color: contentTextColor,
                            }}
                          >
                            {line}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Brand name — bottom center */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: PX.brandBottom,
                        left: 0,
                        right: 0,
                        textAlign: 'center',
                        zIndex: 1,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'Poppins', sans-serif",
                          fontWeight: 700,
                          fontSize: PX.brandFont,
                          color: brandNameColor,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                        }}
                      >
                        {displayName || 'BRAND NAME'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Step 3: Platform Connections ═══ */}
      {step === 3 && (
        <div className="max-w-xl mx-auto space-y-4">
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
                Instagram Handle <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={instagramHandle}
                onChange={(e) => setInstagramHandle(e.target.value)}
                placeholder="@yourbrand"
                className={`w-full px-3 py-2 rounded-lg text-sm border ${
                  step3Attempted && !instagramHandle.trim()
                    ? 'border-red-500'
                    : 'border-gray-300'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Facebook Page ID <span className="text-red-500">*</span>
                <span className="text-gray-400 font-normal"> — found in Page Settings → Transparency</span>
              </label>
              <input
                type="text"
                value={facebookPageId}
                onChange={(e) => setFacebookPageId(e.target.value)}
                placeholder="e.g., 421725411022067"
                className={`w-full px-3 py-2 rounded-lg text-sm font-mono border ${
                  step3Attempted && !facebookPageId.trim()
                    ? 'border-red-500'
                    : 'border-gray-300'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Instagram Business Account ID <span className="text-red-500">*</span>
                <span className="text-gray-400 font-normal"> — from Graph API Explorer</span>
              </label>
              <input
                type="text"
                value={instagramBusinessAccountId}
                onChange={(e) => setInstagramBusinessAccountId(e.target.value)}
                placeholder="e.g., 17841468847801005"
                className={`w-full px-3 py-2 rounded-lg text-sm font-mono border ${
                  step3Attempted && !instagramBusinessAccountId.trim()
                    ? 'border-red-500'
                    : 'border-gray-300'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Meta Access Token <span className="text-red-500">*</span>
                <span className="text-gray-400 font-normal"> — long-lived page token</span>
              </label>
              <input
                type="text"
                value={metaAccessToken}
                onChange={(e) => setMetaAccessToken(e.target.value)}
                placeholder="EAAx..."
                className={`w-full px-3 py-2 rounded-lg text-sm font-mono border ${
                  step3Attempted && !metaAccessToken.trim()
                    ? 'border-red-500'
                    : 'border-gray-300'
                }`}
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Shared across all brands — pre-filled from existing brands if available.
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
            disabled={step === 1 && !isStep1Valid}
            className="flex-1 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={!isStep3Valid || createBrandMutation.isPending}
            className="flex-1 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
