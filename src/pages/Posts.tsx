/**
 * Posts page — simplified form that creates a "post" Job
 * and navigates to the job detail page for monitoring / scheduling.
 */
import { useState, useEffect, useMemo } from 'react'
import {
  FileImage,
  Loader2,
  Wand2,
  Check,
  Settings2,
  ChevronDown,
  Save,
  RotateCcw,
  X,
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

const POSTS_PREVIEW_SCALE = 0.2

export function PostsPage() {
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

  // Derive which platforms have at least one connected brand
  const hasThreads = connectionsData?.brands.some(b => b.threads?.connected) ?? true
  const availablePostPlatforms = POST_PLATFORMS.filter(({ id }) => {
    if (id === 'threads') return hasThreads
    return true // always show instagram
  })

  // Helper: check if a platform is enabled for given brands based on their enabled_platforms config
  const isPostPlatformEnabledForBrands = (platform: PostPlatform, brands: BrandName[]): boolean => {
    if (!brandConfigsData?.brands?.length || brands.length === 0) return true
    return brands.some(brandId => {
      const cfg = brandConfigsData.brands.find(bc => bc.brand_id === brandId)
      if (!cfg) return true // no config = all enabled
      if (!cfg.enabled_platforms) return true // null = all connected
      const postsPlatforms = cfg.enabled_platforms['posts']
      if (!postsPlatforms) return true
      return postsPlatforms.includes(platform as any)
    })
  }

  // Form state
  const [title, setTitle] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([])
  const [settings, setSettings] = useState<GeneralSettings>(loadGeneralSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedPlatforms, setSelectedPlatforms] = useState<PostPlatform[]>(['instagram', 'threads'])
  const [autoPlatforms, setAutoPlatforms] = useState<PostPlatform[]>(['instagram', 'threads'])

  // Loading state
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [showAutoModal, setShowAutoModal] = useState(false)
  const [autoCount, setAutoCount] = useState(0)
  const [autoBrands, setAutoBrands] = useState<BrandName[]>([])
  const [imageModel, setImageModel] = useState<string>('ZImageTurbo_INT8')

  // When connections or brand config data loads, filter unavailable/disabled platforms
  useEffect(() => {
    if (!connectionsData) return
    const isConnected = (p: PostPlatform) => {
      if (p === 'threads') return connectionsData.brands.some(b => b.threads?.connected)
      return true
    }
    const keep = (p: PostPlatform) => isConnected(p) && isPostPlatformEnabledForBrands(p, selectedBrands)
    setSelectedPlatforms(prev => {
      const next = prev.filter(keep)
      return next.length > 0 ? next : prev
    })
  }, [connectionsData, brandConfigsData, selectedBrands])

  useEffect(() => {
    if (!connectionsData) return
    const isConnected = (p: PostPlatform) => {
      if (p === 'threads') return connectionsData.brands.some(b => b.threads?.connected)
      return true
    }
    const keep = (p: PostPlatform) => isConnected(p) && isPostPlatformEnabledForBrands(p, autoBrands)
    setAutoPlatforms(prev => {
      const next = prev.filter(keep)
      return next.length > 0 ? next : prev
    })
  }, [connectionsData, brandConfigsData, autoBrands])

  // Font loading
  const [fontLoaded, setFontLoaded] = useState(false)
  useEffect(() => {
    document.fonts.load('1em Anton').then(() => setFontLoaded(true))
  }, [])

  // Merge DB settings when they arrive (API takes priority over localStorage)
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

  // Select first brand when brands load
  useEffect(() => {
    if (brandIds.length > 0 && selectedBrands.length === 0) {
      setSelectedBrands([brandIds[0]])
    }
  }, [brandIds])

  const togglePlatform = (platform: PostPlatform) => {
    setSelectedPlatforms(prev => 
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    )
  }

  const toggleAutoPlatform = (platform: PostPlatform) => {
    setAutoPlatforms(prev => 
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    )
  }

  const toggleAutoBrand = (brand: BrandName) => {
    setAutoBrands((prev) => {
      const next = prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
      setAutoCount(next.length)
      return next
    })
  }

  const selectBrand = (brand: BrandName) => {
    setSelectedBrands([brand])
  }

  const updateLayout = (updates: Partial<LayoutConfig>) => {
    setSettings((prev) => ({
      ...prev,
      layout: { ...prev.layout, ...updates },
    }))
  }

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

  // ── Auto Generate modal helpers ────────────────────────────────────
  const handleAutoCountChange = (count: number) => {
    setAutoCount(count)
    setAutoBrands(brandIds.slice(0, count))
  }

  const handleAutoSubmit = async () => {
    if (autoBrands.length === 0) {
      toast.error('Select at least one brand')
      return
    }
    setIsCreating(true)
    setShowAutoModal(false)
    try {
      const job = await createJob.mutateAsync({
        title: 'Auto-generated posts',
        content_lines: [],
        brands: autoBrands,
        variant: 'post',
        cta_type: 'none',
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
    } catch {
      toast.error('Failed to create auto generate job')
    } finally {
      setIsCreating(false)
    }
  }

  // ── Manual submit ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (selectedBrands.length === 0) {
      toast.error('Select at least one brand')
      return
    }
    setIsCreating(true)
    try {
      const job = await createJob.mutateAsync({
        title: title.trim(),
        content_lines: [],
        brands: selectedBrands,
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

  const previewBrand = selectedBrands[0] || brandIds[0] || ''

  if (brandsLoading || settingsLoading) return <PostsSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Posts</h1>
        <p className="text-gray-500 text-sm mt-1">
          Each brand gets a unique post with different topic, title, and image.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
        {/* ── Left Column: Inputs ── */}
        <div className="space-y-5 min-w-0">
          {/* Card: Title */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Title
              <span className="text-xs font-normal text-gray-400 ml-1">(required for Generate Posts)</span>
            </label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              placeholder='e.g. Daily ginger consumption may reduce muscle pain by 25%'
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-stone-400 focus:border-transparent text-sm"
            />
          </div>

          {/* Card: AI Image Prompt */}
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

          {/* Card: Layout Settings + Preview (collapsible) */}
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
                {/* Preview (left) */}
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

                {/* Settings (right) */}
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
                        type="range"
                        min={20}
                        max={80}
                        value={settings.layout.readCaptionBottom}
                        onChange={(e) =>
                          updateLayout({
                            readCaptionBottom: Number(e.target.value),
                          })
                        }
                        className="w-full accent-stone-800"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">
                        Title Gap: {settings.layout.titleGap}px
                      </label>
                      <input
                        type="range"
                        min={10}
                        max={300}
                        value={settings.layout.titleGap}
                        onChange={(e) =>
                          updateLayout({ titleGap: Number(e.target.value) })
                        }
                        className="w-full accent-stone-800"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">
                        Logo Gap: {settings.layout.logoGap}px
                      </label>
                      <input
                        type="range"
                        min={20}
                        max={60}
                        value={settings.layout.logoGap}
                        onChange={(e) =>
                          updateLayout({ logoGap: Number(e.target.value) })
                        }
                        className="w-full accent-stone-800"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">
                        Horizontal Padding: {settings.layout.titlePaddingX}px
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        value={settings.layout.titlePaddingX}
                        onChange={(e) =>
                          updateLayout({ titlePaddingX: Number(e.target.value) })
                        }
                        className="w-full accent-stone-800"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">
                      Bar Width:{' '}
                      {settings.barWidth === 0
                        ? 'Auto'
                        : `${settings.barWidth}px`}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={400}
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
                    <label className="text-xs text-gray-500">
                      Slide Font Family
                    </label>
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
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
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
                      <Save className="w-3 h-3" />
                      Save
                    </button>
                    <button
                      onClick={handleResetSettings}
                      className="flex items-center justify-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column: Settings + Preview + Actions ── */}
        <div className="self-start sticky top-6 space-y-4">
          {/* Card: Brands + AI Image Model — combined */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            {/* Brands */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Brands</label>
              <div className="grid grid-cols-2 gap-2">
                {brandIds.map((brand) => {
                  const config = brandMap[brand]
                  const selected = selectedBrands.includes(brand)
                  return (
                    <button
                      key={brand}
                      onClick={() => selectBrand(brand)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all border ${
                        selected
                          ? 'border-stone-300 bg-stone-50 text-stone-900'
                          : 'border-gray-100 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: config?.color || '#999' }}
                      />
                      <span className="truncate">{config?.name || brand}</span>
                      {selected && <Check className="w-3 h-3 ml-auto flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Platforms */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Publish To</label>
              <div className="flex gap-2">
                {availablePostPlatforms.map(({ id, label, icon }) => {
                  const enabled = isPostPlatformEnabledForBrands(id, selectedBrands)
                  const active = selectedPlatforms.includes(id) && enabled
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => enabled && togglePlatform(id)}
                      disabled={!enabled}
                      title={!enabled ? `${label} is not enabled for the selected brand` : undefined}
                      className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg border transition-all ${
                        !enabled
                          ? 'border-gray-100 bg-gray-50 opacity-30 cursor-not-allowed'
                          : active
                            ? 'border-green-300 bg-green-50'
                            : 'border-gray-200 hover:bg-gray-50 opacity-40'
                      }`}
                    >
                      {icon === 'threads' ? <ThreadsLogo className="h-5 w-5" /> : <img src={icon} alt={label} loading="eager" className="h-5 w-auto" />}
                      <span className="text-[10px] font-medium text-gray-700">{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* AI Image Model */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI Image Model</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setImageModel('ZImageTurbo_INT8')}
                  className={`flex flex-col items-center p-2 rounded-lg border text-[11px] font-medium transition-all ${
                    imageModel === 'ZImageTurbo_INT8'
                      ? 'border-stone-800 bg-stone-900 text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span>✨ Quality</span>
                  <span className={`text-[9px] ${imageModel === 'ZImageTurbo_INT8' ? 'text-stone-300' : 'text-gray-400'}`}>ZImageTurbo</span>
                </button>
                <button
                  onClick={() => setImageModel('Flux1schnell')}
                  className={`flex flex-col items-center p-2 rounded-lg border text-[11px] font-medium transition-all ${
                    imageModel === 'Flux1schnell'
                      ? 'border-stone-800 bg-stone-900 text-white'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span>⚡ Fast</span>
                  <span className={`text-[9px] ${imageModel === 'Flux1schnell' ? 'text-stone-300' : 'text-gray-400'}`}>Flux Schnell</span>
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <button
              onClick={() => {
                setAutoCount(brandIds.length)
                setAutoBrands([...brandIds])
                setShowAutoModal(true)
              }}
              disabled={isCreating}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-stone-700 text-white rounded-xl hover:bg-stone-600 font-medium disabled:opacity-50 transition-colors text-sm"
            >
              <Wand2 className="w-4 h-4" />
              Auto Generate Viral Carrousel Posts
            </button>
            <button
              onClick={handleSubmit}
              disabled={isCreating || selectedBrands.length === 0 || !title.trim()}
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
              💡 <strong>Generate Posts</strong> uses your exact title · <strong>Auto Generate</strong> lets AI create everything
            </p>
          </div>
        </div>
      </div>

      {/* Auto Generate Modal */}
      {showAutoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Auto Generate Viral Carrousel Posts</h2>
              <button
                onClick={() => setShowAutoModal(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Brand count */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">How many brands?</label>
                <div className="flex gap-2">
                  {brandIds.map((_, i) => {
                    const count = i + 1
                    return (
                      <button
                        key={count}
                        onClick={() => handleAutoCountChange(count)}
                        className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all ${
                          autoCount === count
                            ? 'bg-stone-900 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {count}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Brands */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Select brands</label>
                <div className="grid grid-cols-2 gap-2">
                  {brandIds.map((brand) => {
                    const config = brandMap[brand]
                    const checked = autoBrands.includes(brand)
                    return (
                      <label
                        key={brand}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all border ${
                          checked
                            ? 'border-stone-300 bg-stone-50'
                            : 'border-gray-100 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAutoBrand(brand)}
                        />
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: config?.color || '#999' }}
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {config?.name || brand}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Platforms */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Publish To</label>
                <div className="flex gap-2">
                  {availablePostPlatforms.map(({ id, label, icon }) => {
                    const enabled = isPostPlatformEnabledForBrands(id, autoBrands)
                    const active = autoPlatforms.includes(id) && enabled
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => enabled && toggleAutoPlatform(id)}
                        disabled={!enabled}
                        title={!enabled ? `${label} is not enabled for the selected brand(s)` : undefined}
                        className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg border transition-all ${
                          !enabled
                            ? 'border-gray-100 bg-gray-50 opacity-30 cursor-not-allowed'
                            : active
                              ? 'border-green-300 bg-green-50'
                              : 'border-gray-200 hover:bg-gray-50 opacity-40'
                        }`}
                      >
                      {icon === 'threads' ? <ThreadsLogo className="h-5 w-5" /> : <img src={icon} alt={label} loading="eager" className="h-5 w-auto" />}
                        <span className="text-[10px] font-medium text-gray-700">{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowAutoModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAutoSubmit}
                disabled={autoBrands.length === 0}
                className="flex-1 px-4 py-2.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 font-medium text-sm disabled:opacity-50"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
