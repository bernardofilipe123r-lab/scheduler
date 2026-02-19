import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Palette,
  Check,
  Link2,
  Instagram,
  Facebook,
  Youtube,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Upload,
  X,
  Loader2,
  AlertCircle,
  Type,
  Layers,
  Dna,
  ClipboardList,
  Zap,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useBrands, useCreateBrand, type CreateBrandInput, type BrandColors } from '@/features/brands/api/use-brands'
import { apiClient } from '@/shared/api/client'
import { supabase } from '@/shared/api/supabase'
import {
  COLOR_PRESETS,
  generateModeColors,
  adjustColorBrightness,
} from '@/features/brands/constants'

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

const STEPS = [
  { num: 1, label: 'Identity', icon: Sparkles },
  { num: 2, label: 'Theme', icon: Palette },
  { num: 3, label: 'Content DNA', icon: Dna },
  { num: 4, label: 'Connections', icon: Link2 },
  { num: 5, label: 'Review', icon: ClipboardList },
]

interface TestResult {
  status: 'idle' | 'testing' | 'success' | 'error'
  message?: string
  details?: Record<string, unknown>
}

export function CreateBrandPage() {
  const navigate = useNavigate()
  const createBrandMutation = useCreateBrand()
  const { data: existingBrands } = useBrands()

  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)

  // Step 1: Brand Identity
  const [displayName, setDisplayName] = useState('')
  const [brandId, setBrandId] = useState('')
  const [shortName, setShortName] = useState('')
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

  // Step 3: Content DNA (basic fields — full config available after creation)
  const [nicheName, setNicheName] = useState('')
  const [contentBrief, setContentBrief] = useState('')
  const [targetAudience, setTargetAudience] = useState('')

  // Step 4: Platform credentials
  const [instagramHandle, setInstagramHandle] = useState('')
  const [facebookPageId, setFacebookPageId] = useState('')
  const [instagramBusinessAccountId, setInstagramBusinessAccountId] = useState('')
  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [step4Attempted, setStep4Attempted] = useState(false)
  const [metaTestResult, setMetaTestResult] = useState<TestResult>({ status: 'idle' })
  const [youtubeNote] = useState('YouTube uses OAuth — connect after brand creation from the Connections tab.')

  // Pre-fill Meta token from existing brands
  useEffect(() => {
    const prefillToken = async () => {
      try {
        const data = await apiClient.get<{
          brands: Array<{
            meta_access_token?: string
          }>
        }>('/api/v2/brands/credentials')
        const existing = data.brands?.find(b => b.meta_access_token)
        if (existing?.meta_access_token) setMetaAccessToken(existing.meta_access_token)
      } catch { /* ignore */ }
    }
    prefillToken()
  }, [])

  // Title lines for preview
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

  const contentLines = useMemo(() => {
    return previewContent.split('\n').filter(l => l.trim())
  }, [previewContent])

  // Preview colors
  const thumbnailTextColor = previewMode === 'light' ? primaryColor : '#ffffff'
  const contentTitleTextColor = '#ffffff'
  const contentTitleBgColor = primaryColor
  const contentTextColor = previewMode === 'light' ? '#000000' : '#ffffff'
  const brandNameColor = previewMode === 'light' ? primaryColor : '#ffffff'
  const contentStartY = PX.barStartY + titleLines.length * PX.barHeight + PX.titleContentGap

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

  // Validation
  const isStep1Valid =
    displayName.trim().length > 0 &&
    brandId.trim().length >= 3 &&
    /^[a-z0-9]+$/.test(brandId) &&
    shortName.trim().length > 0 &&
    !existingBrands?.some(b => b.id === brandId)

  const isStep4Valid =
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
    if (step === 4) {
      if (!isStep4Valid) {
        setError('All Meta platform fields are required')
        setStep4Attempted(true)
        return false
      }
    }
    return true
  }

  const handleNext = () => {
    if (validateStep()) setStep(step + 1)
  }

  const handleBack = () => {
    setError(null)
    setStep(step - 1)
  }

  // Test Meta connection
  const handleTestMeta = async () => {
    if (!facebookPageId || !instagramBusinessAccountId || !metaAccessToken) {
      setMetaTestResult({ status: 'error', message: 'Fill in all Meta fields first' })
      return
    }
    setMetaTestResult({ status: 'testing' })
    try {
      // We can't call the brand-specific endpoint yet (brand not created), so test the token directly
      const res = await fetch(
        `https://graph.facebook.com/v19.0/debug_token?input_token=${encodeURIComponent(metaAccessToken)}&access_token=${encodeURIComponent(metaAccessToken)}`
      )
      const data = await res.json()
      if (data.data?.is_valid) {
        // Also verify IG account access
        const igRes = await fetch(
          `https://graph.facebook.com/v19.0/${encodeURIComponent(instagramBusinessAccountId)}?fields=username&access_token=${encodeURIComponent(metaAccessToken)}`
        )
        const igData = await igRes.json()
        if (igData.error) {
          setMetaTestResult({ status: 'error', message: `Token valid but IG account error: ${igData.error.message}` })
        } else {
          setMetaTestResult({
            status: 'success',
            message: `Connected! IG: @${igData.username || instagramBusinessAccountId}`,
          })
        }
      } else {
        setMetaTestResult({ status: 'error', message: data.data?.error?.message || 'Token is invalid or expired' })
      }
    } catch (err) {
      setMetaTestResult({ status: 'error', message: err instanceof Error ? err.message : 'Connection test failed' })
    }
  }

  const handleCreate = async () => {
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

      // Upload logo if provided
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

      // Save Content DNA if provided
      if (nicheName || contentBrief || targetAudience) {
        try {
          await apiClient.put(`/api/v2/niche-config`, {
            brand_id: brandId,
            niche_name: nicheName || undefined,
            content_brief: contentBrief || undefined,
            target_audience: targetAudience || undefined,
          })
        } catch {
          console.warn('Content DNA save failed — can be configured later')
        }
      }

      toast.success(`Brand "${displayName}" created successfully!`)
      navigate('/brands')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create brand')
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Layers className="w-7 h-7 text-primary-500" />
            Create New Brand
          </h1>
          <p className="text-gray-500 mt-1">
            Set up a new brand with identity, theme, content DNA, and platform connections
          </p>
        </div>
        <button
          onClick={() => navigate('/brands')}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>

      {/* Step Progress Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const isActive = s.num === step
            const isComplete = s.num < step
            return (
              <div key={s.num} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => {
                    if (s.num < step) setStep(s.num)
                  }}
                  disabled={s.num > step}
                  className={`flex items-center gap-2 ${s.num < step ? 'cursor-pointer' : s.num === step ? 'cursor-default' : 'cursor-not-allowed'}`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-500 text-white'
                        : isComplete
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {isComplete ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={`text-sm font-medium hidden sm:inline ${isActive ? 'text-primary-600' : isComplete ? 'text-green-600' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-3 ${s.num < step ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ═══ Step 1: Brand Identity ═══ */}
      {step === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary-500" />
              Brand Identity
            </h2>
            <p className="text-sm text-gray-500 mt-1">Set up your brand name, ID, and logo</p>
          </div>

          <div className="px-6 py-6 max-w-xl mx-auto space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g., THE FITNESS COLLEGE"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
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
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm uppercase"
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
                  <p className="text-xs text-gray-500">PNG or SVG recommended. Used on reels and thumbnails.</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    If no logo, the short name <strong>{shortName || '???'}</strong> will be used.
                  </p>
                </div>
              </div>
            </div>

            {/* Identity Preview */}
            {displayName && (
              <div className="bg-gray-50 rounded-xl p-5 text-center">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-16 h-16 object-contain mx-auto mb-2" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-primary-500 flex items-center justify-center mx-auto mb-2">
                    <span className="text-white font-bold text-xl">{shortName || '?'}</span>
                  </div>
                )}
                <p className="font-semibold text-gray-900">{displayName}</p>
                <p className="text-sm text-gray-500 font-mono">{brandId || 'brand-id'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Step 2: Brand Theme / Colors ═══ */}
      {step === 2 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Palette className="w-5 h-5 text-primary-500" />
              Brand Theme
            </h2>
            <p className="text-sm text-gray-500 mt-1">Choose your brand colors and preview how content will look</p>
          </div>

          <div className="px-6 py-6">
            <div className="flex gap-6">
              {/* Left: Color Controls */}
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
                  <label htmlFor="customColors" className="text-sm text-gray-700">Use custom colors</label>
                </div>

                {useCustomColors && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Primary Color</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0" />
                          <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm font-mono" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Accent Color</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0" />
                          <input type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm font-mono" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Color Name (for AI prompts)</label>
                      <input type="text" value={colorName} onChange={(e) => setColorName(e.target.value)} placeholder="e.g., vibrant blue" className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm" />
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
                    <input type="text" value={previewTitle} onChange={(e) => setPreviewTitle(e.target.value.toUpperCase())} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm uppercase" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Content Lines</label>
                    <textarea value={previewContent} onChange={(e) => setPreviewContent(e.target.value)} rows={3} placeholder="One line per row" className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm resize-none" />
                    <p className="text-[10px] text-gray-400 mt-0.5">One bullet point per line</p>
                  </div>
                </div>
              </div>

              {/* Right: Pixel-Accurate Preview */}
              <div className="flex-shrink-0">
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-3">
                  <button
                    onClick={() => setPreviewMode('light')}
                    className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                      previewMode === 'light' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Light
                  </button>
                  <button
                    onClick={() => setPreviewMode('dark')}
                    className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                      previewMode === 'dark' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Dark
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Thumbnail Preview */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Thumbnail</p>
                    <div
                      style={{
                        width: PREVIEW_W, height: PREVIEW_H, position: 'relative', borderRadius: 8,
                        overflow: 'hidden', border: '1px solid #e5e7eb',
                        backgroundColor: previewMode === 'light' ? '#f4f4f4' : undefined,
                        background: previewMode === 'dark' ? DARK_BG : undefined,
                      }}
                    >
                      {previewMode === 'dark' && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />}
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                        <div style={{ paddingLeft: PX.thumbSideMargin, paddingRight: PX.thumbSideMargin, textAlign: 'center', position: 'relative' }}>
                          <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: PX.thumbTitleFont, lineHeight: `${PX.thumbTitleFont + PX.thumbLineSpacing}px`, color: thumbnailTextColor, textTransform: 'uppercase', wordBreak: 'break-word' }}>
                            {previewTitle}
                          </div>
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: PX.thumbBrandGap, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: PX.thumbBrandFont, color: thumbnailTextColor, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {displayName || 'BRAND NAME'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Content Preview */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Content</p>
                    <div
                      style={{
                        width: PREVIEW_W, height: PREVIEW_H, position: 'relative', borderRadius: 8,
                        overflow: 'hidden', border: '1px solid #e5e7eb',
                        backgroundColor: previewMode === 'light' ? '#f4f4f4' : undefined,
                        background: previewMode === 'dark' ? DARK_BG : undefined,
                      }}
                    >
                      {previewMode === 'dark' && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)' }} />}
                      <div style={{ position: 'absolute', top: PX.barStartY, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
                        {titleLines.map((line, i) => (
                          <div key={i} style={{ height: PX.barHeight, paddingLeft: PX.hPadding, paddingRight: PX.hPadding, backgroundColor: hexToRgba(contentTitleBgColor, 200 / 255), display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: PX.barTitleFont, color: contentTitleTextColor, textTransform: 'uppercase', lineHeight: 1 }}>{line}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ position: 'absolute', top: contentStartY, left: PX.contentSidePad, right: PX.contentSidePad, zIndex: 1 }}>
                        {contentLines.map((line, i) => (
                          <div key={i} style={{ display: 'flex', gap: 3, marginBottom: PX.bulletSpacing, lineHeight: `${PX.contentLineH}px` }}>
                            <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: PX.contentFont, color: contentTextColor, flexShrink: 0 }}>{i + 1}.</span>
                            <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: PX.contentFont, color: contentTextColor }}>{line}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ position: 'absolute', bottom: PX.brandBottom, left: 0, right: 0, textAlign: 'center', zIndex: 1 }}>
                        <span style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: PX.brandFont, color: brandNameColor, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          {displayName || 'BRAND NAME'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Step 3: Content DNA ═══ */}
      {step === 3 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Dna className="w-5 h-5 text-primary-500" />
              Content DNA
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Define what your AI-generated content is about. You can refine these settings in detail after creation.
            </p>
          </div>

          <div className="px-6 py-6 max-w-2xl mx-auto space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Niche Name</label>
              <input
                type="text"
                value={nicheName}
                onChange={(e) => setNicheName(e.target.value)}
                placeholder="e.g., Health & Wellness, Personal Finance, Fitness"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">A short label for your content niche</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g., Women 35+ interested in healthy aging and longevity"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">Who is your content for?</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content Brief</label>
              <textarea
                value={contentBrief}
                onChange={(e) => setContentBrief(e.target.value)}
                placeholder={`Describe your content strategy, topics, tone, and style...\n\nExample: Viral short-form content about personal finance for millennials. Topics include: budgeting tips, investing basics, debt payoff strategies, side hustles. Tone: friendly, approachable, no-nonsense. Target: U.S. adults aged 25-40.`}
                rows={8}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                This goes directly into every AI prompt. Be as detailed as you want — topics, tone, audience, philosophy.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium">These are optional during creation</p>
                  <p className="text-blue-600 mt-1">
                    You can skip this step and configure your full Content DNA later from the Brands → Content DNA tab,
                    including content examples, CTAs, hashtags, and AI understanding previews.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Step 4: Platform Connections ═══ */}
      {step === 4 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-primary-500" />
              Platform Connections
            </h2>
            <p className="text-sm text-gray-500 mt-1">Connect your social accounts to enable auto-publishing</p>
          </div>

          <div className="px-6 py-6 max-w-xl mx-auto space-y-5">
            {/* Meta Section */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                    <Facebook className="w-4 h-4 text-white" />
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                    <Instagram className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800">Meta (Instagram & Facebook)</span>
                </div>
              </div>
              <p className="text-xs text-gray-500">
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
                  className={`w-full px-3 py-2 rounded-lg text-sm border ${step4Attempted && !instagramHandle.trim() ? 'border-red-500' : 'border-gray-300'}`}
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
                  className={`w-full px-3 py-2 rounded-lg text-sm font-mono border ${step4Attempted && !facebookPageId.trim() ? 'border-red-500' : 'border-gray-300'}`}
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
                  className={`w-full px-3 py-2 rounded-lg text-sm font-mono border ${step4Attempted && !instagramBusinessAccountId.trim() ? 'border-red-500' : 'border-gray-300'}`}
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
                  className={`w-full px-3 py-2 rounded-lg text-sm font-mono border ${step4Attempted && !metaAccessToken.trim() ? 'border-red-500' : 'border-gray-300'}`}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Shared across all brands — pre-filled from existing brands if available.
                </p>
              </div>

              {/* Test Connection Button */}
              <div className="pt-2">
                <button
                  onClick={handleTestMeta}
                  disabled={metaTestResult.status === 'testing' || !metaAccessToken || !instagramBusinessAccountId}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                >
                  {metaTestResult.status === 'testing' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {metaTestResult.status === 'testing' ? 'Testing...' : 'Test Meta Connection'}
                </button>

                {metaTestResult.status === 'success' && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    {metaTestResult.message}
                  </div>
                )}
                {metaTestResult.status === 'error' && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <XCircle className="w-4 h-4 flex-shrink-0" />
                    {metaTestResult.message}
                  </div>
                )}
              </div>
            </div>

            {/* YouTube */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center">
                  <Youtube className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-semibold text-gray-800">YouTube</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{youtubeNote}</p>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg border border-gray-200">
                <AlertCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-600">Available after creation via Brands → Connections tab</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Step 5: Review ═══ */}
      {step === 5 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary-500" />
                Review & Create
              </h2>
              <p className="text-sm text-gray-500 mt-1">Review your brand configuration before creating</p>
            </div>

            <div className="px-6 py-6 space-y-6">
              {/* Identity */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary-500" />
                  Identity
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-4">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="w-14 h-14 object-contain rounded-lg border border-gray-200 bg-white p-1" />
                  ) : (
                    <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                      <span className="text-white font-bold text-lg">{shortName}</span>
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-gray-900">{displayName}</p>
                    <p className="text-sm text-gray-500 font-mono">{brandId}</p>
                  </div>
                </div>
              </div>

              {/* Theme */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-primary-500" />
                  Theme
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-4">
                  <div className="flex gap-2">
                    <div className="w-10 h-10 rounded-lg border border-gray-200" style={{ backgroundColor: primaryColor }} />
                    <div className="w-10 h-10 rounded-lg border border-gray-200" style={{ backgroundColor: accentColor }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{colorName}</p>
                    <p className="text-xs text-gray-500">{primaryColor} / {accentColor}</p>
                  </div>
                </div>
              </div>

              {/* Content DNA */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Dna className="w-4 h-4 text-primary-500" />
                  Content DNA
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  {nicheName || contentBrief || targetAudience ? (
                    <div className="space-y-2 text-sm">
                      {nicheName && <p><span className="font-medium text-gray-700">Niche:</span> <span className="text-gray-600">{nicheName}</span></p>}
                      {targetAudience && <p><span className="font-medium text-gray-700">Audience:</span> <span className="text-gray-600">{targetAudience}</span></p>}
                      {contentBrief && <p className="text-gray-600 mt-1 line-clamp-3">{contentBrief}</p>}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Not configured — can be set up later from Content DNA tab</p>
                  )}
                </div>
              </div>

              {/* Connections */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary-500" />
                  Platform Connections
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                      <Instagram className="w-4 h-4 text-white" />
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Instagram:</span>{' '}
                      <span className="text-gray-600">{instagramHandle || 'Not set'}</span>
                    </div>
                    {instagramHandle && <Check className="w-4 h-4 text-green-500 ml-auto" />}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                      <Facebook className="w-4 h-4 text-white" />
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Facebook:</span>{' '}
                      <span className="text-gray-600">{facebookPageId ? `Page ${facebookPageId}` : 'Not set'}</span>
                    </div>
                    {facebookPageId && <Check className="w-4 h-4 text-green-500 ml-auto" />}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center">
                      <Youtube className="w-4 h-4 text-white" />
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">YouTube:</span>{' '}
                      <span className="text-gray-400">Connect after creation</span>
                    </div>
                  </div>
                  {metaAccessToken && (
                    <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                      <Check className="w-3 h-3" />
                      Meta access token configured
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-4 flex gap-3">
        {step > 1 ? (
          <button
            onClick={handleBack}
            disabled={createBrandMutation.isPending}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        ) : (
          <button
            onClick={() => navigate('/brands')}
            disabled={createBrandMutation.isPending}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        {step < 5 ? (
          <button
            onClick={handleNext}
            disabled={step === 1 && !isStep1Valid}
            className="flex-1 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={!isStep4Valid || createBrandMutation.isPending}
            className="flex-1 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
