/**
 * Unified Content Creation Wizard
 *
 * Consolidates Reels, Posts, and Threads creation into a single flow:
 *   1. Content Type (reel / carousel / thread)
 *   2. Brand Selection
 *   3. Platforms (auto-filtered by content type; skipped for threads)
 *   4. Type-specific config (format for reels, image model for posts, format type for threads)
 *   5. Mode (auto / manual)
 *   6. Content Count (1-3 for reels/posts; 2-10 for threads)
 *   7. Manual form (if manual mode, delegates to existing components)
 */
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Check, Zap, Wrench, Loader2,
  Film, LayoutGrid, MessageSquare, Palette,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useDynamicBrands, useNicheConfig, useBrandConnections } from '@/features/brands'
import { useTobyBrandConfigs } from '@/features/toby'
import { useCreateJob } from '@/features/jobs'
import { useGenerateFormatB } from '@/features/reels/api/use-format-b'
import { FormatCarousel } from '@/features/reels/wizard/FormatCarousel'
import { ManualTextBased } from '@/features/reels/wizard/ManualTextBased'
import { ManualFormatB } from '@/features/reels/wizard/ManualFormatB'
import { DesignEditorTab } from '@/features/reels/DesignEditorTab'
import type { BrandName, Variant } from '@/shared/types'
import type { Platform, ContentType } from '@/shared/constants/platforms'
import { getPlatformsForContentType } from '@/shared/constants/platforms'

import igIcon from '@/assets/icons/instagram.png'
import fbIcon from '@/assets/icons/facebook.png'
import ytIcon from '@/assets/icons/youtube.png'
import ttIcon from '@/assets/icons/tiktok.png'

// Preload platform icons
;[igIcon, fbIcon, ytIcon, ttIcon].forEach(src => { const i = new Image(); i.src = src })

// ── Constants ───────────────────────────────────────────────────────────

const CONTENT_TYPES = [
  { id: 'reels' as ContentType, label: 'Video', sub: 'Reels & Shorts', icon: Film, gradient: 'from-violet-600 to-indigo-700' },
  { id: 'posts' as ContentType, label: 'Carousel', sub: 'Image posts', icon: LayoutGrid, gradient: 'from-amber-500 to-orange-600' },
  { id: 'threads' as ContentType, label: 'Thread', sub: 'Text posts', icon: MessageSquare, gradient: 'from-stone-700 to-stone-900' },
] as const

const PLATFORM_DISPLAY: { id: Platform; label: string; icon: string; emoji: string }[] = [
  { id: 'instagram', label: 'Instagram', icon: igIcon, emoji: '📸' },
  { id: 'facebook', label: 'Facebook', icon: fbIcon, emoji: '📘' },
  { id: 'youtube', label: 'YouTube', icon: ytIcon, emoji: '📺' },
  { id: 'threads', label: 'Threads', icon: '', emoji: '🧵' },
  { id: 'tiktok', label: 'TikTok', icon: ttIcon, emoji: '🎵' },
  { id: 'bluesky', label: 'Bluesky', icon: '', emoji: '🦋' },
]

const IMAGE_MODELS = [
  { id: 'freepik', label: 'Super Quality', sub: 'Freepik', badge: 'NEW', badgeColor: 'bg-emerald-500' },
  { id: 'ZImageTurbo_INT8', label: 'Quality', sub: 'ZImageTurbo', badge: null, badgeColor: '' },
  { id: 'Flux1schnell', label: 'Fast', sub: 'Flux Schnell', badge: null, badgeColor: '' },
  { id: 'searchapi', label: 'Web Based', sub: 'SearchApi (Web Images)', badge: 'NEW', badgeColor: 'bg-blue-500' },
]

const THREAD_FORMAT_TYPES = [
  { id: '', label: 'Auto Mix', sub: 'AI picks the best mix' },
  { id: 'value_list', label: 'Value List', sub: 'Numbered actionable tips' },
  { id: 'controversial', label: 'Controversial Take', sub: 'Strong polarizing opinion' },
  { id: 'myth_bust', label: 'Myth Buster', sub: 'Debunks common beliefs' },
  { id: 'question_hook', label: 'Question Hook', sub: 'Opens with a question' },
  { id: 'hot_take', label: 'Hot Take', sub: 'Short & punchy opinion' },
  { id: 'story_micro', label: 'Micro Story', sub: 'Mini narrative arc' },
]

// ── Types ────────────────────────────────────────────────────────────────

type WizardStep =
  | 'type'        // 1. content type
  | 'brands'      // 2. brand selection
  | 'platforms'   // 3. platform selection
  | 'config'      // 4. type-specific config (format / model / thread format)
  | 'mode'        // 5. auto vs manual
  | 'count'       // 6. content count per brand
  | 'manual'      // 7. manual creation form
  | 'design'      // design editor (side panel for reels)

// ── Wizard Component ────────────────────────────────────────────────────

export function CreationPage() {
  const navigate = useNavigate()

  // ── Hooks (ALL before any early return) ──
  const { brands: dynamicBrands, brandIds, isLoading: brandsLoading } = useDynamicBrands()
  const { data: nicheConfig } = useNicheConfig()
  const { data: connectionsData } = useBrandConnections()
  const { data: brandConfigsData } = useTobyBrandConfigs()
  const createJob = useCreateJob()
  const generateFormatB = useGenerateFormatB()

  // ── Wizard state ──
  const [step, setStep] = useState<WizardStep>('type')
  const [contentType, setContentType] = useState<ContentType | null>(null)
  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([])
  const [allBrands, setAllBrands] = useState(true)
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([])

  // Type-specific config
  const [selectedFormat, setSelectedFormat] = useState<string>('') // reel format (format_a / format_b)
  const [imageModel, setImageModel] = useState<string>('ZImageTurbo_INT8')
  const [threadFormatType, setThreadFormatType] = useState<string>('')
  const [threadMode, setThreadMode] = useState<'single' | 'chain'>('single')
  const [creationMode, setCreationMode] = useState<'auto' | 'manual'>('auto')

  // Content count
  const [contentCount, setContentCount] = useState(1)

  const niche = nicheConfig?.niche_name || ''
  const effectiveBrands = allBrands ? brandIds : selectedBrands

  // ── Derived: connected platforms filtered by content type ──
  const getConnectedPlatforms = useCallback((): Platform[] => {
    if (!connectionsData?.brands || !contentType) return ['instagram']
    const eligible = getPlatformsForContentType(contentType)
    const platforms = new Set<Platform>()
    const brandsToCheck = allBrands ? brandIds : selectedBrands
    for (const bc of connectionsData.brands) {
      if (!brandsToCheck.includes(bc.brand)) continue
      if (bc.instagram?.connected && eligible.includes('instagram')) platforms.add('instagram')
      if (bc.facebook?.connected && eligible.includes('facebook')) platforms.add('facebook')
      if (bc.youtube?.connected && eligible.includes('youtube')) platforms.add('youtube')
      if (bc.threads?.connected && eligible.includes('threads')) platforms.add('threads')
      if (bc.tiktok?.connected && eligible.includes('tiktok')) platforms.add('tiktok')
      if (bc.bluesky?.connected && eligible.includes('bluesky')) platforms.add('bluesky')
    }
    return platforms.size > 0 ? Array.from(platforms) : (eligible.length > 0 ? [eligible[0] as Platform] : ['instagram'])
  }, [connectionsData, allBrands, brandIds, selectedBrands, contentType])

  const isPlatformEnabled = useCallback((platform: Platform): boolean => {
    if (!brandConfigsData?.brands?.length || !contentType) return true
    const ctKey = contentType === 'posts' ? 'posts' : contentType === 'threads' ? 'threads' : 'reels'
    const brandsToCheck = allBrands ? brandIds : selectedBrands
    return brandsToCheck.some(brandId => {
      const cfg = brandConfigsData.brands.find((bc: { brand_id: string }) => bc.brand_id === brandId)
      if (!cfg?.enabled_platforms) return true
      const typePlatforms = cfg.enabled_platforms[ctKey]
      if (!typePlatforms) return true
      return typePlatforms.includes(platform)
    })
  }, [brandConfigsData, allBrands, brandIds, selectedBrands, contentType])

  // ── Step progression helpers ──
  const totalSteps = contentType === 'threads' ? 5 : 6 // threads skips platforms

  const goBack = () => {
    if (step === 'design') { setStep('config'); return }
    if (step === 'manual') { setStep('mode'); return }
    if (step === 'count') { setStep('mode'); return }
    if (step === 'mode') { setStep('config'); return }
    if (step === 'config') {
      setStep(contentType === 'threads' ? 'brands' : 'platforms')
      return
    }
    if (step === 'platforms') { setStep('brands'); return }
    if (step === 'brands') { setStep('type'); return }
    navigate('/')
  }

  const goToPlatforms = () => {
    if (contentType === 'threads') {
      // Threads auto-selects ['threads'] platform, skip to config
      setSelectedPlatforms(['threads'])
      setStep('config')
      return
    }
    const connected = getConnectedPlatforms()
    const enabled = connected.filter(p => isPlatformEnabled(p))
    setSelectedPlatforms(enabled.length > 0 ? enabled : connected)
    setStep('platforms')
  }

  // ── Brand toggle helpers ──
  const toggleBrand = (id: BrandName) => {
    if (allBrands) {
      setAllBrands(false)
      setSelectedBrands([id])
      return
    }
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

  // ── Reset wizard ──
  const resetWizard = useCallback(() => {
    setStep('type')
    setContentType(null)
    setSelectedBrands([])
    setAllBrands(true)
    setSelectedPlatforms([])
    setSelectedFormat('')
    setImageModel('ZImageTurbo_INT8')
    setThreadFormatType('')
    setThreadMode('single')
    setCreationMode('auto')
    setContentCount(1)
  }, [])

  // ── Generate handler ──
  const handleGenerate = async () => {
    const brands = effectiveBrands
    if (brands.length === 0) return

    try {
      if (contentType === 'reels') {
        if (selectedFormat === 'format_a') {
          await createJob.mutateAsync({
            title: 'Auto-generating...',
            content_lines: [],
            brands,
            variant: 'dark' as Variant,
            platforms: selectedPlatforms,
            music_source: 'trending_random',
            content_count: contentCount,
          })
        } else if (selectedFormat === 'format_b') {
          if (!niche) {
            toast.error('Set up your Content DNA first (niche is required for auto mode)')
            return
          }
          await generateFormatB.mutateAsync({
            mode: 'full_auto',
            brands,
            platforms: selectedPlatforms,
            niche,
          })
        }
      } else if (contentType === 'posts') {
        await createJob.mutateAsync({
          title: 'Auto-generated posts',
          content_lines: [],
          brands,
          variant: 'post' as Variant,
          image_model: imageModel,
          platforms: selectedPlatforms,
          content_count: contentCount,
        })
      } else if (contentType === 'threads') {
        await createJob.mutateAsync({
          title: 'Thread posts',
          content_lines: [],
          brands,
          variant: 'threads' as Variant,
          platforms: ['threads'],
          content_count: contentCount,
          ai_prompt: threadFormatType || undefined,
          cta_type: threadMode === 'chain' ? 'chain' : undefined,
        })
      }
      resetWizard()
      toast.success('Job created — generating in the background', { icon: '🚀' })
      navigate('/jobs')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed')
    }
  }

  const isGenerating = createJob.isPending || generateFormatB.isPending

  // ── Loading ──
  if (brandsLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  // ── Design Editor view ──
  if (step === 'design') {
    return (
      <div className="animate-in fade-in duration-300">
        <DesignEditorTab onBack={() => setStep('config')} />
      </div>
    )
  }

  // ── Manual form view ──
  if (step === 'manual') {
    return (
      <div className="max-w-2xl mx-auto space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="flex items-center justify-between">
          <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to modes
          </button>
          <span className="text-xs text-gray-400">
            {effectiveBrands.length} brand{effectiveBrands.length !== 1 ? 's' : ''}
          </span>
        </div>

        {contentType === 'reels' && selectedFormat === 'format_a' && (
          <ManualTextBased brands={effectiveBrands} platforms={selectedPlatforms} onComplete={() => { resetWizard(); navigate('/jobs') }} />
        )}
        {contentType === 'reels' && selectedFormat === 'format_b' && (
          <ManualFormatB brands={effectiveBrands} platforms={selectedPlatforms} onComplete={() => { resetWizard(); navigate('/jobs') }} />
        )}
        {contentType === 'posts' && (
          <PostsManualForm
            brands={effectiveBrands}
            platforms={selectedPlatforms}
            imageModel={imageModel}
            contentCount={contentCount}
            onComplete={() => { resetWizard(); navigate('/jobs') }}
          />
        )}
        {contentType === 'threads' && (
          <ThreadsManualForm
            brands={effectiveBrands}
            threadMode={threadMode}
            contentCount={contentCount}
            onComplete={() => { resetWizard(); navigate('/jobs') }}
          />
        )}
      </div>
    )
  }

  // ── Progress bar ──
  const progressIndex = (() => {
    if (step === 'type') return 0
    if (step === 'brands') return 1
    if (step === 'platforms') return 2
    if (step === 'config') return contentType === 'threads' ? 2 : 3
    if (step === 'mode') return contentType === 'threads' ? 3 : 4
    if (step === 'count') return contentType === 'threads' ? 4 : 5
    return 0
  })()

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header with back + progress */}
      <div className="flex items-center justify-between mb-8">
        <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i <= progressIndex ? 'w-6 bg-stone-800' : 'w-1.5 bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* ─── Step 1: Content Type ─── */}
      {step === 'type' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">What do you want to create?</h2>
            <p className="text-sm text-gray-500">Choose your content type</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {CONTENT_TYPES.map(ct => {
              const Icon = ct.icon
              return (
                <button
                  key={ct.id}
                  onClick={() => { setContentType(ct.id); setStep('brands') }}
                  className="group flex items-center gap-4 px-5 py-5 rounded-xl border-2 border-gray-200 bg-white hover:border-stone-400 hover:shadow-md transition-all text-left"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${ct.gradient} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-900">{ct.label}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{ct.sub}</p>
                  </div>
                  <ArrowLeft className="w-4 h-4 text-gray-300 rotate-180 group-hover:text-stone-500 transition-colors" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── Step 2: Brands ─── */}
      {step === 'brands' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">Which brands?</h2>
            <p className="text-sm text-gray-500">Select the brands to create content for</p>
          </div>

          <button
            onClick={selectAllBrands}
            className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border-2 transition-all ${
              allBrands ? 'border-stone-800 bg-stone-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${allBrands ? 'bg-stone-800' : 'bg-gray-100'}`}>
                <Check className={`w-4 h-4 ${allBrands ? 'text-white' : 'text-gray-400'}`} />
              </div>
              <div className="text-left">
                <span className="text-sm font-semibold text-gray-900">All Brands</span>
                <p className="text-xs text-gray-500">{brandIds.length} brand{brandIds.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            {allBrands && (
              <span className="text-xs font-semibold text-stone-600 bg-stone-200 px-2.5 py-1 rounded-full">
                {brandIds.length} selected
              </span>
            )}
          </button>

          <div className="grid grid-cols-2 gap-2">
            {dynamicBrands.map(brand => {
              const active = !allBrands && selectedBrands.includes(brand.id)
              const brandColor = brand.color || '#999'
              return (
                <button
                  key={brand.id}
                  onClick={() => toggleBrand(brand.id)}
                  className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    active ? 'bg-white shadow-sm' : allBrands ? 'border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-white' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  style={active ? { borderColor: brandColor } : undefined}
                >
                  <div
                    className={`w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center transition-all ${active ? 'scale-110' : ''}`}
                    style={{ backgroundColor: active ? brandColor : 'transparent', border: active ? 'none' : `2px solid ${brandColor}` }}
                  >
                    {active && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span className={`text-sm font-medium truncate transition-colors ${active ? 'text-gray-900' : 'text-gray-600'}`}>
                    {brand.label}
                  </span>
                </button>
              )
            })}
          </div>

          {!allBrands && selectedBrands.length > 0 && (
            <div className="flex items-center justify-center">
              <span className="text-xs font-semibold text-stone-600 bg-stone-100 px-3 py-1.5 rounded-full">
                {selectedBrands.length} brand{selectedBrands.length !== 1 ? 's' : ''} selected
              </span>
            </div>
          )}

          <button
            onClick={goToPlatforms}
            disabled={!allBrands && selectedBrands.length === 0}
            className="w-full py-3.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Continue
          </button>
        </div>
      )}

      {/* ─── Step 3: Platforms ─── */}
      {step === 'platforms' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">Where to publish?</h2>
            <p className="text-sm text-gray-500">Choose your target platforms</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {PLATFORM_DISPLAY.filter(p => getPlatformsForContentType(contentType!).includes(p.id)).map(({ id, label, icon, emoji }) => {
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
                    {!connected && <p className="text-[10px] text-gray-400">Not connected</p>}
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
            onClick={() => setStep('config')}
            disabled={selectedPlatforms.length === 0}
            className="w-full py-3.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Continue
          </button>
        </div>
      )}

      {/* ─── Step 4: Type-Specific Config ─── */}
      {step === 'config' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          {/* REELS: Format selection */}
          {contentType === 'reels' && (
            <>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold text-gray-900">What type of video?</h2>
                <p className="text-sm text-gray-500">Swipe to explore — tap to select</p>
              </div>
              <FormatCarousel onSelect={(formatId) => { setSelectedFormat(formatId); setStep('mode') }} />
              {/* Design Editor link */}
              <button
                onClick={() => setStep('design')}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-stone-500 hover:text-stone-700 transition-colors"
              >
                <Palette className="w-4 h-4" />
                Open Design Editor
              </button>
            </>
          )}

          {/* POSTS: Image model selection */}
          {contentType === 'posts' && (
            <>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold text-gray-900">AI Image Model</h2>
                <p className="text-sm text-gray-500">Choose the image generation engine</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {IMAGE_MODELS.map(opt => {
                  const active = imageModel === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setImageModel(opt.id)}
                      className={`relative flex flex-col items-center gap-1.5 px-4 py-4 rounded-xl border-2 transition-all ${
                        active ? 'border-stone-800 bg-stone-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      {opt.badge && (
                        <span className={`absolute top-2 right-2 text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full ${opt.badgeColor}`}>
                          {opt.badge}
                        </span>
                      )}
                      <span className="text-lg">
                        {opt.id === 'freepik' && '🎨'}
                        {opt.id === 'ZImageTurbo_INT8' && '✨'}
                        {opt.id === 'Flux1schnell' && '⚡'}
                        {opt.id === 'searchapi' && '🌐'}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{opt.label}</span>
                      <span className="text-[10px] text-gray-500">{opt.sub}</span>
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setStep('mode')}
                className="w-full py-3.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors text-sm"
              >
                Continue
              </button>
            </>
          )}

          {/* THREADS: Format type + mode selection */}
          {contentType === 'threads' && (
            <>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold text-gray-900">Thread Style</h2>
                <p className="text-sm text-gray-500">Choose format type and creation mode</p>
              </div>

              {/* Thread mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setThreadMode('single')}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    threadMode === 'single' ? 'border-stone-800 bg-stone-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Single Posts
                </button>
                <button
                  onClick={() => setThreadMode('chain')}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    threadMode === 'chain' ? 'border-stone-800 bg-stone-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Thread Chain
                </button>
              </div>

              {/* Format type grid */}
              {threadMode === 'single' && (
                <div className="grid grid-cols-2 gap-2">
                  {THREAD_FORMAT_TYPES.map(ft => {
                    const active = threadFormatType === ft.id
                    return (
                      <button
                        key={ft.id}
                        onClick={() => setThreadFormatType(ft.id)}
                        className={`flex flex-col items-start gap-0.5 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                          active ? 'border-stone-800 bg-stone-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <span className="text-sm font-semibold text-gray-900">{ft.label}</span>
                        <span className="text-[10px] text-gray-500">{ft.sub}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              <button
                onClick={() => setStep('mode')}
                className="w-full py-3.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors text-sm"
              >
                Continue
              </button>
            </>
          )}
        </div>
      )}

      {/* ─── Step 5: Mode (Auto vs Manual) ─── */}
      {step === 'mode' && (
        <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">How do you want to create?</h2>
            <p className="text-sm text-gray-500">
              {effectiveBrands.length} brand{effectiveBrands.length !== 1 ? 's' : ''}
              {contentType !== 'threads' && ` · ${selectedPlatforms.length} platform${selectedPlatforms.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* Auto */}
            <div className="space-y-2">
              <button
                onClick={() => { setCreationMode('auto'); setStep('count') }}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-stone-900 text-white font-semibold text-sm shadow-lg hover:bg-stone-800 active:scale-[0.98] transition-all"
              >
                <Zap className="w-5 h-5 text-amber-400" />
                100% Automatic
              </button>
              <p className="text-xs text-gray-400 text-center">
                {contentType === 'reels' && 'AI picks the topic, creates the video with music'}
                {contentType === 'posts' && 'AI generates unique posts for each brand'}
                {contentType === 'threads' && 'AI generates thread content using your Content DNA'}
              </p>
            </div>

            {/* Manual */}
            <div className="space-y-2">
              <button
                onClick={() => { setCreationMode('manual'); setStep('count') }}
                className="w-full flex items-center gap-4 px-5 py-5 rounded-xl border-2 border-gray-200 bg-white hover:border-stone-400 hover:bg-stone-50/50 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center group-hover:bg-stone-200 transition-colors">
                  <Wrench className="w-6 h-6 text-stone-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-900">Manual Control</span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {contentType === 'reels' && 'You write the text, pick variant and music'}
                    {contentType === 'posts' && 'You provide title, image prompt, and text'}
                    {contentType === 'threads' && 'You write the thread text yourself'}
                  </p>
                </div>
                <ArrowLeft className="w-4 h-4 text-gray-300 rotate-180 group-hover:text-stone-500 transition-colors" />
              </button>
            </div>
          </div>

          {/* Niche warning for auto mode */}
          {!niche && contentType !== 'posts' && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
              Content DNA not configured — auto mode will use generic content. Set it up in Brands → Content DNA
            </p>
          )}
        </div>
      )}

      {/* ─── Step 6: Content Count ─── */}
      {step === 'count' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">How many per brand?</h2>
            <p className="text-sm text-gray-500">
              {contentType === 'threads'
                ? `Generate multiple thread posts for each of ${effectiveBrands.length} brand${effectiveBrands.length !== 1 ? 's' : ''}`
                : `Create up to 3 unique ${contentType === 'reels' ? 'videos' : 'posts'} per brand`
              }
            </p>
          </div>

          <div className={`grid gap-3 ${contentType === 'threads' ? 'grid-cols-3' : 'grid-cols-3'}`}>
            {(contentType === 'threads'
              ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
              : [1, 2, 3]
            ).map(n => {
              const active = contentCount === n
              return (
                <button
                  key={n}
                  onClick={() => setContentCount(n)}
                  className={`py-4 rounded-xl border-2 text-center transition-all ${
                    active ? 'border-stone-800 bg-stone-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <span className={`text-lg font-bold ${active ? 'text-stone-900' : 'text-gray-600'}`}>{n}</span>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {n === 1 ? 'item' : 'items'}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="text-center text-xs text-gray-400">
            Total: {contentCount * effectiveBrands.length} {contentType === 'reels' ? 'video' : contentType === 'posts' ? 'post' : 'thread'}{contentCount * effectiveBrands.length !== 1 ? 's' : ''} across {effectiveBrands.length} brand{effectiveBrands.length !== 1 ? 's' : ''}
          </div>

          <button
            onClick={() => creationMode === 'manual' ? setStep('manual') : handleGenerate()}
            disabled={isGenerating}
            className="w-full py-3.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating job...
              </>
            ) : (
              creationMode === 'manual' ? 'Continue to Editor' : 'Generate'
            )}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Posts Manual Form ─────────────────────────────────────────────────────

function PostsManualForm({ brands, platforms, imageModel, contentCount, onComplete }: {
  brands: BrandName[]
  platforms: string[]
  imageModel: string
  contentCount: number
  onComplete: () => void
}) {
  const [title, setTitle] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const createJob = useCreateJob()

  const handleCreate = async () => {
    if (!title.trim()) { toast.error('Title is required'); return }
    setIsCreating(true)
    try {
      await createJob.mutateAsync({
        title: title.trim(),
        content_lines: [],
        brands,
        variant: 'post' as Variant,
        ai_prompt: aiPrompt.trim() || undefined,
        image_model: imageModel,
        platforms,
        fixed_title: true,
        content_count: contentCount,
      })
      toast.success('Job created — generating in the background', { icon: '🚀' })
      onComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Creation failed')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
        <textarea
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. 5 Morning Habits That Changed My Life"
          rows={2}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">AI Image Prompt (optional)</label>
        <textarea
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
          placeholder="Describe the image you want AI to generate..."
          rows={2}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent resize-none"
        />
      </div>
      <button
        onClick={handleCreate}
        disabled={isCreating || !title.trim()}
        className="w-full py-3.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm flex items-center justify-center gap-2"
      >
        {isCreating ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : 'Generate Posts'}
      </button>
    </div>
  )
}

// ── Threads Manual Form ──────────────────────────────────────────────────

function ThreadsManualForm({ brands, threadMode, contentCount, onComplete }: {
  brands: BrandName[]
  threadMode: 'single' | 'chain'
  contentCount: number
  onComplete: () => void
}) {
  const [text, setText] = useState('')
  const [chainParts, setChainParts] = useState<string[]>(['', ''])
  const [isCreating, setIsCreating] = useState(false)
  const createJob = useCreateJob()

  const addChainPart = () => {
    if (chainParts.length < 12) setChainParts(prev => [...prev, ''])
  }
  const removeChainPart = (idx: number) => {
    if (chainParts.length > 2) setChainParts(prev => prev.filter((_, i) => i !== idx))
  }
  const updateChainPart = (idx: number, val: string) => {
    setChainParts(prev => prev.map((p, i) => i === idx ? val : p))
  }

  const handleCreate = async () => {
    const contentLines = threadMode === 'chain'
      ? chainParts.filter(p => p.trim())
      : [text.trim()]
    if (contentLines.length === 0 || !contentLines[0]) {
      toast.error('Content is required')
      return
    }
    setIsCreating(true)
    try {
      await createJob.mutateAsync({
        title: contentLines[0].substring(0, 60) + (contentLines[0].length > 60 ? '...' : ''),
        content_lines: contentLines,
        brands,
        variant: 'threads' as Variant,
        platforms: ['threads'],
        fixed_title: true,
        content_count: contentCount,
        cta_type: threadMode === 'chain' ? 'chain' : undefined,
      })
      toast.success('Thread job created', { icon: '🧵' })
      onComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Creation failed')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-5">
      {threadMode === 'single' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Thread Post</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={500}
            placeholder="Write your thread post..."
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent resize-none"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{text.length}/500</p>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Thread Chain ({chainParts.length} parts)</label>
          {chainParts.map((part, idx) => (
            <div key={idx} className="relative">
              <textarea
                value={part}
                onChange={e => updateChainPart(idx, e.target.value)}
                maxLength={500}
                placeholder={idx === 0 ? 'Hook — grab attention' : idx === chainParts.length - 1 ? 'CTA — invite follows/replies' : `Part ${idx + 1}`}
                rows={2}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-stone-500 focus:border-transparent resize-none pr-16"
              />
              <div className="absolute top-2 right-2 flex items-center gap-1">
                <span className="text-[10px] text-gray-400">{part.length}/500</span>
                {chainParts.length > 2 && (
                  <button onClick={() => removeChainPart(idx)} className="text-gray-400 hover:text-red-500 text-xs px-1">x</button>
                )}
              </div>
            </div>
          ))}
          {chainParts.length < 12 && (
            <button onClick={addChainPart} className="text-sm text-stone-600 hover:text-stone-800 font-medium">
              + Add part
            </button>
          )}
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={isCreating}
        className="w-full py-3.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm flex items-center justify-center gap-2"
      >
        {isCreating ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : 'Create Thread'}
      </button>
    </div>
  )
}
