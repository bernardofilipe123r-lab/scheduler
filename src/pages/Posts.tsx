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
import toast from 'react-hot-toast'
import { useCreateJob } from '@/features/jobs'
import { useQueryClient } from '@tanstack/react-query'
import { useDynamicBrands } from '@/features/brands'
import {
  PREVIEW_SCALE,
  DEFAULT_GENERAL_SETTINGS,
  SLIDE_FONT_OPTIONS,
  loadGeneralSettings,
  saveGeneralSettings,
  PostCanvas,
} from '@/shared/components/PostCanvas'
import type { GeneralSettings, LayoutConfig } from '@/shared/components/PostCanvas'
import type { BrandName } from '@/shared/types'

export function PostsPage() {
  const queryClient = useQueryClient()
  const createJob = useCreateJob()
  const { brands: dynamicBrands, brandIds } = useDynamicBrands()
  const brandMap = useMemo(() => {
    const map: Record<string, { name: string; color: string }> = {}
    dynamicBrands.forEach(b => { map[b.id] = { name: b.label, color: b.color } })
    return map
  }, [dynamicBrands])

  // Form state
  const [title, setTitle] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([])
  const [settings, setSettings] = useState<GeneralSettings>(loadGeneralSettings)
  const [showSettings, setShowSettings] = useState(false)

  // Loading state
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [showAutoModal, setShowAutoModal] = useState(false)
  const [autoCount, setAutoCount] = useState(0)
  const [autoBrands, setAutoBrands] = useState<BrandName[]>([])

  // Font loading
  const [fontLoaded, setFontLoaded] = useState(false)
  useEffect(() => {
    document.fonts.load('1em Anton').then(() => setFontLoaded(true))
  }, [])

  // Select first brand when brands load
  useEffect(() => {
    if (brandIds.length > 0 && selectedBrands.length === 0) {
      setSelectedBrands([brandIds[0]])
    }
  }, [brandIds])

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

  const toggleAutoBrand = (brand: BrandName) => {
    setAutoBrands((prev) => {
      const next = prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
      setAutoCount(next.length)
      return next
    })
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
      })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      toast.success(`Post job ${job.id.slice(0, 8)}... created and processing!`, { duration: 6000 })
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
      })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      toast.success(`Post job ${job.id.slice(0, 8)}... created and processing!`, { duration: 6000 })
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
    toast.success('Settings saved!')
  }
  const handleResetSettings = () => {
    setSettings(DEFAULT_GENERAL_SETTINGS)
    localStorage.removeItem('posts-general-settings')
    toast.success('Settings reset to default')
  }

  const previewBrand = selectedBrands[0] || brandIds[0] || 'healthycollege'

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
            {/* Title */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Title
                <span className="text-xs font-normal text-gray-400 ml-1">
                  (required for Generate Posts)
                </span>
              </label>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={3}
                placeholder='e.g. Daily ginger consumption may reduce muscle pain by 25%'
                className="w-full px-3 py-2 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
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
                {brandIds.map((brand) => {
                  const config = brandMap[brand]
                  const selected = selectedBrands.includes(brand)
                  return (
                    <button
                      key={brand}
                      onClick={() => selectBrand(brand)}
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
              onClick={() => {
                setAutoCount(brandIds.length)
                setAutoBrands([...brandIds])
                setShowAutoModal(true)
              }}
              disabled={isCreating}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-primary-600 text-white rounded-xl hover:from-purple-700 hover:to-primary-700 font-medium disabled:opacity-50"
            >
              <Wand2 className="w-4 h-4" />
              Auto Generate
            </button>
            <button
              onClick={handleSubmit}
              disabled={isCreating || selectedBrands.length === 0 || !title.trim()}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 font-medium disabled:opacity-50"
              title={!title.trim() ? 'Enter a title first' : ''}
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileImage className="w-4 h-4" />
              )}
              Generate Posts
            </button>
            <p className="text-xs text-gray-400">
              💡 <strong>Generate Posts</strong> uses your exact title · <strong>Auto Generate</strong> lets AI create everything
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

      {/* Auto Generate Modal */}
      {showAutoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Auto Generate Posts</h2>
              <button
                onClick={() => setShowAutoModal(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Brand count selector */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                How many brands?
              </label>
              <div className="flex gap-2">
                {brandIds.map((_, i) => {
                  const count = i + 1
                  return (
                    <button
                      key={count}
                      onClick={() => handleAutoCountChange(count)}
                      className={`w-10 h-10 rounded-lg text-sm font-semibold transition-all ${
                        autoCount === count
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {count}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Brand checkboxes */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Select brands
              </label>
              <div className="space-y-2">
                {brandIds.map((brand) => {
                  const config = brandMap[brand]
                  const checked = autoBrands.includes(brand)
                  return (
                    <label
                      key={brand}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all border ${
                        checked
                          ? 'border-purple-200 bg-purple-50'
                          : 'border-gray-100 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAutoBrand(brand)}
                        className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <div
                        className="w-3 h-3 rounded-full"
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

            {/* Modal actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowAutoModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAutoSubmit}
                disabled={autoBrands.length === 0}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-primary-600 text-white rounded-xl hover:from-purple-700 hover:to-primary-700 font-medium text-sm disabled:opacity-50"
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
