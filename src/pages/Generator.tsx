import { useState, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateJob } from '@/features/jobs'
import { ALL_BRANDS, BRAND_CONFIG } from '@/features/brands'
import type { BrandName, Variant } from '@/shared/types'

const CTA_TYPES = [
  { id: 'follow_tips', label: '👉 Follow for more healthy tips' },
  { id: 'sleep_lean', label: '💬 Comment LEAN - Sleep Lean product' },
  { id: 'workout_plan', label: '💬 Comment PLAN - Workout & nutrition plan' },
]

const PLATFORMS = [
  { id: 'instagram', label: '📸 Instagram', icon: '📸' },
  { id: 'facebook', label: '📘 Facebook', icon: '📘' },
  { id: 'youtube', label: '📺 YouTube', icon: '📺' },
] as const

type Platform = typeof PLATFORMS[number]['id']

export function GeneratorPage() {
  const queryClient = useQueryClient()
  const createJob = useCreateJob()
  
  // Form state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([...ALL_BRANDS])
  const [variant, setVariant] = useState<Variant>('light')
  const [aiPrompt, setAiPrompt] = useState('')
  const [ctaType, setCtaType] = useState('follow_tips')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['instagram', 'facebook', 'youtube'])
  
  // Loading states
  const [isAutoGenerating, setIsAutoGenerating] = useState(false)
  const [isCreatingJob, setIsCreatingJob] = useState(false)
  
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
  
  // Auto-generate viral content using AI
  const handleAutoGenerate = async () => {
    setIsAutoGenerating(true)
    
    try {
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
      
      setTitle(data.title)
      setContent(data.content_lines.join('\n'))
      
      if (data.image_prompt) {
        setAiPrompt(data.image_prompt)
        setVariant('dark')
      }
      
      const topicInfo = data.topic_category ? ` (${data.topic_category})` : ''
      const formatInfo = data.format_style ? ` - ${data.format_style} style` : ''
      toast.success(`🎉 "${data.title}"${topicInfo}${formatInfo}`, { duration: 8000 })
      
      titleRef.current?.classList.add('highlight-pulse')
      contentRef.current?.classList.add('highlight-pulse')
      setTimeout(() => {
        titleRef.current?.classList.remove('highlight-pulse')
        contentRef.current?.classList.remove('highlight-pulse')
      }, 500)
      
    } catch (error) {
      console.error('Auto-generate error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate content')
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
        cta_type: ctaType,
        platforms: selectedPlatforms,
      })
      
      setTitle('')
      setContent('')
      setAiPrompt('')
      
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      
      toast.success(
        `✅ Job ${job.id.slice(0, 8)}... created and processing!`,
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
        <h1 className="text-3xl font-bold text-gray-900">📱 Instagram Reels Generator</h1>
        <p className="text-gray-500 mt-1">Create viral content for all brands in minutes</p>
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
            <p className="text-xs text-gray-500 mt-2">Light: 12AM, 8AM, 4PM<br/>Dark: 4AM, 12PM, 8PM</p>
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
        
        {/* Brands & CTA Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Brands */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Brands</label>
            <div className="grid grid-cols-2 gap-3">
              {ALL_BRANDS.map(brandId => {
                const brand = BRAND_CONFIG[brandId]
                return (
                  <label 
                    key={brandId} 
                    className="flex items-center p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
                  >
                    <input 
                      type="checkbox" 
                      checked={selectedBrands.includes(brandId)}
                      onChange={() => toggleBrand(brandId)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    /> 
                    <span className="ml-3 text-sm font-medium text-gray-900">{brand.label}</span>
                  </label>
                )
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">Each brand has its own independent schedule</p>
          </div>
          
          {/* CTA Type */}
          <div>
            <label htmlFor="ctaType" className="block text-sm font-medium text-gray-700 mb-3">
              Call-to-Action
            </label>
            <select
              id="ctaType"
              value={ctaType}
              onChange={(e) => setCtaType(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
            >
              {CTA_TYPES.map(cta => (
                <option key={cta.id} value={cta.id}>{cta.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">Select the call-to-action for the caption</p>
          </div>
        </div>
        
        {/* Platforms */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Publish To</label>
          <div className="flex flex-wrap gap-3">
            {PLATFORMS.map(platform => (
              <label 
                key={platform.id} 
                className={`flex items-center px-4 py-3 border-2 rounded-lg cursor-pointer transition-colors ${
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
                <span className="ml-2 text-sm font-medium text-gray-900">{platform.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">Select at least one platform. YouTube requires a connected channel.</p>
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
            onClick={handleAutoGenerate}
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
    </div>
  )
}
