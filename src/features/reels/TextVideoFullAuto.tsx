import { useState, useEffect } from 'react'
import { Loader2, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDynamicBrands, useNicheConfig } from '@/features/brands'
import { useGenerateTextVideo } from './api/use-text-video'
import type { BrandName } from '@/shared/types'

export function TextVideoFullAuto() {
  const { brandIds, isLoading: brandsLoading } = useDynamicBrands()
  const { data: nicheConfig, isLoading: nicheLoading } = useNicheConfig()
  const generateMutation = useGenerateTextVideo()

  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([])
  const [platforms] = useState<string[]>(['instagram'])

  // Derive niche from Content DNA
  const niche = nicheConfig?.niche_name || ''

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
    if (!niche) {
      toast.error('Set up your Content DNA first (niche is required)')
      return
    }
    try {
      await generateMutation.mutateAsync({
        mode: 'full_auto',
        brands: selectedBrands,
        platforms,
        niche,
      })
      toast.success('Full auto text-video generation started!')
    } catch {
      toast.error('Generation failed')
    }
  }

  if (brandsLoading || nicheLoading) {
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

      {/* Niche — read-only, derived from Content DNA */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Niche</label>
        {niche ? (
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
            <span className="text-sm text-gray-900">{niche}</span>
            <span className="text-[10px] text-gray-400 ml-auto">from Content DNA</span>
          </div>
        ) : (
          <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            No niche configured. Go to <span className="font-medium">Brands → Content DNA</span> to set it up.
          </div>
        )}
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
