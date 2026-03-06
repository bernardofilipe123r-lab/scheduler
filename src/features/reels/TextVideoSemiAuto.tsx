import { useState, useEffect } from 'react'
import { Loader2, Search, Sparkles, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDynamicBrands, useNicheConfig } from '@/features/brands'
import { useDiscoverStories, usePolishStory, useGenerateTextVideo } from './api/use-text-video'
import type { RawStory, PolishedStory } from './types'
import type { BrandName } from '@/shared/types'

export function TextVideoSemiAuto() {
  const { brandIds, isLoading: brandsLoading } = useDynamicBrands()
  const { data: nicheConfig } = useNicheConfig()
  const discoverMutation = useDiscoverStories()
  const polishMutation = usePolishStory()
  const generateMutation = useGenerateTextVideo()

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

  // Set niche from config
  useEffect(() => {
    if (nicheConfig?.niche_name && !niche) {
      setNiche(nicheConfig.niche_name)
    }
  }, [nicheConfig, niche])

  const handleDiscover = async () => {
    if (!niche.trim()) {
      toast.error('Enter a niche/topic to discover stories')
      return
    }
    try {
      const results = await discoverMutation.mutateAsync({ niche, count: 5 })
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
      const result = await polishMutation.mutateAsync({ raw_story: story, niche })
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
      toast.success('Text-video reel generation started!')
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
      <div className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Step 1: Discover Stories</h3>
        <div className="flex gap-2">
          <input
            value={niche}
            onChange={e => setNiche(e.target.value)}
            placeholder="e.g., business, tech, fitness, finance..."
            className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500/50 outline-none text-sm"
            onKeyDown={e => e.key === 'Enter' && handleDiscover()}
          />
          <button
            onClick={handleDiscover}
            disabled={discoverMutation.isPending}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {discoverMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Discover
          </button>
        </div>
      </div>

      {/* Story Results */}
      {stories.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-300">Step 2: Select a Story</h3>
          {stories.map((story, i) => (
            <button
              key={i}
              onClick={() => handleSelectStory(story)}
              disabled={polishMutation.isPending}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                selectedStory === story
                  ? 'border-purple-500/60 bg-purple-500/10'
                  : 'border-gray-700/30 bg-gray-800/30 hover:border-gray-600'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{story.headline}</p>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{story.summary}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-500">{story.source_name}</span>
                    {story.category && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-400">{story.category}</span>}
                  </div>
                </div>
                {selectedStory === story && <Check className="w-4 h-4 text-purple-400 flex-shrink-0 mt-1" />}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Polished Preview */}
      {polished && (
        <div className="bg-gray-800/30 border border-purple-500/20 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-purple-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Polished Story Preview
          </h3>
          <div>
            <p className="text-xs text-gray-400 mb-1">Thumbnail Title</p>
            <p className="text-sm text-white font-bold whitespace-pre-line">{polished.thumbnail_title}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Reel Script</p>
            <div className="space-y-1">
              {polished.reel_lines.map((line, i) => (
                <p key={i} className="text-sm text-gray-300">{line}</p>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Caption</p>
            <p className="text-xs text-gray-300">{polished.caption}</p>
          </div>
          {polished.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {polished.hashtags.map((tag, i) => (
                <span key={i} className="text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">#{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Brand Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Brands</label>
        <div className="flex flex-wrap gap-2">
          {brandIds.map(id => (
            <button
              key={id}
              onClick={() => setSelectedBrands(prev =>
                prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
              )}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedBrands.includes(id)
                  ? 'bg-purple-500/20 border border-purple-500/50 text-purple-300'
                  : 'bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:border-gray-600'
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      {polished && (
        <button
          onClick={handleGenerate}
          disabled={generateMutation.isPending || selectedBrands.length === 0}
          className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
        >
          {generateMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Creating Reel...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Create Text-Video Reel</>
          )}
        </button>
      )}
    </div>
  )
}
