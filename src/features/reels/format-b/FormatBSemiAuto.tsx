import { useState, useEffect } from 'react'
import { Loader2, Search, Sparkles, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDynamicBrands, useNicheConfig } from '@/features/brands'
import { useDiscoverStories, usePolishStory, useGenerateFormatB } from '../api/use-format-b'
import type { RawStory, PolishedStory } from '../types'
import type { BrandName } from '@/shared/types'

export function FormatBSemiAuto() {
  const { brands: dynamicBrands, brandIds, isLoading: brandsLoading } = useDynamicBrands()
  const { data: nicheConfig } = useNicheConfig()
  const discoverMutation = useDiscoverStories()
  const polishMutation = usePolishStory()
  const generateMutation = useGenerateFormatB()

  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([])
  const [stories, setStories] = useState<RawStory[]>([])
  const [selectedStory, setSelectedStory] = useState<RawStory | null>(null)
  const [polished, setPolished] = useState<PolishedStory | null>(null)
  const [niche, setNiche] = useState('')
  const [platforms] = useState<string[]>(['instagram'])

  // Auto-select all brands on load
  useEffect(() => {
    if (brandIds.length > 0 && selectedBrands.length === 0) {
      setSelectedBrands([...brandIds])
    }
  }, [brandIds, selectedBrands.length])

  const handleDiscover = async () => {
    const effectiveNiche = niche.trim() || nicheConfig?.niche_name || ''
    if (!effectiveNiche) {
      toast.error('Enter a niche/topic to discover stories')
      return
    }
    try {
      const results = await discoverMutation.mutateAsync({ niche: effectiveNiche, count: 5 })
      setStories(results)
      setSelectedStory(null)
      setPolished(null)
      if (results.length === 0) toast('No stories found. Try a different niche.')
    } catch {
      toast.error('Failed to discover stories')
    }
  }

  const handleSelectStory = async (story: RawStory) => {
    setSelectedStory(story)
    try {
      const result = await polishMutation.mutateAsync({ raw_story: story, niche: niche || nicheConfig?.niche_name || '' })
      setPolished(result)
    } catch {
      toast.error('Failed to polish story')
    }
  }

  const handleGenerate = async () => {
    if (!selectedStory || selectedBrands.length === 0) return

    try {
      await generateMutation.mutateAsync({
        mode: 'semi_auto',
        brands: selectedBrands,
        platforms,
        raw_story: selectedStory,
      })
      toast.success('Format B reel generation started!')
      setStories([])
      setSelectedStory(null)
      setPolished(null)
    } catch {
      toast.error('Generation failed')
    }
  }

  if (brandsLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Discover */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Step 1: Discover Stories</h3>
        <div className="flex gap-2">
          <input
            value={niche}
            onChange={e => setNiche(e.target.value)}
            placeholder={nicheConfig?.niche_name || 'e.g., business, tech, fitness, finance...'}
            className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-primary-500 outline-none text-sm"
            onKeyDown={e => e.key === 'Enter' && handleDiscover()}
          />
          <button
            onClick={handleDiscover}
            disabled={discoverMutation.isPending}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {discoverMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Discover
          </button>
        </div>
      </div>

      {/* Story Results */}
      {stories.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">Step 2: Select a Story</h3>
          {stories.map((story, i) => (
            <button
              key={i}
              onClick={() => handleSelectStory(story)}
              disabled={polishMutation.isPending}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                selectedStory === story
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 font-medium truncate">{story.headline}</p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{story.summary}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-400">{story.source_name}</span>
                    {story.category && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{story.category}</span>}
                  </div>
                </div>
                {selectedStory === story && <Check className="w-4 h-4 text-primary-600 flex-shrink-0 mt-1" />}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Polished Preview */}
      {polished && (
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-primary-700 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Polished Story Preview
          </h3>
          <div>
            <p className="text-xs text-gray-500 mb-1">Thumbnail Title</p>
            <p className="text-sm text-gray-900 font-bold whitespace-pre-line">{polished.thumbnail_title}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Reel Script</p>
            <div className="space-y-1">
              {polished.reel_lines.map((line, i) => (
                <p key={i} className="text-sm text-gray-700">{line}</p>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Caption</p>
            <p className="text-xs text-gray-700">{polished.caption}</p>
          </div>
          {polished.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {polished.hashtags.map((tag, i) => (
                <span key={i} className="text-[10px] text-primary-600 bg-primary-100 px-1.5 py-0.5 rounded">#{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Brand Selection */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Brands</label>
        <div className="grid grid-cols-2 gap-2">
          {dynamicBrands.map(brand => {
            const active = selectedBrands.includes(brand.id)
            return (
              <label
                key={brand.id}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all border ${
                  active ? 'border-stone-300 bg-stone-50' : 'border-gray-100 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => setSelectedBrands(prev =>
                    prev.includes(brand.id) ? prev.filter(b => b !== brand.id) : [...prev, brand.id]
                  )}
                  className="accent-stone-800"
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
      </div>

      {/* Generate Button */}
      {polished && (
        <button
          onClick={handleGenerate}
          disabled={generateMutation.isPending || selectedBrands.length === 0}
          className="w-full py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors text-sm"
        >
          {generateMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Creating Reel...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Create Format B Reel</>
          )}
        </button>
      )}
    </div>
  )
}
