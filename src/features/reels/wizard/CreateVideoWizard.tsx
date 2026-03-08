import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Zap, Wrench, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDynamicBrands, useNicheConfig, useBrandConnections } from '@/features/brands'
import { useTobyBrandConfigs } from '@/features/toby'
import { useCreateJob } from '@/features/jobs'
import { useGenerateTextVideo } from '../api/use-text-video'
import { REEL_FORMATS } from '../formats'
import { ManualTextBased } from './ManualTextBased'
import { ManualTextVideo } from './ManualTextVideo'
import type { BrandName } from '@/shared/types'
import type { Platform } from '@/shared/constants/platforms'

import igIcon from '@/assets/icons/instagram.png'
import fbIcon from '@/assets/icons/facebook.png'
import ytIcon from '@/assets/icons/youtube.png'
import ttIcon from '@/assets/icons/tiktok.png'

// Preload icons
;[igIcon, fbIcon, ytIcon, ttIcon].forEach(src => { const i = new Image(); i.src = src })

const PLATFORM_DISPLAY: { id: Platform; label: string; icon: string; emoji: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: igIcon, emoji: '📸' },
  { id: 'facebook', label: 'Facebook', icon: fbIcon, emoji: '📘' },
  { id: 'youtube', label: 'YouTube', icon: ytIcon, emoji: '📺' },
  { id: 'threads', label: 'Threads', icon: '', emoji: '🧵' },
  { id: 'tiktok', label: 'TikTok', icon: ttIcon, emoji: '🎵' },
]

type WizardStep = 'brands' | 'platforms' | 'format' | 'mode' | 'manual'

interface CreateVideoWizardProps {
  onBack: () => void
}

export function CreateVideoWizard({ onBack }: CreateVideoWizardProps) {
  const navigate = useNavigate()

  // ── All hooks BEFORE any early return ──
  const { brands: dynamicBrands, brandIds, isLoading: brandsLoading } = useDynamicBrands()
  const { data: nicheConfig } = useNicheConfig()
  const { data: connectionsData } = useBrandConnections()
  const { data: brandConfigsData } = useTobyBrandConfigs()
  const createJob = useCreateJob()
  const generateTextVideo = useGenerateTextVideo()

  // Wizard state
  const [step, setStep] = useState<WizardStep>('brands')
  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([])
  const [allBrands, setAllBrands] = useState(true)
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([])
  const [selectedFormat, setSelectedFormat] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)

  const niche = nicheConfig?.niche_name || ''

  // ── Derived: available/connected platforms ──
  const getConnectedPlatforms = useCallback((): Platform[] => {
    if (!connectionsData?.brands) return ['instagram']
    const platforms = new Set<Platform>()
    const brandsToCheck = allBrands ? brandIds : selectedBrands
    for (const bc of connectionsData.brands) {
      if (!brandsToCheck.includes(bc.brand)) continue
      if (bc.instagram.connected) platforms.add('instagram')
      if (bc.facebook.connected) platforms.add('facebook')
      if (bc.youtube.connected) platforms.add('youtube')
      if (bc.threads.connected) platforms.add('threads')
      if (bc.tiktok?.connected) platforms.add('tiktok')
    }
    return platforms.size > 0 ? Array.from(platforms) : ['instagram']
  }, [connectionsData, allBrands, brandIds, selectedBrands])

  // Check if platform is enabled for selected brands via Toby brand config
  const isPlatformEnabled = useCallback((platform: Platform): boolean => {
    if (!brandConfigsData?.brands?.length) return true
    const brandsToCheck = allBrands ? brandIds : selectedBrands
    return brandsToCheck.some(brandId => {
      const cfg = brandConfigsData.brands.find((bc: { brand_id: string }) => bc.brand_id === brandId)
      if (!cfg?.enabled_platforms) return true
      const reelsPlatforms = cfg.enabled_platforms['reels']
      if (!reelsPlatforms) return true
      return reelsPlatforms.includes(platform)
    })
  }, [brandConfigsData, allBrands, brandIds, selectedBrands])

  // ── Step progression ──
  const stepIndex = { brands: 0, platforms: 1, format: 2, mode: 3, manual: 4 }
  const totalSteps = 4

  const effectiveBrands = allBrands ? brandIds : selectedBrands

  const goToPlatforms = () => {
    // Auto-select all connected & enabled platforms
    const connected = getConnectedPlatforms()
    const enabled = connected.filter(p => isPlatformEnabled(p))
    setSelectedPlatforms(enabled.length > 0 ? enabled : connected)
    setStep('platforms')
  }
  const goToFormat = () => setStep('format')
  const goToMode = (formatId: string) => {
    setSelectedFormat(formatId)
    setStep('mode')
  }

  const goBack = () => {
    if (step === 'platforms') setStep('brands')
    else if (step === 'format') setStep('platforms')
    else if (step === 'mode') setStep('format')
    else if (step === 'manual') setStep('mode')
    else onBack()
  }

  // ── Toggle helpers ──
  const toggleBrand = (id: BrandName) => {
    setAllBrands(false)
    setSelectedBrands(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    )
  }

  const selectAllBrands = () => {
    setAllBrands(true)
    setSelectedBrands([...brandIds])
  }

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms(prev => {
      if (prev.includes(p) && prev.length === 1) return prev
      return prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    })
  }

  // ── Reset wizard to beginning ──
  const resetWizard = useCallback(() => {
    setStep('brands')
    setSelectedBrands([])
    setAllBrands(true)
    setSelectedPlatforms([])
    setSelectedFormat('')
  }, [])

  // ── Auto-generate handler ──
  const handleAutoGenerate = async () => {
    const brands = effectiveBrands
    if (brands.length === 0) return

    setIsGenerating(true)
    try {
      if (selectedFormat === 'text_based') {
        const job = await createJob.mutateAsync({
          title: 'Auto-generating...',
          content_lines: [],
          brands,
          variant: 'dark',
          platforms: selectedPlatforms,
          music_source: 'trending_random',
        })
        toast.success(
          (t) => (
            <span className="cursor-pointer" onClick={() => { toast.dismiss(t.id); navigate(`/job/${job.id}`) }}>
              Text reel generating for {brands.length} brand{brands.length > 1 ? 's' : ''}! <u>View Job →</u>
            </span>
          ),
          { duration: 6000 }
        )
      } else if (selectedFormat === 'text_video') {
        if (!niche) {
          toast.error('Set up your Content DNA first (niche is required for auto mode)')
          setIsGenerating(false)
          return
        }
        const result = await generateTextVideo.mutateAsync({
          mode: 'full_auto',
          brands,
          platforms: selectedPlatforms,
          niche,
        })
        toast.success(
          (t) => (
            <span className="cursor-pointer" onClick={() => { toast.dismiss(t.id); navigate(`/job/${result.job_id}`) }}>
              Text-video generating for {brands.length} brand{brands.length > 1 ? 's' : ''}! <u>View Job →</u>
            </span>
          ),
          { duration: 6000 }
        )
      }
      resetWizard()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  // ── Loading state ──
  if (brandsLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  // ── Render ──
  return (
    <div className="max-w-2xl mx-auto">
      {/* Header with back + progress */}
      {step !== 'manual' && (
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i <= stepIndex[step]
                    ? 'w-6 bg-stone-800'
                    : 'w-1.5 bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── Step 1: Brands ─── */}
      {step === 'brands' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">Which brands?</h2>
            <p className="text-sm text-gray-500">Select the brands to create content for</p>
          </div>

          {/* All Brands toggle */}
          <button
            onClick={selectAllBrands}
            className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border-2 transition-all ${
              allBrands
                ? 'border-stone-800 bg-stone-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                allBrands ? 'bg-stone-800' : 'bg-gray-100'
              }`}>
                <Check className={`w-4 h-4 ${allBrands ? 'text-white' : 'text-gray-400'}`} />
              </div>
              <div className="text-left">
                <span className="text-sm font-semibold text-gray-900">All Brands</span>
                <p className="text-xs text-gray-500">{brandIds.length} brand{brandIds.length !== 1 ? 's' : ''} selected</p>
              </div>
            </div>
          </button>

          {/* Individual brands */}
          <div className="grid grid-cols-2 gap-2">
            {dynamicBrands.map(brand => {
              const active = allBrands || selectedBrands.includes(brand.id)
              return (
                <button
                  key={brand.id}
                  onClick={() => toggleBrand(brand.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                    active && !allBrands
                      ? 'border-stone-300 bg-stone-50'
                      : allBrands
                        ? 'border-gray-200 bg-gray-50 opacity-60'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  disabled={allBrands}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-offset-1"
                    style={{ backgroundColor: brand.color || '#999' }}
                  />
                  <span className="text-sm font-medium text-gray-800 truncate">{brand.label}</span>
                </button>
              )
            })}
          </div>

          {/* Continue */}
          <button
            onClick={goToPlatforms}
            disabled={!allBrands && selectedBrands.length === 0}
            className="w-full py-3.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Continue
          </button>
        </div>
      )}

      {/* ─── Step 2: Platforms ─── */}
      {step === 'platforms' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">Where to publish?</h2>
            <p className="text-sm text-gray-500">Choose your target platforms</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {PLATFORM_DISPLAY.map(({ id, label, icon, emoji }) => {
              const connected = getConnectedPlatforms().includes(id)
              const enabled = isPlatformEnabled(id)
              const available = connected && enabled
              const active = selectedPlatforms.includes(id)

              return (
                <button
                  key={id}
                  onClick={() => available && togglePlatform(id)}
                  disabled={!available}
                  className={`relative flex items-center gap-3 px-4 py-4 rounded-xl border-2 transition-all text-left ${
                    !available
                      ? 'border-gray-100 bg-gray-50/50 opacity-40 cursor-not-allowed'
                      : active
                        ? 'border-green-400 bg-green-50/50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  {icon ? (
                    <img src={icon} alt={label} className="w-7 h-7 object-contain" />
                  ) : (
                    <span className="text-2xl leading-none">{emoji}</span>
                  )}
                  <div>
                    <span className="text-sm font-semibold text-gray-800">{label}</span>
                    {!connected && (
                      <p className="text-[10px] text-gray-400">Not connected</p>
                    )}
                  </div>
                  {active && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <button
            onClick={goToFormat}
            disabled={selectedPlatforms.length === 0}
            className="w-full py-3.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Continue
          </button>
        </div>
      )}

      {/* ─── Step 3: Format ─── */}
      {step === 'format' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">What type of video?</h2>
            <p className="text-sm text-gray-500">Choose your content format</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {REEL_FORMATS.map(format => {
              const Icon = format.icon
              return (
                <button
                  key={format.id}
                  onClick={() => goToMode(format.id)}
                  className="flex items-center gap-4 px-5 py-5 rounded-xl border-2 border-gray-200 bg-white hover:border-stone-400 hover:bg-stone-50/50 transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center group-hover:bg-stone-200 transition-colors">
                    <Icon className="w-6 h-6 text-stone-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-900">{format.label}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{format.description}</p>
                  </div>
                  <ArrowLeft className="w-4 h-4 text-gray-300 rotate-180 group-hover:text-stone-500 transition-colors" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── Step 4: Mode ─── */}
      {step === 'mode' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">How do you want to create?</h2>
            <p className="text-sm text-gray-500">
              {effectiveBrands.length} brand{effectiveBrands.length !== 1 ? 's' : ''} · {selectedPlatforms.length} platform{selectedPlatforms.length !== 1 ? 's' : ''} · {REEL_FORMATS.find(f => f.id === selectedFormat)?.label}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* Auto */}
            {REEL_FORMATS.find(f => f.id === selectedFormat)?.supportsAuto && (
              <button
                onClick={handleAutoGenerate}
                disabled={isGenerating}
                className="relative flex items-center gap-4 px-5 py-5 rounded-xl border-2 border-stone-800 bg-stone-900 text-white hover:bg-stone-800 transition-all text-left group overflow-hidden"
              >
                {isGenerating && (
                  <div className="absolute inset-0 bg-stone-900/90 flex items-center justify-center z-10">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm font-medium">Creating your reel...</span>
                    </div>
                  </div>
                )}
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold">100% Automatic</span>
                  <p className="text-xs text-stone-300 mt-0.5">AI handles everything — content, images, and video creation</p>
                </div>
              </button>
            )}

            {/* Manual */}
            {REEL_FORMATS.find(f => f.id === selectedFormat)?.supportsManual && (
              <button
                onClick={() => setStep('manual')}
                disabled={isGenerating}
                className="flex items-center gap-4 px-5 py-5 rounded-xl border-2 border-gray-200 bg-white hover:border-stone-400 hover:bg-stone-50/50 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center group-hover:bg-stone-200 transition-colors">
                  <Wrench className="w-6 h-6 text-stone-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-900">Manual Control</span>
                  <p className="text-xs text-gray-500 mt-0.5">You provide the content, images, and details</p>
                </div>
                <ArrowLeft className="w-4 h-4 text-gray-300 rotate-180 group-hover:text-stone-500 transition-colors" />
              </button>
            )}
          </div>

          {/* Niche warning for auto mode */}
          {REEL_FORMATS.find(f => f.id === selectedFormat)?.requiresNiche && !niche && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
              ⚠️ Content DNA (niche) not configured — auto mode will use generic content. <span className="font-medium">Set it up in Brands → Content DNA</span>
            </p>
          )}
        </div>
      )}

      {/* ─── Step 5: Manual Panel ─── */}
      {step === 'manual' && (
        <ManualPanel
          formatId={selectedFormat}
          brands={effectiveBrands}
          platforms={selectedPlatforms}
          onBack={goBack}
          onComplete={resetWizard}
        />
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────
 * Manual Panel — routes to the correct format's manual form
 * ──────────────────────────────────────────────────── */
function ManualPanel({ formatId, brands, platforms, onBack, onComplete }: {
  formatId: string
  brands: BrandName[]
  platforms: string[]
  onBack: () => void
  onComplete: () => void
}) {
  const format = REEL_FORMATS.find(f => f.id === formatId)

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to modes
        </button>
        <span className="text-xs text-gray-400">
          {brands.length} brand{brands.length !== 1 ? 's' : ''} · {format?.label}
        </span>
      </div>

      {/* Format-specific form */}
      {formatId === 'text_based' && (
        <ManualTextBased brands={brands} platforms={platforms} onComplete={onComplete} />
      )}
      {formatId === 'text_video' && (
        <ManualTextVideo brands={brands} platforms={platforms} onComplete={onComplete} />
      )}
    </div>
  )
}
