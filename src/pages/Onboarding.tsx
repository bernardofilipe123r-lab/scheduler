/**
 * Onboarding Page — fullscreen wizard for new users.
 * Step 1: Create first brand (Identity)
 * Step 2: Brand Theme (colors + pixel-accurate preview)
 * Step 3: General Content DNA
 * Step 4: Reels Configuration
 * Step 5: Carousel Posts
 * Step 6: Connect Platforms (Meta credentials)
 */
import { useState, useEffect, useMemo } from 'react'
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
  Palette,
  Upload,
  X,
  Dna,
  PartyPopper,
  Link2,
  Instagram,
  Youtube,
  ChevronDown,
  ExternalLink,
  Type,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useOnboardingStatus } from '@/features/onboarding/use-onboarding-status'
import { useAuth } from '@/features/auth'
import {
  useBrands,
  useCreateBrand,
  useUpdateBrandCredentials,
  type CreateBrandInput,
  type BrandColors,
} from '@/features/brands/api/use-brands'
import {
  getRandomPresets,
  generateModeColors,
  adjustColorBrightness,
} from '@/features/brands/constants'
import { NicheConfigForm } from '@/features/brands/components/NicheConfigForm'
import { supabase } from '@/shared/api/supabase'
import { connectYouTube, connectInstagram, fetchBrandConnections } from '@/features/brands/api/connections-api'
import vaLogo from '@/assets/icons/va-logo.svg'

/* ── Proportional scale: 1080px canvas → 200px preview ────────── */
const CANVAS_W = 1080
const CANVAS_H = 1920
const PREVIEW_W = 200
const SC = PREVIEW_W / CANVAS_W
const PREVIEW_H = Math.round(CANVAS_H * SC)

const PX = {
  thumbTitleFont: Math.round(80 * SC),
  thumbSideMargin: Math.round(80 * SC),
  thumbLineSpacing: Math.round(20 * SC),
  thumbBrandFont: Math.max(6, Math.round(28 * SC)),
  thumbBrandGap: Math.round(254 * SC),
  barStartY: Math.round(280 * SC),
  barHeight: Math.round(100 * SC),
  hPadding: Math.round(20 * SC),
  barTitleFont: Math.round(56 * SC),
  titleContentGap: Math.round(70 * SC),
  contentSidePad: Math.round(108 * SC),
  contentFont: Math.round(44 * SC),
  contentLineH: Math.round(44 * 1.5 * SC),
  bulletSpacing: Math.round(44 * 0.6 * SC),
  brandFont: Math.max(4, Math.round(15 * SC)),
  brandBottom: Math.round(12 * SC),
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

const STEP_INFO = [
  { num: 1, label: 'Create your first brand', sub: 'A brand is an account associated with one or more social media platforms. Every user needs at least one.' },
  { num: 2, label: 'Brand Theme', sub: 'Choose your brand colors and preview how your content will look.' },
  { num: 3, label: 'General Content DNA', sub: 'Define your niche, audience, and content style so the AI understands your brand.' },
  { num: 4, label: 'Reels Configuration', sub: 'Set up your reel hooks, examples, and CTA style for short-form video content.' },
  { num: 5, label: 'Carousel Posts', sub: 'Configure your carousel post examples, CTAs, and citation style.' },
  { num: 6, label: 'Connect your platforms', sub: 'Link your Instagram and YouTube accounts so the app can publish content for you.' },
]

export function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { onboardingStep, hasBrand } = useOnboardingStatus()
  const { refreshUser } = useAuth()
  const { data: existingBrands } = useBrands()
  const createBrandMutation = useCreateBrand()
  const updateCredentialsMutation = useUpdateBrandCredentials()

  const [step, setStep] = useState<number>(() => {
    // If returning from OAuth redirect, jump straight to step 6
    const params = new URLSearchParams(window.location.search)
    if (params.has('ig_connected') || params.has('yt_connected') || params.has('ig_error')) {
      return 6
    }
    return onboardingStep
  })
  const [completing, setCompleting] = useState(false)

  // ── Step 1 state: Brand Identity + Colors ──
  const [displayName, setDisplayName] = useState('')
  const [brandId, setBrandId] = useState('')
  const [shortName, setShortName] = useState('')

  // Sync step and brandId if user already has a brand (e.g. returning mid-flow or after OAuth)
  useEffect(() => {
    if (hasBrand && step === 1) setStep(3)
    if (hasBrand && existingBrands?.length && !brandId) {
      setBrandId(existingBrands[0].id)
    }
  }, [hasBrand, step, existingBrands, brandId])
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const colorPresets = useMemo(() => getRandomPresets(12), [])
  const [selectedPreset, setSelectedPreset] = useState<number | null>(0)
  const [primaryColor, setPrimaryColor] = useState('')
  const [accentColor, setAccentColor] = useState('')
  const [colorName, setColorName] = useState('')
  const [useCustomColors, setUseCustomColors] = useState(false)
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light')
  const [previewTitle, setPreviewTitle] = useState(SAMPLE_TITLE)
  const [previewContent, setPreviewContent] = useState(SAMPLE_CONTENT.join('\n'))
  const [savingTheme, setSavingTheme] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Apply first random preset on mount
  useEffect(() => {
    if (colorPresets.length > 0 && !primaryColor) {
      setPrimaryColor(colorPresets[0].primary)
      setAccentColor(colorPresets[0].accent)
      setColorName(colorPresets[0].colorName)
    }
  }, [colorPresets]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 2: Theme preview computations ──
  const MAX_BULLET_POINTS = 6
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
    return previewContent.split('\n').filter(l => l.trim()).slice(0, MAX_BULLET_POINTS)
  }, [previewContent])

  const thumbnailTextColor = previewMode === 'light' ? primaryColor : '#ffffff'
  const contentTitleTextColor = '#ffffff'
  const contentTitleBgColor = primaryColor
  const contentTextColor = previewMode === 'light' ? '#000000' : '#ffffff'
  const brandNameColor = previewMode === 'light' ? primaryColor : '#ffffff'
  const contentStartY = PX.barStartY + titleLines.length * PX.barHeight + PX.titleContentGap

  // ── Step 6 state: Platform Connections (OAuth) ──
  const [igConnected, setIgConnected] = useState(false)
  const [igHandle, setIgHandle] = useState<string | null>(null)
  const [ytConnected, setYtConnected] = useState(false)
  const [ytChannelName, setYtChannelName] = useState<string | null>(null)
  const [connectingIg, setConnectingIg] = useState(false)
  const [connectingYt, setConnectingYt] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [showManualSection, setShowManualSection] = useState(false)
  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [facebookPageId, setFacebookPageId] = useState('')
  const [instagramBusinessAccountId, setInstagramBusinessAccountId] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [ytSectionValid, setYtSectionValid] = useState(false)

  // Check connection status when entering step 6 or returning from OAuth
  useEffect(() => {
    if (step !== 6 || !brandId) return
    const params = new URLSearchParams(window.location.search)
    const igSuccess = params.get('ig_connected')
    const ytSuccess = params.get('yt_connected')
    const igError = params.get('ig_error')

    // Clean up URL params
    if (igSuccess || ytSuccess || igError) {
      const url = new URL(window.location.href)
      url.searchParams.delete('ig_connected')
      url.searchParams.delete('yt_connected')
      url.searchParams.delete('ig_error')
      window.history.replaceState({}, '', url.pathname)
    }

    if (igError) {
      setConnectionError(`Instagram connection failed: ${igError}`)
    }
    if (igSuccess) {
      toast.success('Instagram connected!')
    }
    if (ytSuccess) {
      toast.success('YouTube connected!')
    }

    // Fetch actual connection status
    fetchBrandConnections().then((data) => {
      const brand = data.brands.find(b => b.brand === brandId)
      if (brand) {
        setIgConnected(brand.instagram.connected)
        setIgHandle(brand.instagram.account_name || null)
        setYtConnected(brand.youtube.connected)
        setYtChannelName(brand.youtube.account_name || null)
      }
    }).catch(() => {
      // Ignore — non-critical
    })
  }, [step, brandId]) // eslint-disable-line react-hooks/exhaustive-deps

  const isStep3Valid =
    metaAccessToken.trim().length > 0 &&
    (facebookPageId.trim().length > 0 || instagramBusinessAccountId.trim().length > 0)

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
    const preset = colorPresets[index]
    setSelectedPreset(index)
    setPrimaryColor(preset.primary)
    setAccentColor(preset.accent)
    setColorName(preset.colorName)
    setUseCustomColors(false)
  }

  const isStep1Valid =
    displayName.trim().length > 0 &&
    brandId.trim().length >= 3 &&
    /^[a-z0-9]+$/.test(brandId) &&
    shortName.trim().length > 0 &&
    !existingBrands?.some(b => b.id === brandId)

  const handleCreateBrand = async () => {
    setError(null)
    if (!displayName.trim()) { setError('Brand name is required'); return }
    if (!brandId.trim() || brandId.length < 3) { setError('Brand ID must be at least 3 characters'); return }
    if (!/^[a-z0-9]+$/.test(brandId)) { setError('Brand ID must be alphanumeric (lowercase)'); return }
    if (existingBrands?.some(b => b.id === brandId)) { setError('A brand with this ID already exists'); return }

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
      posts_per_day: 6,
      colors,
    }

    try {
      await createBrandMutation.mutateAsync(input)
      toast.success('Brand created!')
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create brand')
    }
  }

  const handleSaveTheme = async () => {
    setSavingTheme(true)
    setError(null)
    try {
      const modeColors = generateModeColors(primaryColor, accentColor)
      const colors: BrandColors = {
        primary: primaryColor,
        accent: accentColor,
        color_name: colorName,
        ...modeColors,
      }
      // Update brand colors
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v2/brands/${brandId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ colors }),
      })

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
          await fetch(`${import.meta.env.VITE_API_URL || ''}/api/brands/${brandId}/theme`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          })
        } catch {
          // Logo upload failed — can be added later
        }
      }

      toast.success('Theme saved!')
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save theme')
    } finally {
      setSavingTheme(false)
    }
  }

  const handleComplete = async () => {
    setCompleting(true)
    // Mark onboarding as completed in Supabase user metadata
    await supabase.auth.updateUser({ data: { onboarding_completed: true } })
    await refreshUser()
    await queryClient.invalidateQueries()
    // Brief success moment
    setTimeout(() => {
      navigate('/', { replace: true })
    }, 1500)
  }

  const handleCompleteWithCredentials = async () => {
    if (!isStep3Valid) {
      setError('Meta Access Token is required, plus at least one of Facebook Page ID or Instagram Business Account ID.')
      return
    }
    setError(null)

    try {
      await updateCredentialsMutation.mutateAsync({
        id: brandId,
        meta_access_token: metaAccessToken.trim(),
        ...(facebookPageId.trim() && { facebook_page_id: facebookPageId.trim() }),
        ...(instagramBusinessAccountId.trim() && { instagram_business_account_id: instagramBusinessAccountId.trim() }),
      })
      handleComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials')
    }
  }

  const handleConnectInstagram = async () => {
    setConnectingIg(true)
    setConnectionError(null)
    try {
      const authUrl = await connectInstagram(brandId, 'onboarding')
      window.location.href = authUrl
    } catch (err) {
      setConnectingIg(false)
      setConnectionError(err instanceof Error ? err.message : 'Failed to start Instagram connection')
    }
  }

  const handleConnectYouTube = async () => {
    setConnectingYt(true)
    setConnectionError(null)
    try {
      const authUrl = await connectYouTube(brandId, 'onboarding')
      window.location.href = authUrl
    } catch (err) {
      setConnectingYt(false)
      setConnectionError(err instanceof Error ? err.message : 'Failed to start YouTube connection')
    }
  }

  const currentStep = STEP_INFO[step - 1]

  // ── Completion screen ──
  if (completing) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 10, stiffness: 100, delay: 0.1 }}
            className="w-20 h-20 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-6"
          >
            <PartyPopper className="w-10 h-10 text-green-500" />
          </motion.div>
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">You're all set!</h1>
          <p className="mt-2 text-[14px] text-gray-400">Redirecting to your dashboard...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#fafafa] flex flex-col">
      {/* ── Sticky header ── */}
      <header className="flex-shrink-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200/60">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1 rounded-lg bg-gray-100 border border-gray-200">
              <img src={vaLogo} alt="Viral App" className="w-7 h-7" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-gray-900 tracking-tight">Let's get you set up</p>
              <p className="text-[12px] text-gray-400">Step {step} of {STEP_INFO.length}</p>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {STEP_INFO.map((_, i) => {
              const s = i + 1
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium transition-all ${
                    s < step ? 'bg-green-500 text-white' :
                    s === step ? 'bg-primary-500 text-white' :
                    'bg-gray-200 text-gray-400'
                  }`}>
                    {s < step ? <Check className="w-3 h-3" /> : s}
                  </div>
                  {s < STEP_INFO.length && (
                    <div className={`w-6 h-0.5 rounded-full transition-colors ${s < step ? 'bg-green-500' : 'bg-gray-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <AnimatePresence mode="wait">
            {/* ═══ Step 1: Brand Creation ═══ */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-7 h-7 text-primary-500" />
                  </div>
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">{currentStep.label}</h1>
                  <p className="mt-1.5 text-[14px] text-gray-400">{currentStep.sub}</p>
                </div>

                <div className="max-w-xl mx-auto space-y-6">
                  {/* Error banner */}
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                      <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {/* Brand Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Brand Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="e.g., THE FITNESS COLLEGE"
                      autoFocus
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 focus:outline-none text-[14px]"
                    />
                  </div>

                  {/* Brand ID + Short Name */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Brand ID <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={brandId}
                        onChange={(e) => setBrandId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                        placeholder="fitnesscollege"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 focus:outline-none text-[14px] font-mono"
                      />
                      <p className="text-xs text-gray-400 mt-1">Unique, ≥3 chars, alphanumeric</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Short Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={shortName}
                        onChange={(e) => setShortName(e.target.value.toUpperCase().substring(0, 4))}
                        placeholder="FCO"
                        maxLength={4}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 focus:outline-none text-[14px] font-mono uppercase"
                      />
                      <p className="text-xs text-gray-400 mt-1">Logo fallback (3-4 chars)</p>
                    </div>
                  </div>

                  {/* Live preview card */}
                  {displayName && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                        <span className="text-white font-bold text-lg">{shortName || '?'}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{displayName}</p>
                        <p className="text-xs text-gray-400 font-mono">{brandId || 'brand-id'}</p>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 text-center">
                    You'll configure colors, logo, and preview in the next step.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ═══ Step 2: Brand Theme ═══ */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
                    <Palette className="w-7 h-7 text-primary-500" />
                  </div>
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">{currentStep.label}</h1>
                  <p className="mt-1.5 text-[14px] text-gray-400">{currentStep.sub}</p>
                </div>

                {/* Error banner */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 mb-4 max-w-4xl mx-auto">
                    <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <div className="flex gap-6 max-w-4xl mx-auto">
                  {/* Left: Controls */}
                  <div className="flex-1 space-y-5 min-w-0">
                    {/* Mode toggle */}
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setPreviewMode('light')}
                        className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                          previewMode === 'light' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        ☀️ Light Mode
                      </button>
                      <button
                        onClick={() => setPreviewMode('dark')}
                        className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                          previewMode === 'dark' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        🌙 Dark Mode
                      </button>
                    </div>

                    {/* Preview text editing */}
                    <div className="space-y-3 p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-2 mb-1">
                        <Type className="w-4 h-4 text-gray-500" />
                        <label className="text-sm font-medium text-gray-700">Preview Text</label>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Preview Title</label>
                        <input type="text" value={previewTitle} onChange={(e) => setPreviewTitle(e.target.value.toUpperCase())} className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm uppercase" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Preview Content (one per line)</label>
                        <textarea value={previewContent} onChange={(e) => {
                          const lines = e.target.value.split('\n').filter(l => l.trim())
                          if (lines.length <= MAX_BULLET_POINTS) {
                            setPreviewContent(e.target.value)
                          } else {
                            const kept = e.target.value.split('\n').reduce<string[]>((acc, line) => {
                              const nonEmpty = acc.filter(l => l.trim()).length
                              if (!line.trim() || nonEmpty < MAX_BULLET_POINTS) acc.push(line)
                              return acc
                            }, [])
                            setPreviewContent(kept.join('\n'))
                          }
                        }} rows={3} placeholder="One line per row" className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm resize-none" />
                        <p className="text-[10px] text-gray-400 mt-0.5">One bullet point per line (max {MAX_BULLET_POINTS})</p>
                      </div>
                    </div>

                    {/* Abbreviation */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Abbreviation</label>
                      <input
                        type="text"
                        value={shortName}
                        onChange={(e) => setShortName(e.target.value.toUpperCase().substring(0, 5))}
                        maxLength={5}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 focus:outline-none text-[14px] font-mono uppercase"
                      />
                      <p className="text-xs text-gray-400 mt-1">Short code used on rendered posts & reels (max 5 chars).</p>
                    </div>

                    {/* Logo Upload */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
                      <div className="flex items-center gap-4">
                        {logoPreview ? (
                          <div className="relative">
                            <img src={logoPreview} alt="Logo preview" className="w-16 h-16 object-contain rounded-xl border border-gray-200 bg-white p-1" />
                            <button
                              onClick={() => { setLogoPreview(null); setLogoFile(null) }}
                              className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer group">
                            <input type="file" accept="image/*" onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                setLogoFile(file)
                                const reader = new FileReader()
                                reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
                                reader.readAsDataURL(file)
                              }
                            }} className="hidden" />
                            <div className="w-16 h-16 rounded-xl bg-gray-100 flex flex-col items-center justify-center group-hover:bg-gray-200 transition-colors border-2 border-dashed border-gray-300">
                              <Upload className="w-5 h-5 text-gray-400" />
                              <span className="text-[10px] text-gray-400 mt-1">Upload</span>
                            </div>
                          </label>
                        )}
                        <p className="text-xs text-gray-400">Logo is stored for branding but not rendered on reels/thumbnails.</p>
                      </div>
                    </div>

                    {/* Brand Color */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Brand Color</label>
                      <div className="flex items-center gap-3 mb-3">
                        <input type="color" value={primaryColor} onChange={(e) => { setPrimaryColor(e.target.value); setUseCustomColors(true); setSelectedPreset(null) }} className="w-10 h-10 rounded cursor-pointer border-0" />
                        <input type="text" value={primaryColor} onChange={(e) => { setPrimaryColor(e.target.value); setUseCustomColors(true); setSelectedPreset(null) }} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono w-28" />
                      </div>

                      {/* Color Presets */}
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {colorPresets.map((preset, index) => (
                          <button
                            key={preset.name}
                            onClick={() => applyPreset(index)}
                            className={`relative p-2 rounded-xl border-2 transition-all ${
                              selectedPreset === index && !useCustomColors
                                ? 'border-primary-500 ring-2 ring-primary-200'
                                : 'border-gray-100 hover:border-gray-200'
                            }`}
                            title={preset.name}
                          >
                            <div className="flex gap-1 justify-center">
                              <div className="w-5 h-5 rounded-full" style={{ backgroundColor: preset.primary }} />
                              <div className="w-5 h-5 rounded-full" style={{ backgroundColor: preset.accent }} />
                            </div>
                            <p className="text-[10px] text-gray-500 truncate mt-1 text-center">{preset.name}</p>
                            {selectedPreset === index && !useCustomColors && (
                              <Check className="absolute top-0.5 right-0.5 w-3.5 h-3.5 text-primary-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Pixel-Accurate Preview */}
                  <div className="flex-shrink-0">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              </motion.div>
            )}

            {/* ═══ Step 3: General Content DNA ═══ */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
                    <Dna className="w-7 h-7 text-primary-500" />
                  </div>
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">{currentStep.label}</h1>
                  <p className="mt-1.5 text-[14px] text-gray-400">{currentStep.sub}</p>
                </div>
                <NicheConfigForm section="general" />
              </motion.div>
            )}

            {/* ═══ Step 4: Reels Configuration ═══ */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
                    <Dna className="w-7 h-7 text-primary-500" />
                  </div>
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">{currentStep.label}</h1>
                  <p className="mt-1.5 text-[14px] text-gray-400">{currentStep.sub}</p>
                </div>
                <NicheConfigForm section="reels" onGeneratingChange={setAiGenerating} onYtValidChange={setYtSectionValid} />
              </motion.div>
            )}

            {/* ═══ Step 5: Carousel Posts ═══ */}
            {step === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
                    <Dna className="w-7 h-7 text-primary-500" />
                  </div>
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">{currentStep.label}</h1>
                  <p className="mt-1.5 text-[14px] text-gray-400">{currentStep.sub}</p>
                </div>
                <NicheConfigForm section="posts" onGeneratingChange={setAiGenerating} />
              </motion.div>
            )}

            {/* ═══ Step 6: Platform Connections (OAuth) ═══ */}
            {step === 6 && (
              <motion.div
                key="step6"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
                    <Link2 className="w-7 h-7 text-primary-500" />
                  </div>
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">{currentStep.label}</h1>
                  <p className="mt-1.5 text-[14px] text-gray-400">{currentStep.sub}</p>
                </div>

                <div className="max-w-xl mx-auto space-y-4">
                  {/* Error banner */}
                  {(error || connectionError) && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                      <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-700">{error || connectionError}</p>
                    </div>
                  )}

                  {/* ── Instagram Card ── */}
                  <div className={`border rounded-xl p-5 transition-colors ${igConnected ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                          <Instagram className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Instagram</p>
                          {igConnected ? (
                            <p className="text-xs text-green-600 font-medium">{igHandle || 'Connected'}</p>
                          ) : (
                            <p className="text-xs text-gray-400">Connect via Instagram Login</p>
                          )}
                        </div>
                      </div>
                      {igConnected ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                          <Check className="w-3.5 h-3.5" />
                          Connected
                        </div>
                      ) : (
                        <button
                          onClick={handleConnectInstagram}
                          disabled={connectingIg}
                          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {connectingIg ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="w-3.5 h-3.5" />
                          )}
                          Connect
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── YouTube Card ── */}
                  <div className={`border rounded-xl p-5 transition-colors ${ytConnected ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center">
                          <Youtube className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">YouTube</p>
                          {ytConnected ? (
                            <p className="text-xs text-green-600 font-medium">{ytChannelName || 'Connected'}</p>
                          ) : (
                            <p className="text-xs text-gray-400">Connect via Google OAuth</p>
                          )}
                        </div>
                      </div>
                      {ytConnected ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                          <Check className="w-3.5 h-3.5" />
                          Connected
                        </div>
                      ) : (
                        <button
                          onClick={handleConnectYouTube}
                          disabled={connectingYt}
                          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          {connectingYt ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="w-3.5 h-3.5" />
                          )}
                          Connect
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Connection summary */}
                  {(igConnected || ytConnected) && (
                    <p className="text-xs text-green-600 text-center font-medium">
                      {igConnected && ytConnected
                        ? 'Both platforms connected — you\'re all set!'
                        : igConnected
                          ? 'Instagram connected! You can add YouTube later from Settings.'
                          : 'YouTube connected! You can add Instagram later from Settings.'}
                    </p>
                  )}

                  {!igConnected && !ytConnected && (
                    <p className="text-xs text-gray-400 text-center">
                      Connect at least one platform, or skip and do it later from brand settings.
                    </p>
                  )}

                  {/* ── Advanced: Manual Credentials ── */}
                  <div className="pt-2">
                    <button
                      onClick={() => setShowManualSection(!showManualSection)}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mx-auto"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showManualSection ? 'rotate-180' : ''}`} />
                      Advanced: Enter credentials manually
                    </button>

                    {showManualSection && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4"
                      >
                        <p className="text-xs text-gray-500">
                          If you have a Meta Business account with a long-lived page token, enter it here instead.
                        </p>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Meta Access Token
                            <span className="text-gray-400 font-normal"> — long-lived page token</span>
                          </label>
                          <input
                            type="text"
                            value={metaAccessToken}
                            onChange={(e) => setMetaAccessToken(e.target.value)}
                            placeholder="EAAx..."
                            className="w-full px-3 py-2 rounded-lg text-sm font-mono border border-gray-300"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Facebook Page ID
                          </label>
                          <input
                            type="text"
                            value={facebookPageId}
                            onChange={(e) => setFacebookPageId(e.target.value)}
                            placeholder="e.g., 421725411022067"
                            className="w-full px-3 py-2 rounded-lg text-sm font-mono border border-gray-300"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Instagram Business Account ID
                          </label>
                          <input
                            type="text"
                            value={instagramBusinessAccountId}
                            onChange={(e) => setInstagramBusinessAccountId(e.target.value)}
                            placeholder="e.g., 17841468847801005"
                            className="w-full px-3 py-2 rounded-lg text-sm font-mono border border-gray-300"
                          />
                        </div>

                        {isStep3Valid && (
                          <button
                            onClick={handleCompleteWithCredentials}
                            disabled={completing || updateCredentialsMutation.isPending}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                          >
                            {(completing || updateCredentialsMutation.isPending) ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Check className="w-4 h-4" />
                                Save Credentials & Complete
                              </>
                            )}
                          </button>
                        )}
                      </motion.div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ── Sticky footer ── */}
      <footer className="flex-shrink-0 z-30 bg-white/80 backdrop-blur-md border-t border-gray-200/60">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          {step > 1 && !(step <= 2 && hasBrand) ? (
            <button
              onClick={() => { setError(null); setStep(step - 1) }}
              disabled={aiGenerating}
              className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <div />
          )}

          {step === 1 && (
            <button
              onClick={handleCreateBrand}
              disabled={!isStep1Valid || createBrandMutation.isPending}
              className="login-btn flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {createBrandMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}

          {step === 2 && (
            <button
              onClick={handleSaveTheme}
              disabled={savingTheme}
              className="login-btn flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingTheme ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}

          {step >= 3 && step <= 5 && (
            <button
              onClick={() => setStep(step + 1)}
              disabled={aiGenerating || (step === 4 && !ytSectionValid)}
              className="login-btn flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {aiGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Please wait...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}

          {step === 6 && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleComplete}
                disabled={completing || (!igConnected && !ytConnected)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
                  igConnected || ytConnected
                    ? 'bg-green-500 hover:bg-green-600 text-white shadow-sm'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {completing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Finishing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Complete Setup
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}
