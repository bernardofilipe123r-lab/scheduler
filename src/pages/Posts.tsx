/**
 * Posts page — wizard-based workflow for creating carousel / image posts.
 *
 * 5-step wizard:
 *  1. Select brands (multi-select, same pattern as Reels)
 *  2. Choose platforms (Instagram, Threads)
 *  3. Pick AI image model (Freepik / ZImageTurbo / Flux Schnell / SearchApi)
 *  4. Choose mode (Auto / Manual)
 *  5. Manual create form (title, AI prompt, layout settings, preview)
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  FileImage,
  Loader2,
  Wand2,
  Check,
  Settings2,
  ChevronDown,
  Save,
  RotateCcw,
  ArrowLeft,
  Zap,
  Wrench,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useCreateJob } from '@/features/jobs'
import { useQueryClient } from '@tanstack/react-query'
import { useDynamicBrands, useBrandConnections } from '@/features/brands'
import { useTobyBrandConfigs } from '@/features/toby'
import { PostsSkeleton } from '@/shared/components'
import {
  DEFAULT_GENERAL_SETTINGS,
  SLIDE_FONT_OPTIONS,
  loadGeneralSettings,
  saveGeneralSettings,
  PostCanvas,
  autoFitFontSize,
  CANVAS_WIDTH,
} from '@/shared/components/PostCanvas'
import type { GeneralSettings, LayoutConfig } from '@/shared/components/PostCanvas'
import { useLayoutSettings, useUpdateLayoutSettings } from '@/shared/api/use-layout-settings'
import type { BrandName } from '@/shared/types'
import igIcon from '@/assets/icons/instagram.png'

// Preload platform icons
;[igIcon].forEach(src => { const i = new Image(); i.src = src })

type PostPlatform = 'instagram' | 'threads'

function ThreadsLogo({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.29 3.276-.866 1.074-2.063 1.678-3.559 1.795-1.12.088-2.198-.154-3.04-.682-1.003-.63-1.607-1.593-1.7-2.716-.154-1.836 1.201-3.454 3.742-3.652.97-.076 1.867-.034 2.687.097-.065-.666-.217-1.195-.463-1.582-.396-.623-1.078-.948-2.022-.966-1.32.012-2.085.437-2.344.696l-1.386-1.57C7.57 6.573 9.003 5.88 11.068 5.862c1.47.013 2.65.497 3.508 1.44.78.857 1.234 2.017 1.35 3.453.478.18.916.404 1.31.675 1.191.818 2.065 2.03 2.52 3.502.628 2.028.478 4.537-1.36 6.336C16.65 22.97 14.59 23.975 12.186 24zm-1.638-7.283c-.078.003-.155.008-.232.015-1.26.098-1.905.701-1.862 1.22.02.233.156.567.589.838.49.308 1.14.446 1.833.388 1.116-.087 2.472-.633 2.716-3.136-.741-.142-1.544-.2-2.41-.2-.216 0-.43.006-.634.017v-.142z" />
    </svg>
  )
}

const POST_PLATFORMS: { id: PostPlatform; label: string; icon: string | 'threads' }[] = [
  { id: 'instagram', label: 'Instagram', icon: igIcon },
  { id: 'threads', label: 'Threads', icon: 'threads' },
]

const IMAGE_MODELS = [
  { id: 'freepik', label: 'Super Quality', sub: 'Freepik', badge: 'NEW', badgeColor: 'bg-emerald-500' },
  { id: 'ZImageTurbo_INT8', label: '✨ Quality', sub: 'ZImageTurbo', badge: null, badgeColor: '' },
  { id: 'Flux1schnell', label: '⚡ Fast', sub: 'Flux Schnell', badge: null, badgeColor: '' },
  { id: 'searchapi', label: 'Web Based', sub: 'SearchApi (Web Images)', badge: 'NEW', badgeColor: 'bg-blue-500' },
] as const

const POSTS_PREVIEW_SCALE = 0.2

type WizardStep = 'brands' | 'platforms' | 'model' | 'mode' | 'create'

export function PostsPage() {
  // ── All hooks BEFORE any early return ──────────────────────────────
  const queryClient = useQueryClient()
  const createJob = useCreateJob()
  const navigate = useNavigate()
  const { brands: dynamicBrands, brandIds, isLoading: brandsLoading } = useDynamicBrands()
  const { data: dbSettings, isLoading: settingsLoading } = useLayoutSettings()
  const { data: connectionsData } = useBrandConnections()
  const updateDbSettings = useUpdateLayoutSettings()
  const { data: brandConfigsData } = useTobyBrandConfigs()
  const brandMap = useMemo(() => {
    const map: Record<string, { name: string; color: string }> = {}
    dynamicBrands.forEach(b => { map[b.id] = { name: b.label, color: b.color } })
    return map
  }, [dynamicBrands])

  // Wizard state
  const [step, setStep] = useState<WizardStep>('brands')
  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([])
  const [allBrands, setAllBrands] = useState(true)
  const [selectedPlatforms, setSelectedPlatforms] = useState<PostPlatform[]>([])
  const [imageModel, setImageModel] = useState<string>('ZImageTurbo_INT8')

  // Manual create form state
  const [title, setTitle] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [settings, setSettings] = useState<GeneralSettings>(loadGeneralSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Font loading
  const [fontLoaded, setFontLoaded] = useState(false)
  useEffect(() => {
    document.fonts.load('1em Anton').then(() => setFontLoaded(true))
  }, [])

  // Merge DB settings when they arrive
  useEffect(() => {
    if (dbSettings && Object.keys(dbSettings).length > 0) {
      setSettings((prev) => ({
        ...DEFAULT_GENERAL_SETTINGS,
        ...prev,
        ...dbSettings,
        layout: {
          ...DEFAULT_GENERAL_SETTINGS.layout,
          ...prev.layout,
          ...(dbSettings.layout || {}),
        },
      }))
    }
  }, [dbSettings])

  // Derive which platforms have at least one connected brand
  const hasThreads = connectionsData?.brands.some(b => b.threads?.connected) ?? true
  const availablePostPlatforms = POST_PLATFORMS.filter(({ id }) => {
    if (id === 'threads') return hasThreads
    return true
  })

  // Helper: check if a platform is enabled for given brands
  const isPlatformEnabledForBrands = useCallback((platform: PostPlatform, brands: BrandName[]): boolean => {
    if (!brandConfigsData?.brands?.length || brands.length === 0) return true
    return brands.some(brandId => {
      const cfg = brandConfigsData.brands.find((bc: any) => bc.brand_id === brandId)
      if (!cfg) return true
      if (!cfg.enabled_platforms) return true
      const postsPlatforms = cfg.enabled_platforms['posts']
      if (!postsPlatforms) return true
      return postsPlatforms.includes(platform as any)
    })
  }, [brandConfigsData])

  // ── Derived ────────────────────────────────────────────────────────
  const effectiveBrands = allBrands ? brandIds : selectedBrands

  const getConnectedPlatforms = useCallback((): PostPlatform[] => {
    if (!connectionsData?.brands) return ['instagram']
    const platforms = new Set<PostPlatform>()
    for (const bc of connectionsData.brands) {
      if (!effectiveBrands.includes(bc.brand)) continue
      platforms.add('instagram') // always available
      if (bc.threads?.connected) platforms.add('threads')
    }
    return platforms.size > 0 ? Array.from(platforms) : ['instagram']
  }, [connectionsData, effectiveBrands])

  // ── Toggle helpers ─────────────────────────────────────────────────
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

  const togglePlatform = (platform: PostPlatform) => {
    setSelectedPlatforms(prev => {
      if (prev.includes(platform) && prev.length === 1) return prev
      return prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    })
  }

  const updateLayout = (updates: Partial<LayoutConfig>) => {
    setSettings((prev) => ({
      ...prev,
      layout: { ...prev.layout, ...updates },
    }))
  }

  // ── Step navigation ─────────────────────────────────────────────────
  const STEP_LIST: WizardStep[] = ['brands', 'platforms', 'model', 'mode']
  const stepIdx = STEP_LIST.indexOf(step)

  const goToPlatforms = () => {
    const connected = getConnectedPlatforms()
    const enabled = connected.filter(p => isPlatformEnabledForBrands(p, effectiveBrands))
    setSelectedPlatforms(enabled.length > 0 ? enabled : connected)
    setStep('platforms')
  }

  const goToModel = () => setStep('model')
  const goToMode = () => setStep('mode')

  const goBack = () => {
    if (step === 'platforms') setStep('brands')
    else if (step === 'model') setStep('platforms')
    else if (step === 'mode') setStep('model')
    else if (step === 'create') setStep('mode')
  }

  const resetWizard = useCallback(() => {
    setStep('brands')
    setSelectedBrands([])
    setAllBrands(true)
    setSelectedPlatforms([])
    setImageModel('ZImageTurbo_INT8')
    setTitle('')
    setAiPrompt('')
    setShowSettings(false)
  }, [])

  // ── AI Generation helpers ──────────────────────────────────────────
  const handleGeneratePrompt = async () => {
    if (!title.trim()) {
      toast.error('Enter a title first')
      return
    }
    setIsGeneratingPrompt(true)
    try {
      const resp = await fetch('/reels/generate-image-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const data = await resp.json()
      if (data.prompt) {
        setAiPrompt(data.prompt)
        toast.success('Image prompt generated!')
      }
    } catch {
      toast.error('Failed to generate prompt')
    } finally {
      setIsGeneratingPrompt(false)
    }
  }

  // ── Auto generate (creates job for all selected brands) ────────────
  const handleAutoGenerate = async () => {
    if (effectiveBrands.length === 0) return
    setIsCreating(true)
    try {
      const job = await createJob.mutateAsync({
        title: 'Auto-generated posts',
        content_lines: [],
        brands: effectiveBrands,
        variant: 'post',
        cta_type: 'none',
        image_model: imageModel,
      })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      resetWizard()
      toast.success(
        (t) => (
          <span className="cursor-pointer" onClick={() => { toast.dismiss(t.id); navigate(`/job/${job.id}`) }}>
            Post generation started! <u>View Job →</u>
          </span>
        ),
        { duration: 6000 }
      )
    } catch {
      toast.error('Failed to create auto generate job')
    } finally {
      setIsCreating(false)
    }
  }

  // ── Manual submit ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (effectiveBrands.length === 0) {
      toast.error('Select at least one brand')
      return
    }
    setIsCreating(true)
    try {
      const job = await createJob.mutateAsync({
        title: title.trim(),
        content_lines: [],
        brands: effectiveBrands,
        variant: 'post',
        ai_prompt: aiPrompt.trim() || undefined,
        cta_type: 'none',
        fixed_title: true,
        image_model: imageModel,
      })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      toast.success(
        (t) => (
          <span className="cursor-pointer" onClick={() => { toast.dismiss(t.id); navigate(`/job/${job.id}`) }}>
            Post generation started! <u>View Job →</u>
          </span>
        ),
        { duration: 6000 }
      )
      setTitle('')
      setAiPrompt('')
    } catch {
      toast.error('Failed to create post job')
    } finally {
      setIsCreating(false)
    }
  }

  // ── Settings persistence ───────────────────────────────────────────
  const handleSaveSettings = () => {
    saveGeneralSettings(settings)
    updateDbSettings.mutate(settings)
    toast.success('Settings saved!')
  }
  const handleResetSettings = () => {
    setSettings(DEFAULT_GENERAL_SETTINGS)
    localStorage.removeItem('posts-general-settings')
    updateDbSettings.mutate(DEFAULT_GENERAL_SETTINGS)
    toast.success('Settings reset to default')
  }

  const previewBrand = effectiveBrands[0] || brandIds[0] || ''

  // ── Early returns (after all hooks) ────────────────────────────────
  if (brandsLoading || settingsLoading) return <PostsSkeleton />

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className={`mx-auto py-6 ${step === 'create' ? 'max-w-4xl px-6' : 'max-w-2xl'}`}>
      {/* Progress header (steps 1-4 only) */}
      {step !== 'create' && (
        <div className="flex items-center justify-between mb-8">
          {step !== 'brands' ? (
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-1.5">
            {STEP_LIST.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i <= stepIdx ? 'w-6 bg-stone-800' : 'w-1.5 bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STEP 1: BRANDS
          ═══════════════════════════════════════════════════════════════ */}
      {step === 'brands' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">Which brands?</h2>
            <p className="text-sm text-gray-500">Select the brands to create posts for</p>
          </div>

          {/* All Brands toggle */}
          <button
            onClick={selectAllBrands}
            className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border-2 transition-all ${
              allBrands
                ? 'border-stone-800 bg-stone-50 shadow-sm'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                allBrands ? 'bg-stone-800' : 'bg-gray-100'
              }`}>
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

          {/* Individual brands */}
          <div className="grid grid-cols-2 gap-2">
            {dynamicBrands.map(brand => {
              const active = !allBrands && selectedBrands.includes(brand.id)
              const brandColor = brand.color || '#999'
              return (
                <button
                  key={brand.id}
                  onClick={() => toggleBrand(brand.id)}
                  className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    active
                      ? 'bg-white shadow-sm'
                      : allBrands
                        ? 'border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-white'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  style={active ? { borderColor: brandColor } : undefined}
                >
                  <div
                    className={`w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center transition-all ${
                      active ? 'scale-110' : ''
                    }`}
                    style={{ backgroundColor: active ? brandColor : 'transparent', border: active ? 'none' : `2px solid ${brandColor}` }}
                  >
                    {active && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span className={`text-sm font-medium truncate transition-colors ${
                    active ? 'text-gray-900' : 'text-gray-600'
                  }`}>{brand.label}</span>
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

      {/* ═══════════════════════════════════════════════════════════════
          STEP 2: PLATFORMS
          ═══════════════════════════════════════════════════════════════ */}
      {step === 'platforms' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">Where to publish?</h2>
            <p className="text-sm text-gray-500">Choose your target platforms</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {availablePostPlatforms.map(({ id, label, icon }) => {
              const enabled = isPlatformEnabledForBrands(id, effectiveBrands)
              const active = selectedPlatforms.includes(id)
              const available = enabled

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
                  {icon === 'threads' ? (
                    <ThreadsLogo className="w-7 h-7" />
                  ) : (
                    <img src={icon} alt={label} className="w-7 h-7 object-contain" />
                  )}
                  <div>
                    <span className="text-sm font-semibold text-gray-800">{label}</span>
                    {!available && (
                      <p className="text-[10px] text-gray-400">Not enabled</p>
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
            onClick={goToModel}
            disabled={selectedPlatforms.length === 0}
            className="w-full py-3.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Continue
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STEP 3: AI IMAGE MODEL
          ═══════════════════════════════════════════════════════════════ */}
      {step === 'model' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">AI Image Model</h2>
            <p className="text-sm text-gray-500">Choose how images are generated for your posts</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {IMAGE_MODELS.map(opt => {
              const active = imageModel === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => setImageModel(opt.id)}
                  className={`relative flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${
                    active
                      ? 'border-stone-800 bg-stone-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  {opt.badge && (
                    <span className={`absolute top-2 right-2 text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full ${opt.badgeColor}`}>
                      {opt.badge}
                    </span>
                  )}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                    active ? 'bg-stone-800 text-white' : 'bg-gray-100'
                  }`}>
                    {opt.id === 'freepik' && '🎨'}
                    {opt.id === 'ZImageTurbo_INT8' && '✨'}
                    {opt.id === 'Flux1schnell' && '⚡'}
                    {opt.id === 'searchapi' && '🌐'}
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-semibold text-gray-900 block">{opt.label}</span>
                    <span className={`text-[10px] ${active ? 'text-stone-500' : 'text-gray-400'}`}>{opt.sub}</span>
                  </div>
                </button>
              )
            })}
          </div>

          <button
            onClick={goToMode}
            className="w-full py-3.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors text-sm"
          >
            Continue
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STEP 4: MODE
          ═══════════════════════════════════════════════════════════════ */}
      {step === 'mode' && (
        <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-gray-900">How do you want to create?</h2>
            <p className="text-sm text-gray-500">
              {effectiveBrands.length} brand{effectiveBrands.length !== 1 ? 's' : ''} · {selectedPlatforms.length} platform{selectedPlatforms.length !== 1 ? 's' : ''} · {IMAGE_MODELS.find(m => m.id === imageModel)?.label}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* Auto */}
            <div className="space-y-2">
              <button
                onClick={handleAutoGenerate}
                disabled={isCreating}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-stone-900 text-white font-semibold text-sm shadow-lg hover:bg-stone-800 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Zap className="w-5 h-5 text-amber-400" />
                )}
                {isCreating ? 'Creating job…' : '100% Automatic'}
              </button>
              <p className="text-xs text-gray-400 text-center">AI generates topic, title, and image for each brand</p>
              <div className="flex items-center gap-1.5 px-2 overflow-x-auto justify-center">
                {['Pick topic', 'Write title', 'AI image', 'Render post'].map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 flex-shrink-0">
                    {i > 0 && <span className="text-[10px] text-gray-300">→</span>}
                    <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 whitespace-nowrap">{s}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Manual */}
            <div className="space-y-2">
              <button
                onClick={() => setStep('create')}
                className="w-full flex items-center gap-4 px-5 py-5 rounded-xl border-2 border-gray-200 bg-white hover:border-stone-400 hover:bg-stone-50/50 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center group-hover:bg-stone-200 transition-colors">
                  <Wrench className="w-6 h-6 text-stone-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-900">Manual Control</span>
                  <p className="text-xs text-gray-500 mt-0.5">You provide the title, prompt, and layout</p>
                </div>
                <ArrowLeft className="w-4 h-4 text-gray-300 rotate-180 group-hover:text-stone-500 transition-colors" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STEP 5: MANUAL CREATE
          ═══════════════════════════════════════════════════════════════ */}
      {step === 'create' && (
        <div className="space-y-5 animate-in fade-in duration-300">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-xs text-gray-500">
              {effectiveBrands.length} brand{effectiveBrands.length !== 1 ? 's' : ''} · {IMAGE_MODELS.find(m => m.id === imageModel)?.label}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
            {/* Left: Inputs */}
            <div className="space-y-5 min-w-0">
              {/* Title */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Title
                  <span className="text-xs font-normal text-gray-400 ml-1">(required)</span>
                </label>
                <textarea
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  rows={2}
                  placeholder='e.g. Daily ginger consumption may reduce muscle pain by 25%'
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-stone-400 focus:border-transparent text-sm"
                />
              </div>

              {/* AI Image Prompt */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  AI Image Prompt
                  <span className="text-xs font-normal text-gray-400 ml-1">(auto-generated if empty)</span>
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={2}
                  placeholder="Describe the background image..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-stone-400 focus:border-transparent text-sm"
                />
                <button
                  onClick={handleGeneratePrompt}
                  disabled={isGeneratingPrompt || !title.trim()}
                  className="mt-2 flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isGeneratingPrompt ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wand2 className="w-3 h-3" />
                  )}
                  Generate Prompt
                </button>
              </div>

              {/* Layout Settings (collapsible) */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <button
                  onClick={() => setShowSettings((prev) => !prev)}
                  className="w-full font-semibold text-gray-900 flex items-center gap-2 cursor-pointer hover:text-stone-600 transition-colors text-sm"
                >
                  <Settings2 className="w-4 h-4" />
                  Layout Settings & Preview
                  <ChevronDown
                    className={`w-4 h-4 ml-auto transition-transform ${
                      showSettings ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {showSettings && (
                  <div className="mt-4 flex gap-5">
                    {/* Preview */}
                    <div className="flex-shrink-0">
                      <p className="text-[10px] text-gray-400 mb-2">
                        Layout preview · backgrounds generated after job creation
                      </p>
                      <div className="flex justify-center">
                        {fontLoaded && (
                          <PostCanvas
                            brand={previewBrand}
                            title={title || 'YOUR TITLE\nGOES HERE'}
                            backgroundImage={null}
                            settings={settings}
                            scale={POSTS_PREVIEW_SCALE}
                          />
                        )}
                      </div>
                    </div>

                    {/* Settings controls */}
                    <div className="flex-1 min-w-0 space-y-3">
                      <div>
                        <label className="text-xs text-gray-500">
                          Font Size: {settings.fontSize}px
                          {title.trim() && (() => {
                            const maxW = CANVAS_WIDTH - (settings.layout.titlePaddingX || 45) * 2
                            const effective = autoFitFontSize(title, maxW, settings.fontSize, 3)
                            return effective !== settings.fontSize
                              ? <span className="text-blue-500 ml-1">(auto-fit: {effective}px)</span>
                              : null
                          })()}
                        </label>
                        <input
                          type="range"
                          min={40}
                          max={90}
                          value={settings.fontSize}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              fontSize: Number(e.target.value),
                            }))
                          }
                          className="w-full accent-stone-800"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500">
                            Caption Bottom: {settings.layout.readCaptionBottom}px
                          </label>
                          <input
                            type="range" min={20} max={80}
                            value={settings.layout.readCaptionBottom}
                            onChange={(e) => updateLayout({ readCaptionBottom: Number(e.target.value) })}
                            className="w-full accent-stone-800"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">
                            Title Gap: {settings.layout.titleGap}px
                          </label>
                          <input
                            type="range" min={10} max={300}
                            value={settings.layout.titleGap}
                            onChange={(e) => updateLayout({ titleGap: Number(e.target.value) })}
                            className="w-full accent-stone-800"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">
                            Logo Gap: {settings.layout.logoGap}px
                          </label>
                          <input
                            type="range" min={20} max={60}
                            value={settings.layout.logoGap}
                            onChange={(e) => updateLayout({ logoGap: Number(e.target.value) })}
                            className="w-full accent-stone-800"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">
                            Horizontal Padding: {settings.layout.titlePaddingX}px
                          </label>
                          <input
                            type="range" min={0} max={200}
                            value={settings.layout.titlePaddingX}
                            onChange={(e) => updateLayout({ titlePaddingX: Number(e.target.value) })}
                            className="w-full accent-stone-800"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">
                          Bar Width:{' '}
                          {settings.barWidth === 0 ? 'Auto' : `${settings.barWidth}px`}
                        </label>
                        <input
                          type="range" min={0} max={400}
                          value={settings.barWidth}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              barWidth: Number(e.target.value),
                            }))
                          }
                          className="w-full accent-stone-800"
                        />
                      </div>
                      <div className="pt-2 border-t border-gray-100">
                        <label className="text-xs text-gray-500">Slide Font Family</label>
                        <select
                          value={settings.slideFontFamily || DEFAULT_GENERAL_SETTINGS.slideFontFamily}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              slideFontFamily: e.target.value,
                            }))
                          }
                          className="w-full mt-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-stone-400"
                        >
                          {SLIDE_FONT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Font used for body text on carousel slides 2+
                        </p>
                      </div>
                      <div className="flex gap-2 pt-2 border-t border-gray-100">
                        <button
                          onClick={handleSaveSettings}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-stone-900 text-white text-xs rounded-lg hover:bg-stone-800"
                        >
                          <Save className="w-3 h-3" /> Save
                        </button>
                        <button
                          onClick={handleResetSettings}
                          className="flex items-center justify-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200"
                        >
                          <RotateCcw className="w-3 h-3" /> Reset
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Preview + Selected Brands + Generate */}
            <div className="self-start sticky top-6 space-y-4">
              {/* Summary card */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Brands</label>
                  <div className="flex flex-wrap gap-1.5">
                    {effectiveBrands.map(brand => {
                      const config = brandMap[brand]
                      return (
                        <span
                          key={brand}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-50 border border-stone-200 text-xs font-medium text-stone-700"
                        >
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: config?.color || '#999' }}
                          />
                          {config?.name || brand}
                        </span>
                      )
                    })}
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Image Model</label>
                  <span className="text-xs text-gray-700">{IMAGE_MODELS.find(m => m.id === imageModel)?.label} — {IMAGE_MODELS.find(m => m.id === imageModel)?.sub}</span>
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleSubmit}
                disabled={isCreating || effectiveBrands.length === 0 || !title.trim()}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 font-medium disabled:opacity-50 transition-colors text-sm"
                title={!title.trim() ? 'Enter a title first' : ''}
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileImage className="w-4 h-4" />
                )}
                Generate Posts
              </button>
              <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                Uses your exact title · each brand gets a unique image
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
