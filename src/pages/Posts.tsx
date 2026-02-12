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
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { useCreateJob } from '@/features/jobs'
import {
  PREVIEW_SCALE,
  BRAND_CONFIGS,
  DEFAULT_GENERAL_SETTINGS,
  SLIDE_FONT_OPTIONS,
  loadGeneralSettings,
  saveGeneralSettings,
  PostCanvas,
} from '@/shared/components/PostCanvas'
import type { GeneralSettings, LayoutConfig } from '@/shared/components/PostCanvas'
import type { BrandName } from '@/shared/types'
import { GodAutomation } from '@/shared/components/GodAutomation'

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
  const [showGodMode, setShowGodMode] = useState(false)

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
      const resp = await fetch('/reels/generate-post-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!resp.ok) throw new Error('Failed')
      const data = await resp.json()
      if (data.title) {
        setTitle(data.title)
        if (data.image_prompt) setAiPrompt(data.image_prompt)
        toast.success('Title & prompt generated!')
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

  // ── Auto: generate title + prompt (user creates job manually) ────
  const handleAutoGenerate = async () => {
    setIsGeneratingTitle(true)
    try {
      toast.loading('Generating post content...', { id: 'auto' })
      const resp = await fetch('/reels/generate-post-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!resp.ok) {
        const err = await resp.json()
        throw new Error(err.detail || 'Failed to generate content')
      }
      const data = await resp.json()
      if (!data.title) throw new Error('No title generated')
      setTitle(data.title)
      if (data.image_prompt) setAiPrompt(data.image_prompt)
      toast.success('Title & prompt ready! Review and click Generate Posts.', {
        id: 'auto',
        duration: 5000,
      })
    } catch (err: any) {
      toast.error(err?.message || 'Auto generate failed', { id: 'auto' })
    } finally {
      setIsGeneratingTitle(false)
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
        title: title.trim() || 'Auto-generated posts',
        content_lines: [],
        brands: selectedBrands,
        variant: 'post',
        ai_prompt: aiPrompt.trim() || title.trim() || undefined,
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
    <div className="max-w-[1600px] mx-auto space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Posts</h1>
        <p className="text-gray-500 text-sm mt-1">
          Each brand gets a unique post with different topic, title, and image.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_auto] lg:grid-cols-[1fr_auto] gap-5">
        {/* Col 1: Inputs */}
        <div className="space-y-4 min-w-0">
          {/* Topic Hint + AI Image Prompt side by side on desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Topic Hint */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Topic Hint
                <span className="text-xs font-normal text-gray-400 ml-1">
                  (optional — AI picks topics if empty)
                </span>
              </label>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={3}
                placeholder="e.g. focus on teas and sleep rituals"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
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
            <div className="bg-white rounded-xl border border-gray-200 p-4">
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
                className="w-full px-3 py-2 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
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
          </div>

          {/* Brands + Settings side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Brands */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
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
            <div className="bg-white rounded-xl border border-gray-200 p-4">
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
                      className="w-full mt-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-primary-500"
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
          </div>

          {/* Action buttons — horizontal row */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleAutoGenerate}
              disabled={isCreating || isGeneratingTitle || selectedBrands.length === 0}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-primary-600 text-white rounded-xl hover:from-purple-700 hover:to-primary-700 font-medium disabled:opacity-50"
            >
              {isGeneratingTitle ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              Auto Generate
            </button>
            <button
              onClick={handleSubmit}
              disabled={isCreating || selectedBrands.length === 0 || !title.trim()}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 font-medium disabled:opacity-50"
              title={!title.trim() ? 'Enter a topic hint first' : ''}
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileImage className="w-4 h-4" />
              )}
              Generate Posts
            </button>
            <button
              onClick={() => setShowGodMode(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-white rounded-xl hover:from-amber-600 hover:via-yellow-600 hover:to-amber-700 font-bold shadow-lg shadow-amber-200/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Zap className="w-4 h-4" />
              God Automation 🔱
            </button>
            <p className="text-xs text-gray-400">
              💡 <strong>Generate Posts</strong> needs a topic hint · <strong>God Automation</strong> does everything automatically
            </p>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 self-start">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Preview</h3>
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

      {/* God Automation overlay */}
      {showGodMode && (
        <GodAutomation
          brands={selectedBrands}
          settings={settings}
          onClose={() => setShowGodMode(false)}
        />
      )}
    </div>
  )
}
