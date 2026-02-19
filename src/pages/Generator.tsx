import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, X } from 'lucide-react'
import igIcon from '@/assets/icons/instagram.png'
import fbIcon from '@/assets/icons/facebook.png'
import ytIcon from '@/assets/icons/youtube.png'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateJob } from '@/features/jobs'
import { useDynamicBrands, useNicheConfig } from '@/features/brands'
import type { BrandName, Variant } from '@/shared/types'

type Platform = 'instagram' | 'facebook' | 'youtube'

const PLATFORMS = [
  { id: 'instagram' as Platform, label: 'Instagram', icon: igIcon },
  { id: 'facebook' as Platform, label: 'Facebook', icon: fbIcon },
  { id: 'youtube' as Platform, label: 'YouTube', icon: ytIcon },
]

export function GeneratorPage() {
  const queryClient = useQueryClient()
  const createJob = useCreateJob()
  const navigate = useNavigate()
  const { brands: dynamicBrands, brandIds } = useDynamicBrands()
  const { data: nicheConfig } = useNicheConfig()
  
  // CTA options from settings (weighted)
  const ctaOptions = (nicheConfig?.cta_options ?? []).filter(o => o.text && o.weight > 0)
  
  // Form state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([])
  const [brandsInitialized, setBrandsInitialized] = useState(false)
  const [variant, setVariant] = useState<Variant>('light')
  
  // Auto-select all brands when they load
  useEffect(() => {
    if (!brandsInitialized && brandIds.length > 0) {
      setSelectedBrands([...brandIds])
      setBrandsInitialized(true)
    }
  }, [brandIds, brandsInitialized])
  const [aiPrompt, setAiPrompt] = useState('')
  const [ctaType, setCtaType] = useState('auto')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['instagram', 'facebook', 'youtube'])
  
  // Loading states
  const [isAutoGenerating, setIsAutoGenerating] = useState(false)
  const [isCreatingJob, setIsCreatingJob] = useState(false)

  // Auto-generate modal state
  const [showAutoModal, setShowAutoModal] = useState(false)
  const [autoCount, setAutoCount] = useState(0)
  const [autoBrands, setAutoBrands] = useState<BrandName[]>([])
  const [autoVariant, setAutoVariant] = useState<Variant>('dark')
  const [autoPlatforms, setAutoPlatforms] = useState<Platform[]>(['instagram', 'facebook', 'youtube'])
  const [autoCtaType, setAutoCtaType] = useState('auto')
  const [imageModel, setImageModel] = useState<string>('ZImageTurbo_INT8')
  
  // Refs for highlighting
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  
  // Toggle brand selection
  const toggleBrand = (brand: BrandName) => {
    setSelectedBrands(prev => 
      prev.includes(brand)
        ? prev.filter(b => b !== brand)
        : [...prev, brand]
    )
  }
  
  // Toggle platform selection
  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms(prev => {
      // Don't allow deselecting if it's the last one
      if (prev.includes(platform) && prev.length === 1) {
        return prev
      }
      return prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    })
  }
  
  // Split a long title into ~equal-length lines
  const balanceTitle = (text: string): string => {
    const words = text.trim().split(/\s+/)
    if (words.length <= 3) return text.trim()
    const total = text.trim().length
    let line1 = ''
    let bestSplit = 0
    let bestDiff = Infinity
    for (let i = 0; i < words.length - 1; i++) {
      line1 += (i > 0 ? ' ' : '') + words[i]
      const diff = Math.abs(line1.length - (total - line1.length - 1))
      if (diff < bestDiff) {
        bestDiff = diff
        bestSplit = i + 1
      }
    }
    return words.slice(0, bestSplit).join(' ') + '\n' + words.slice(bestSplit).join(' ')
  }

  // ── Auto-generate modal helpers ──────────────────────────────────
  const openAutoModal = () => {
    setAutoCount(brandIds.length)
    setAutoBrands([...brandIds])
    setAutoVariant('dark')
    setAutoPlatforms(['instagram', 'facebook', 'youtube'])
    setAutoCtaType('auto')
    setShowAutoModal(true)
  }

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

  const toggleAutoPlatform = (platform: Platform) => {
    setAutoPlatforms(prev => {
      if (prev.includes(platform) && prev.length === 1) return prev
      return prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    })
  }

  const handleAutoSubmit = async () => {
    if (autoBrands.length === 0) {
      toast.error('Select at least one brand')
      return
    }
    setShowAutoModal(false)
    setIsAutoGenerating(true)

    toast.loading(
      (t) => (
        <span className="cursor-pointer" onClick={() => { toast.dismiss(t.id); navigate('/jobs') }}>
          AI is generating viral content... <u>View Jobs →</u>
        </span>
      ),
      { id: 'auto-gen' },
    )

    try {
      // Step 1: Generate content once via AI
      const response = await fetch('/reels/auto-generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to generate content')
      }
      const data = await response.json()

      toast.loading(
        (t) => (
          <span className="cursor-pointer" onClick={() => { toast.dismiss(t.id); navigate('/jobs') }}>
            Creating reel for {autoBrands.length} brand{autoBrands.length > 1 ? 's' : ''}... <u>View Jobs →</u>
          </span>
        ),
        { id: 'auto-gen' },
      )

      // Step 2: Create a single job with all selected brands
      const job = await createJob.mutateAsync({
        title: balanceTitle(data.title),
        content_lines: data.content_lines || [],
        brands: autoBrands,
        variant: autoVariant,
        ai_prompt: data.image_prompt || undefined,
        cta_type: autoCtaType === 'auto' ? undefined : autoCtaType,
        platforms: autoPlatforms,
        image_model: imageModel,
      })

      queryClient.invalidateQueries({ queryKey: ['jobs'] })

      toast.success(
        (t) => (
          <span className="cursor-pointer" onClick={() => { toast.dismiss(t.id); navigate(`/job/${job.id}`) }}>
            Reel generation started for {autoBrands.length} brand{autoBrands.length > 1 ? 's' : ''}! <u>View Job →</u>
          </span>
        ),
        { id: 'auto-gen', duration: 6000 }
      )
    } catch (error) {
      console.error('Auto-generate error:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to auto-generate',
        { id: 'auto-gen' }
      )
    } finally {
      setIsAutoGenerating(false)
    }
  }
  
  // Create job and generate reels
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim()) {
      toast.error('Enter a title')
      return
    }
    
    if (selectedBrands.length === 0) {
      toast.error('Select at least one brand')
      return
    }
    
    const contentLines = content.split('\n').filter(line => line.trim())
    if (contentLines.length === 0) {
      toast.error('Enter at least one content line')
      return
    }
    
    if (selectedPlatforms.length === 0) {
      toast.error('Select at least one platform')
      return
    }
    
    setIsCreatingJob(true)
    try {
      // For dark mode: auto-generate image prompt if user left it blank
      let finalAiPrompt = variant === 'dark' ? aiPrompt : undefined
      if (variant === 'dark' && !aiPrompt.trim()) {
        toast.loading('Auto-generating image prompt...', { id: 'auto-prompt' })
        try {
          const promptResponse = await fetch('/reels/generate-image-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
          })
          if (promptResponse.ok) {
            const promptData = await promptResponse.json()
            if (promptData.image_prompt) {
              finalAiPrompt = promptData.image_prompt
              setAiPrompt(promptData.image_prompt)
              toast.success('Image prompt generated!', { id: 'auto-prompt' })
            }
          }
        } catch (e) {
          console.error('Failed to auto-generate image prompt:', e)
          toast.dismiss('auto-prompt')
        }
      }

      const job = await createJob.mutateAsync({
        title,
        content_lines: contentLines,
        brands: selectedBrands,
        variant,
        ai_prompt: finalAiPrompt || undefined,
        cta_type: ctaType === 'auto' ? undefined : ctaType,
        platforms: selectedPlatforms,
        image_model: imageModel,
        fixed_title: true,
      })
      
      setTitle('')
      setContent('')
      setAiPrompt('')
      
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      
      toast.success(
        (t) => (
          <span className="cursor-pointer" onClick={() => { toast.dismiss(t.id); navigate(`/job/${job.id}`) }}>
            Reel generation started! <u>View Job →</u>
          </span>
        ),
        { duration: 6000 }
      )
      
    } catch (error) {
      console.error('Error creating job:', error)
      toast.error('Failed to start generation')
    } finally {
      setIsCreatingJob(false)
    }
  }
  
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Instagram Reels Generator</h1>
        <p className="text-gray-500 text-sm mt-1">Create viral content for all brands in seconds</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
          {/* ── Left Column ── */}
          <div className="space-y-5 min-w-0">
            {/* Card: Title */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <label htmlFor="title" className="block text-sm font-semibold text-gray-900 mb-2">
                Title
              </label>
              <textarea
                ref={titleRef}
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={2}
                placeholder="e.g., Ultimate Rice Guide"
                required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent resize-none text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">Press Enter to add line breaks in the title</p>
            </div>

            {/* AI Prompt (Dark Mode Only) */}
            {variant === 'dark' && (
              <div className="bg-stone-50 rounded-xl border border-stone-200 p-5">
                <label htmlFor="aiPrompt" className="block text-sm font-semibold text-stone-900 mb-2">
                  ✨ AI Background Prompt
                </label>
                <textarea
                  id="aiPrompt"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={2}
                  placeholder="Leave blank to auto-generate from title, or describe the background..."
                  className="w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent resize-none text-sm"
                />
                <p className="text-xs text-stone-500 mt-1">Optional — leave blank to auto-generate</p>
              </div>
            )}

            {/* Card: Content Lines */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <label htmlFor="content" className="block text-sm font-semibold text-gray-900 mb-2">
                Content Lines
              </label>
              <textarea
                ref={contentRef}
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={`Enter one item per line:\nRice — Always rinse before cooking\nGarlic — Crush for maximum flavor\nPasta — Salt the water generously\nChicken — Let it rest after cooking`}
                required
                rows={7}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent resize-none font-mono text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">One line per item. Use "—" or "-" to separate keyword from description</p>
            </div>
          </div>

          {/* ── Right Column: Settings ── */}
          <div className="space-y-4">
            {/* Card: Variant + Image Model + CTA + Platforms — all in one */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              {/* Variant + Image Model side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Variant</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setVariant('light')}
                      className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                        variant === 'light'
                          ? 'border-stone-800 bg-stone-900 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      ☀️ Light
                    </button>
                    <button
                      type="button"
                      onClick={() => setVariant('dark')}
                      className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                        variant === 'dark'
                          ? 'border-stone-800 bg-stone-900 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      🌙 Dark
                    </button>
                  </div>
                </div>
                <div className={variant === 'light' && !selectedPlatforms.includes('youtube') ? 'opacity-40 pointer-events-none' : ''}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI Image Model</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
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
                      type="button"
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

              <div className="border-t border-gray-100" />

              {/* CTA */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Call-to-Action</label>
                <select
                  id="ctaType"
                  value={ctaType}
                  onChange={(e) => setCtaType(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent bg-white text-gray-900 text-sm"
                >
                  <option value="auto">🎲 Auto (weighted random)</option>
                  {ctaOptions.map((cta, i) => (
                    <option key={i} value={cta.text}>{cta.text}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  {ctaOptions.length > 0
                    ? `${ctaOptions.length} CTA(s) — "Auto" picks by weight`
                    : 'No CTAs configured yet'}
                </p>
              </div>

              <div className="border-t border-gray-100" />

              {/* Platforms — icon buttons */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Publish To</label>
                <div className="flex gap-2">
                  {PLATFORMS.map(({ id, label, icon }) => {
                    const active = selectedPlatforms.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => togglePlatform(id)}
                        className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg border transition-all ${
                          active
                            ? 'border-green-300 bg-green-50'
                            : 'border-gray-200 hover:bg-gray-50 opacity-40'
                        }`}
                      >
                        <img src={icon} alt={label} className="h-5 w-auto" />
                        <span className="text-[10px] font-medium text-gray-700">{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Card: Brands — 2-column grid */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Brands</label>
              <div className="grid grid-cols-2 gap-2">
                {dynamicBrands.map(brand => {
                  const active = selectedBrands.includes(brand.id)
                  return (
                    <label
                      key={brand.id}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all border ${
                        active
                          ? 'border-stone-300 bg-stone-50'
                          : 'border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleBrand(brand.id)}
                      />
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: brand.color || '#999' }}
                      />
                      <span className="text-xs font-medium text-gray-800 truncate">{brand.label}</span>
                    </label>
                  )
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Each brand has its own independent schedule</p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5">
              <button
                type="submit"
                disabled={isCreatingJob}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-stone-900 text-white font-medium rounded-xl hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {isCreatingJob ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                ) : (
                  <>🎬 Generate Reels</>
                )}
              </button>
              <button
                type="button"
                onClick={openAutoModal}
                disabled={isAutoGenerating}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-stone-700 text-white font-medium rounded-xl hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {isAutoGenerating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                ) : (
                  <>🤖 Auto-Generate Viral Reel</>
                )}
              </button>
              <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                💡 <strong>Auto-Generate</strong> uses AI to create a complete viral reel from scratch
              </p>
            </div>
          </div>
        </div>
      </form>

      {/* Auto Generate Modal */}
      {showAutoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">🤖 Auto-Generate Viral Reel</h2>
              <button
                onClick={() => setShowAutoModal(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Variant + Image Model row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Variant</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAutoVariant('light')}
                      className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                        autoVariant === 'light'
                          ? 'border-stone-800 bg-stone-900 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      ☀️ Light
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoVariant('dark')}
                      className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                        autoVariant === 'dark'
                          ? 'border-stone-800 bg-stone-900 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      🌙 Dark
                    </button>
                  </div>
                </div>
                <div className={autoVariant === 'light' && !autoPlatforms.includes('youtube') ? 'opacity-40 pointer-events-none' : ''}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Image Model</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setImageModel('ZImageTurbo_INT8')}
                      className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                        imageModel === 'ZImageTurbo_INT8'
                          ? 'border-stone-800 bg-stone-900 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      ✨ Quality
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageModel('Flux1schnell')}
                      className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                        imageModel === 'Flux1schnell'
                          ? 'border-stone-800 bg-stone-900 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      ⚡ Fast
                    </button>
                  </div>
                </div>
              </div>

              {/* Brand count + CTA row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">How many brands?</label>
                  <div className="flex gap-2">
                    {brandIds.map((_, i) => {
                      const count = i + 1
                      return (
                        <button
                          key={count}
                          type="button"
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
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Call-to-Action</label>
                  <select
                    value={autoCtaType}
                    onChange={(e) => setAutoCtaType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                  >
                    <option value="auto">🎲 Auto</option>
                    {ctaOptions.map((cta, i) => (
                      <option key={i} value={cta.text}>{cta.text}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Brands */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Select brands</label>
                <div className="grid grid-cols-2 gap-2">
                  {dynamicBrands.map((brand) => {
                    const checked = autoBrands.includes(brand.id)
                    return (
                      <label
                        key={brand.id}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all border ${
                          checked
                            ? 'border-stone-300 bg-stone-50'
                            : 'border-gray-100 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAutoBrand(brand.id)}
                        />
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: brand.color || '#999' }}
                        />
                        <span className="text-sm font-medium text-gray-700">{brand.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Platforms — icon buttons */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Publish To</label>
                <div className="flex gap-2">
                  {PLATFORMS.map(({ id, label, icon }) => {
                    const active = autoPlatforms.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleAutoPlatform(id)}
                        className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg border transition-all ${
                          active
                            ? 'border-green-300 bg-green-50'
                            : 'border-gray-200 hover:bg-gray-50 opacity-40'
                        }`}
                      >
                        <img src={icon} alt={label} className="h-5 w-auto" />
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
                type="button"
                onClick={() => setShowAutoModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
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
