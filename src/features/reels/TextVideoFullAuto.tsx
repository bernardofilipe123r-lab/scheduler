import { useState, useEffect } from 'react'
import { Loader2, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDynamicBrands, useNicheConfig } from '@/features/brands'
import { useGenerateTextVideo } from './api/use-text-video'
import type { BrandName } from '@/shared/types'

export function TextVideoFullAuto() {
  const { brandIds, isLoading: brandsLoading } = useDynamicBrands()
  const { data: nicheConfig } = useNicheConfig()
  const generateMutation = useGenerateTextVideo()

  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([])
  const [niche, setNiche] = useState('')
  const [platforms] = useState<string[]>(['instagram'])

  useEffect(() => {
    if (brandIds.length > 0 && selectedBrands.length === 0) {
      setSelectedBrands([...brandIds])
    }
  }, [brandIds, selectedBrands.length])

  const handleGenerate = async () => {
    if (selectedBrands.length === 0) {
      toast.error('Select at least one brand')
      return
    }
    try {
      await generateMutation.mutateAsync({
        mode: 'full_auto',
        brands: selectedBrands,
        platforms,
        niche: niche || undefined,
      })
      toast.success('Full auto text-video generation started!')
    } catch {
      toast.error('Generation failed')
    }
  }

  if (brandsLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="bg-primary-50 border border-primary-200 rounded-xl p-6 text-center">
        <Zap className="w-10 h-10 text-primary-600 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Full Auto Mode</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          We'll discover a trending story in your niche, polish it into viral format,
          source images, compose the slideshow, and create the reel — all automatically.
        </p>
      </div>

      {/* Niche */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Niche</label>
        <input
          value={niche}
          onChange={e => setNiche(e.target.value)}
          placeholder={nicheConfig?.niche_name || 'Your Content DNA niche'}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 outline-none text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">Leave empty to use your Content DNA niche.</p>
      </div>

      {/* Brand Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Brands</label>
        <div className="flex flex-wrap gap-2">
          {brandIds.map(id => (
            <button
              key={id}
              onClick={() => setSelectedBrands(prev =>
                prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
              )}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedBrands.includes(id)
                  ? 'bg-primary-50 border border-primary-300 text-primary-700'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={generateMutation.isPending || selectedBrands.length === 0}
        className="w-full py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
      >
        {generateMutation.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
        ) : (
          <><Zap className="w-4 h-4" /> Generate Full Auto Reel</>
        )}
      </button>
    </div>
  )
}
