/**
 * Onboarding Page — fullscreen wizard for new users.
 * Step 1: Create first brand (Identity + Colors)
 * Step 2: General Content DNA
 * Step 3: Reels Configuration
 * Step 4: Carousel Posts
 * Step 5: Connect Platforms (Meta credentials)
 */
import { useState, useEffect, useMemo } from 'react'
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
  Upload,
  X,
  Dna,
  PartyPopper,
  Link2,
  Facebook,
  Instagram,
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
import vaLogo from '@/assets/icons/va-logo.svg'

const STEP_INFO = [
  { num: 1, label: 'Create your first brand', sub: 'A brand is an account associated with one or more social media platforms. Every user needs at least one.' },
  { num: 2, label: 'General Content DNA', sub: 'Define your niche, audience, and content style so the AI understands your brand.' },
  { num: 3, label: 'Reels Configuration', sub: 'Set up your reel hooks, examples, and CTA style for short-form video content.' },
  { num: 4, label: 'Carousel Posts', sub: 'Configure your carousel post examples, CTAs, and citation style.' },
  { num: 5, label: 'Connect your platforms', sub: 'Link your Meta accounts so the app can publish content on your behalf.' },
]

export function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { onboardingStep, hasBrand } = useOnboardingStatus()
  const { refreshUser } = useAuth()
  const { data: existingBrands } = useBrands()
  const createBrandMutation = useCreateBrand()
  const updateCredentialsMutation = useUpdateBrandCredentials()

  const [step, setStep] = useState<number>(onboardingStep)
  const [completing, setCompleting] = useState(false)

  // Sync step if user already has a brand (e.g. returning mid-flow)
  useEffect(() => {
    if (hasBrand && step === 1) setStep(2)
  }, [hasBrand, step])

  // ── Step 1 state: Brand Identity + Colors ──
  const [displayName, setDisplayName] = useState('')
  const [brandId, setBrandId] = useState('')
  const [shortName, setShortName] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const colorPresets = useMemo(() => getRandomPresets(12), [])
  const [selectedPreset, setSelectedPreset] = useState<number | null>(0)
  const [primaryColor, setPrimaryColor] = useState('')
  const [accentColor, setAccentColor] = useState('')
  const [colorName, setColorName] = useState('')
  const [useCustomColors, setUseCustomColors] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Apply first random preset on mount
  useEffect(() => {
    if (colorPresets.length > 0 && !primaryColor) {
      setPrimaryColor(colorPresets[0].primary)
      setAccentColor(colorPresets[0].accent)
      setColorName(colorPresets[0].colorName)
    }
  }, [colorPresets]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 5 state: Platform Credentials ──
  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [facebookPageId, setFacebookPageId] = useState('')
  const [instagramBusinessAccountId, setInstagramBusinessAccountId] = useState('')
  const [step3Attempted, setStep3Attempted] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [ytSectionValid, setYtSectionValid] = useState(false)

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
          // Logo upload failed — can be added later
        }
      }

      toast.success('Brand created!')
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create brand')
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
    setStep3Attempted(true)
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

                  {/* Logo Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Brand Logo <span className="text-xs font-normal text-gray-400">(optional)</span></label>
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
                      <p className="text-xs text-gray-400">PNG or SVG. If no logo, <strong>{shortName || '???'}</strong> will be used.</p>
                    </div>
                  </div>

                  {/* Color Presets */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Brand Color</label>
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

                    {/* Custom toggle */}
                    <div className="flex items-center gap-2 mt-3">
                      <input
                        type="checkbox"
                        id="customColors"
                        checked={useCustomColors}
                        onChange={(e) => { setUseCustomColors(e.target.checked); if (e.target.checked) setSelectedPreset(null) }}
                        className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                      />
                      <label htmlFor="customColors" className="text-sm text-gray-600">Custom colors</label>
                    </div>
                    {useCustomColors && (
                      <div className="mt-3 grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Primary</label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-9 h-9 rounded cursor-pointer border-0" />
                            <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Accent</label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-9 h-9 rounded cursor-pointer border-0" />
                            <input type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Live preview card */}
                  {displayName && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" className="w-14 h-14 object-contain rounded-xl" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                          <span className="text-white font-bold text-lg">{shortName || '?'}</span>
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-900">{displayName}</p>
                        <p className="text-xs text-gray-400 font-mono">{brandId || 'brand-id'}</p>
                      </div>
                      <div className="ml-auto flex gap-1.5">
                        <div className="w-6 h-6 rounded-full border border-gray-200" style={{ backgroundColor: primaryColor }} />
                        <div className="w-6 h-6 rounded-full border border-gray-200" style={{ backgroundColor: accentColor }} />
                      </div>
                    </div>
                  )}

                  {/* Platform connection note */}
                  <p className="text-xs text-gray-400 text-center">
                    You'll connect your social media platforms in Step 5.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ═══ Step 2: General Content DNA ═══ */}
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
                    <Dna className="w-7 h-7 text-primary-500" />
                  </div>
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">{currentStep.label}</h1>
                  <p className="mt-1.5 text-[14px] text-gray-400">{currentStep.sub}</p>
                </div>
                <NicheConfigForm section="general" />
              </motion.div>
            )}

            {/* ═══ Step 3: Reels Configuration ═══ */}
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
                <NicheConfigForm section="reels" onGeneratingChange={setAiGenerating} onYtValidChange={setYtSectionValid} />
              </motion.div>
            )}

            {/* ═══ Step 4: Carousel Posts ═══ */}
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
                <NicheConfigForm section="posts" onGeneratingChange={setAiGenerating} />
              </motion.div>
            )}

            {/* ═══ Step 5: Platform Credentials ═══ */}
            {step === 5 && (
              <motion.div
                key="step5"
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

                <div className="max-w-xl mx-auto space-y-6">
                  {/* Error banner */}
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                      <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {/* Meta Section */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                        <Facebook className="w-4 h-4 text-white" />
                      </div>
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                        <Instagram className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-sm font-semibold text-gray-800">Meta (Instagram & Facebook)</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      One Meta access token works for both platforms. Provide at least one of Facebook Page ID or Instagram Business Account ID.
                    </p>

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
                        className={`w-full px-3 py-2 rounded-lg text-sm font-mono border ${step3Attempted && !metaAccessToken.trim() ? 'border-red-500' : 'border-gray-300'}`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Facebook Page ID
                        {!instagramBusinessAccountId.trim() && <span className="text-red-500"> *</span>}
                        <span className="text-gray-400 font-normal"> — found in Page Settings → Transparency</span>
                      </label>
                      <input
                        type="text"
                        value={facebookPageId}
                        onChange={(e) => setFacebookPageId(e.target.value)}
                        placeholder="e.g., 421725411022067"
                        className={`w-full px-3 py-2 rounded-lg text-sm font-mono border ${step3Attempted && !facebookPageId.trim() && !instagramBusinessAccountId.trim() ? 'border-red-500' : 'border-gray-300'}`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Instagram Business Account ID
                        {!facebookPageId.trim() && <span className="text-red-500"> *</span>}
                        <span className="text-gray-400 font-normal"> — from Graph API Explorer</span>
                      </label>
                      <input
                        type="text"
                        value={instagramBusinessAccountId}
                        onChange={(e) => setInstagramBusinessAccountId(e.target.value)}
                        placeholder="e.g., 17841468847801005"
                        className={`w-full px-3 py-2 rounded-lg text-sm font-mono border ${step3Attempted && !instagramBusinessAccountId.trim() && !facebookPageId.trim() ? 'border-red-500' : 'border-gray-300'}`}
                      />
                    </div>

                    {step3Attempted && !isStep3Valid && (
                      <p className="text-xs text-red-600">
                        Meta Access Token is required, plus at least one of Facebook Page ID or Instagram Business Account ID.
                      </p>
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
          {step > 1 ? (
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

          {step >= 2 && step <= 4 && (
            <button
              onClick={() => setStep(step + 1)}
              disabled={aiGenerating || (step === 3 && !ytSectionValid)}
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

          {step === 5 && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleComplete}
                disabled={completing || updateCredentialsMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Skip for now
              </button>
              <button
                onClick={handleCompleteWithCredentials}
                disabled={completing || updateCredentialsMutation.isPending || !isStep3Valid}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
                  isStep3Valid
                    ? 'bg-green-500 hover:bg-green-600 text-white shadow-sm'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {(completing || updateCredentialsMutation.isPending) ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
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
