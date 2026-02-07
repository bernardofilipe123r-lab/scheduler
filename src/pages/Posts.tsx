/**
 * Posts page — simplified form that creates a "post" Job
 * and navigates to the job detail page for monitoring / scheduling.
 */
import { useState, useEffect } from 'react'
import {
  FileImage,
  Loader2,
  Wand2,
  Check,
  Settings2,
  ChevronDown,
  Save,
  RotateCcw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { useCreateJob } from '@/features/jobs'
import {
  PREVIEW_SCALE,
  BRAND_CONFIGS,
  DEFAULT_GENERAL_SETTINGS,
  loadGeneralSettings,
  saveGeneralSettings,
  PostCanvas,
} from '@/shared/components/PostCanvas'
import type { GeneralSettings, LayoutConfig } from '@/shared/components/PostCanvas'
import type { BrandName } from '@/shared/types'

const ALL_BRANDS: BrandName[] = [
  'healthycollege',
  'longevitycollege',
  'wellbeingcollege',
  'vitalitycollege',
  'holisticcollege',
]

export function PostsPage() {
  const navigate = useNavigate()
  const createJob = useCreateJob()

  // Form state
  const [title, setTitle] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([...ALL_BRANDS])
  const [settings, setSettings] = useState<GeneralSettings>(loadGeneralSettings)
  const [showSettings, setShowSettings] = useState(false)

  // Loading state
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false)
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Font loading
  const [fontLoaded, setFontLoaded] = useState(false)
  useEffect(() => {
    document.fonts.load('1em Anton').then(() => setFontLoaded(true))
  }, [])

  const toggleBrand = (brand: BrandName) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    )
  }

  const updateLayout = (updates: Partial<LayoutConfig>) => {
    setSettings((prev) => ({
      ...prev,
      layout: { ...prev.layout, ...updates },
    }))
  }

  // ── AI Generation helpers ──────────────────────────────────────────
  const handleGenerateTitle = async () => {
    setIsGeneratingTitle(true)
    try {
      const resp = await fetch('/reels/generate-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'health wellness fitness college lifestyle' }),
      })
      const data = await resp.json()
      if (data.title) {
        setTitle(data.title)
        toast.success('Title generated!')
      }
    } catch {
      toast.error('Failed to generate title')
    } finally {
      setIsGeneratingTitle(false)
    }
  }

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

  // ── Auto: generate title + prompt + create job ─────────────────────
  const handleAutoGenerate = async () => {
    setIsCreating(true)
    try {
      // 1) Generate title
      toast.loading('Generating title...', { id: 'auto' })
      const titleResp = await fetch('/reels/generate-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'health wellness fitness college lifestyle' }),
      })
      const titleData = await titleResp.json()
      const generatedTitle = titleData.title
      if (!generatedTitle) throw new Error('No title')
      setTitle(generatedTitle)

      // 2) Generate prompt
      toast.loading('Generating image prompt...', { id: 'auto' })
      const promptResp = await fetch('/reels/generate-image-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: generatedTitle }),
      })
      const promptData = await promptResp.json()
      const generatedPrompt = promptData.prompt || ''
      setAiPrompt(generatedPrompt)

      // 3) Create job
      toast.loading('Creating job...', { id: 'auto' })
      const job = await createJob.mutateAsync({
        title: generatedTitle,
        content_lines: [],
        brands: selectedBrands,
        variant: 'post',
        ai_prompt: generatedPrompt,
        cta_type: 'none',
      })
      toast.success('Post job created!', { id: 'auto' })
      navigate(`/job/${job.id}`)
    } catch (err: any) {
      toast.error(err?.message || 'Auto generate failed', { id: 'auto' })
    } finally {
      setIsCreating(false)
    }
  }

  // ── Manual submit ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Enter a title')
      return
    }
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
      })
      toast.success('Post job created!')
      navigate(`/job/${job.id}`)
    } catch {
      toast.error('Failed to create post job')
    } finally {
      setIsCreating(false)
    }
  }

  // ── Settings persistence ───────────────────────────────────────────
  const handleSaveSettings = () => {
    saveGeneralSettings(settings)
    toast.success('Settings saved!')
  }
  const handleResetSettings = () => {
    setSettings(DEFAULT_GENERAL_SETTINGS)
    localStorage.removeItem('posts-general-settings')
    toast.success('Settings reset to default')
  }

  const previewBrand = selectedBrands[0] || 'healthycollege'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Post</h1>
        <p className="text-gray-500 text-sm mt-1">
          Generate AI background images for all brands and schedule posts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="space-y-5">
          {/* Title */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Post Title
            </label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={3}
              placeholder="Enter your post title..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button
              onClick={handleGenerateTitle}
              disabled={isGeneratingTitle}
              className="mt-2 flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
            >
              {isGeneratingTitle ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Wand2 className="w-3 h-3" />
              )}
              Generate Title
            </button>
          </div>

          {/* AI Image Prompt */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              AI Image Prompt
              <span className="text-xs font-normal text-gray-400 ml-1">
                (auto-generated if empty)
              </span>
            </label>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={3}
              placeholder="Describe the background image..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button
              onClick={handleGeneratePrompt}
              disabled={isGeneratingPrompt || !title.trim()}
              className="mt-2 flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
            >
              {isGeneratingPrompt ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Wand2 className="w-3 h-3" />
              )}
              Generate Prompt
            </button>
          </div>

          {/* Brands */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Brands
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_BRANDS.map((brand) => {
                const config = BRAND_CONFIGS[brand]
                const selected = selectedBrands.includes(brand)
                return (
                  <button
                    key={brand}
                    onClick={() => toggleBrand(brand)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                      selected
                        ? 'border-primary-300 bg-primary-50 text-primary-700'
                        : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: config?.color || '#999' }}
                    />
                    {config?.name || brand}
                    {selected && <Check className="w-3 h-3" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Layout Settings (collapsible) */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <button
              onClick={() => setShowSettings((prev) => !prev)}
              className="w-full font-semibold text-gray-900 flex items-center gap-2 cursor-pointer hover:text-primary-600 transition-colors text-sm"
            >
              <Settings2 className="w-4 h-4" />
              Layout Settings
              <ChevronDown
                className={`w-4 h-4 ml-auto transition-transform ${
                  showSettings ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showSettings && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs text-gray-500">
                    Font Size: {settings.fontSize}px
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
                    className="w-full accent-primary-500"
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
                      className="w-full accent-primary-500"
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
                      className="w-full accent-primary-500"
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
                      className="w-full accent-primary-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">
                      Title Padding: {settings.layout.titlePaddingX}px
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={120}
                      value={settings.layout.titlePaddingX}
                      onChange={(e) =>
                        updateLayout({ titlePaddingX: Number(e.target.value) })
                      }
                      className="w-full accent-primary-500"
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
                    className="w-full accent-primary-500"
                  />
                </div>
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={handleSaveSettings}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-primary-500 text-white text-xs rounded-lg hover:bg-primary-600"
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
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleAutoGenerate}
              disabled={isCreating || selectedBrands.length === 0}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-primary-600 text-white rounded-xl hover:from-purple-700 hover:to-primary-700 font-medium disabled:opacity-50"
            >
              {isCreating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Wand2 className="w-5 h-5" />
              )}
              Auto Generate
            </button>
            <button
              onClick={handleSubmit}
              disabled={isCreating || !title.trim() || selectedBrands.length === 0}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600 font-medium disabled:opacity-50"
            >
              {isCreating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <FileImage className="w-5 h-5" />
              )}
              Create Job
            </button>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Preview</h3>
          <p className="text-xs text-gray-400 mb-3">
            Layout preview · backgrounds generated after job creation
          </p>
          <div className="flex justify-center">
            {fontLoaded && (
              <PostCanvas
                brand={previewBrand}
                title={title || 'YOUR TITLE\nGOES HERE'}
                backgroundImage={null}
                settings={settings}
                scale={PREVIEW_SCALE}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
