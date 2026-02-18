import { useState, useRef, useEffect } from 'react'
import { Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateJob } from '@/features/jobs'
import { useDynamicBrands, useNicheConfig } from '@/features/brands'
import type { BrandName, Variant } from '@/shared/types'

const PLATFORMS = [
  { id: 'instagram', label: '📸 Instagram', icon: '📸' },
  { id: 'facebook', label: '📘 Facebook', icon: '📘' },
  { id: 'youtube', label: '📺 YouTube', icon: '📺' },
] as const

type Platform = typeof PLATFORMS[number]['id']

export function GeneratorPage() {
  const queryClient = useQueryClient()
  const createJob = useCreateJob()
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

    const total = autoBrands.length
    toast.loading(`AI is generating ${total} unique viral reel${total > 1 ? 's' : ''}...`, { id: 'auto-gen' })

    try {
      let created = 0
      let failed = 0

      for (const brand of autoBrands) {
        toast.loading(`Generating content ${created + failed + 1}/${total}...`, { id: 'auto-gen' })

        try {
          // Generate unique content for this brand
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

          // Create a separate job for this brand with its unique content
          await createJob.mutateAsync({
            title: balanceTitle(data.title),
            content_lines: data.content_lines || [],
            brands: [brand],
            variant: autoVariant,
            ai_prompt: data.image_prompt || undefined,
            cta_type: autoCtaType === 'auto' ? undefined : autoCtaType,
            platforms: autoPlatforms,
            image_model: imageModel,
          })
          created++
        } catch (err) {
          console.error(`Auto-generate failed for ${brand}:`, err)
          failed++
        }
      }

      queryClient.invalidateQueries({ queryKey: ['jobs'] })

      if (created === total) {
        toast.success(
          `${total} unique reel${total > 1 ? 's' : ''} created! Check Jobs for progress.`,
          { id: 'auto-gen', duration: 6000 }
        )
      } else if (created > 0) {
        toast.success(
          `${created}/${total} reels created. ${failed} failed.`,
          { id: 'auto-gen', duration: 6000 }
        )
      } else {
        toast.error('All reel generations failed.', { id: 'auto-gen' })
      }
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

      await createJob.mutateAsync({
        title,
        content_lines: contentLines,
        brands: selectedBrands,
        variant,
        ai_prompt: finalAiPrompt || undefined,
        cta_type: ctaType === 'auto' ? undefined : ctaType,
        platforms: selectedPlatforms,
        image_model: imageModel,
      })
      
      setTitle('')
      setContent('')
      setAiPrompt('')
      
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      
      toast.success(
        'Reel generation started! Check Jobs for progress.',
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
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Instagram Reels Generator</h1>
        <p className="text-gray-500 mt-1">Create viral content for all brands in seconds</p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title & Variant Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Title - Takes 2 columns */}
          <div className="lg:col-span-2">
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Title
            </label>
            <textarea
              ref={titleRef}
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={3}
              placeholder="e.g., Ultimate Rice Guide"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">Press Enter to add line breaks in the title</p>
          </div>
          
          {/* Variant - Takes 1 column */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Variant</label>
            <div className="space-y-3">
              <label className="flex items-center p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-300 transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                <input 
                  type="radio" 
                  name="variant" 
                  value="light"
                  checked={variant === 'light'}
                  onChange={() => setVariant('light')}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                /> 
                <span className="ml-3 text-sm font-medium text-gray-900">☀️ Light Mode</span>
              </label>
              <label className="flex items-center p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-purple-300 transition-colors has-[:checked]:border-purple-500 has-[:checked]:bg-purple-50">
                <input 
                  type="radio" 
                  name="variant" 
                  value="dark"
                  checked={variant === 'dark'}
                  onChange={() => setVariant('dark')}
                  className="w-4 h-4 text-purple-600 border-gray-300 focus:ring-purple-500"
                /> 
                <span className="ml-3 text-sm font-medium text-gray-900">🌙 Dark Mode</span>
              </label>
            </div>
          </div>

        </div>

        {/* AI Prompt (Dark Mode Only) */}
        {variant === 'dark' && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <label htmlFor="aiPrompt" className="block text-sm font-medium text-purple-900 mb-2">
              ✨ AI Background Prompt
            </label>
            <textarea
              id="aiPrompt"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={3}
              placeholder="Leave blank to auto-generate from title, or describe the background..."
              className="w-full px-4 py-3 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
            <p className="text-xs text-purple-700 mt-1">Optional: Leave blank to auto-generate, or customize the AI-generated background</p>
          </div>
        )}

        {/* Model + CTA & Platforms Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Image Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">AI Image Model</label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                <input
                  type="radio"
                  name="imageModel"
                  value="ZImageTurbo_INT8"
                  checked={imageModel === 'ZImageTurbo_INT8'}
                  onChange={() => setImageModel('ZImageTurbo_INT8')}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <div className="ml-3">
                  <span className="text-sm font-medium text-gray-900">✨ High Quality</span>
                  <p className="text-[10px] text-gray-400">ZImageTurbo · Better detail</p>
                </div>
              </label>
              <label className="flex items-center p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                <input
                  type="radio"
                  name="imageModel"
                  value="Flux1schnell"
                  checked={imageModel === 'Flux1schnell'}
                  onChange={() => setImageModel('Flux1schnell')}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <div className="ml-3">
                  <span className="text-sm font-medium text-gray-900">⚡ Fast</span>
                  <p className="text-[10px] text-gray-400">Flux Schnell · Cheaper</p>
                </div>
              </label>
            </div>
          </div>

          {/* CTA + Platforms */}
          <div>
            <label htmlFor="ctaType" className="block text-sm font-medium text-gray-700 mb-2">
              Call-to-Action
            </label>
            <select
              id="ctaType"
              value={ctaType}
              onChange={(e) => setCtaType(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
            >
              <option value="auto">🎲 Auto (weighted random from settings)</option>
              {ctaOptions.map((cta, i) => (
                <option key={i} value={cta.text}>{cta.text}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {ctaOptions.length > 0
                ? `${ctaOptions.length} CTA(s) configured — "Auto" picks randomly by weight`
                : 'No CTAs configured — add in Brand Settings → Content DNA'}
            </p>

            {/* Platforms inline under CTA */}
            <label className="block text-sm font-medium text-gray-700 mt-4 mb-2">Publish To</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(platform => (
                <label 
                  key={platform.id} 
                  className={`flex items-center px-3 py-2 border-2 rounded-lg cursor-pointer text-sm transition-colors ${
                    selectedPlatforms.includes(platform.id)
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedPlatforms.includes(platform.id)}
                    onChange={() => togglePlatform(platform.id)}
                    className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                  /> 
                  <span className="ml-2 font-medium text-gray-900">{platform.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Brands — full width row */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Brands</label>
          <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
            {dynamicBrands.map(brand => (
                <label 
                  key={brand.id} 
                  className="flex items-center p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
                >
                  <input 
                    type="checkbox" 
                    checked={selectedBrands.includes(brand.id)}
                    onChange={() => toggleBrand(brand.id)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  /> 
                  <span className="ml-3 text-sm font-medium text-gray-900">{brand.label}</span>
                </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">Each brand has its own independent schedule</p>
        </div>
        
        {/* Content Lines */}
        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
            Content Lines
          </label>
          <textarea
            ref={contentRef}
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`Enter one item per line:
Rice — Always rinse before cooking
Garlic — Crush for maximum flavor
Pasta — Salt the water generously
Chicken — Let it rest after cooking`}
            required
            rows={8}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">Enter one line per item. Use "—" or "-" to separate keyword from description</p>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            type="submit" 
            disabled={isCreatingJob}
            className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isCreatingJob ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                🎬 Generate Reels
              </>
            )}
          </button>
          <button 
            type="button" 
            onClick={openAutoModal}
            disabled={isAutoGenerating}
            className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isAutoGenerating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                🤖 Auto-Generate Viral Reel
              </>
            )}
          </button>
        </div>
        <p className="text-sm text-gray-600 text-center">
          💡 <strong>Auto-Generate</strong> uses AI to create a complete viral reel (title, content & image prompt) from scratch!
        </p>
      </form>

      {/* Auto Generate Modal */}
      {showAutoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">🤖 Auto-Generate Viral Reel</h2>
              <button
                onClick={() => setShowAutoModal(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {/* Variant */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Variant</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setAutoVariant('light')}
                    className={`flex-1 p-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      autoVariant === 'light'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    ☀️ Light
                  </button>
                  <button
                    onClick={() => setAutoVariant('dark')}
                    className={`flex-1 p-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      autoVariant === 'dark'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    🌙 Dark
                  </button>
                </div>
              </div>

              {/* AI Image Model */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">AI Image Model</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setImageModel('ZImageTurbo_INT8')}
                    className={`flex-1 p-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      imageModel === 'ZImageTurbo_INT8'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    ✨ High Quality
                  </button>
                  <button
                    onClick={() => setImageModel('Flux1schnell')}
                    className={`flex-1 p-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      imageModel === 'Flux1schnell'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    ⚡ Fast
                  </button>
                </div>
              </div>

              {/* Brand count selector */}
              <div>
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

              {/* CTA */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Call-to-Action</label>
                <select
                  value={autoCtaType}
                  onChange={(e) => setAutoCtaType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="auto">🎲 Auto (weighted random)</option>
                  {ctaOptions.map((cta, i) => (
                    <option key={i} value={cta.text}>{cta.text}</option>
                  ))}
                </select>
              </div>

              {/* Brand checkboxes — spans full width */}
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Select brands</label>
                <div className="grid grid-cols-2 gap-2">
                  {dynamicBrands.map((brand) => {
                    const checked = autoBrands.includes(brand.id)
                    return (
                      <label
                        key={brand.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all border ${
                          checked
                            ? 'border-purple-200 bg-purple-50'
                            : 'border-gray-100 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAutoBrand(brand.id)}
                          className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: brand.color || '#999' }}
                        />
                        <span className="text-sm font-medium text-gray-700">{brand.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Platforms — spans full width */}
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Publish To</label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map(platform => (
                    <label
                      key={platform.id}
                      className={`flex items-center px-3 py-2 border-2 rounded-lg cursor-pointer text-sm transition-colors ${
                        autoPlatforms.includes(platform.id)
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={autoPlatforms.includes(platform.id)}
                        onChange={() => toggleAutoPlatform(platform.id)}
                        className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                      />
                      <span className="ml-2 font-medium text-gray-900">{platform.label}</span>
                    </label>
                  ))}
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
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 font-medium text-sm disabled:opacity-50"
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
