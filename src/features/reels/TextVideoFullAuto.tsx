import { useState, useEffect } from 'react'
import { Loader2, Zap, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDynamicBrands, useNicheConfig } from '@/features/brands'
import { useGenerateTextVideo } from './api/use-text-video'
import type { BrandName } from '@/shared/types'

export function TextVideoFullAuto() {
  const { brands: dynamicBrands, brandIds, isLoading: brandsLoading } = useDynamicBrands()
  const { data: nicheConfig, isLoading: nicheLoading } = useNicheConfig()
  const generateMutation = useGenerateTextVideo()

  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([])
  const [platforms] = useState<string[]>(['instagram'])

  // Derive niche from Content DNA
  const niche = nicheConfig?.niche_name || ''
  const nicheReady = !!niche

  useEffect(() => {
    if (brandIds.length > 0 && selectedBrands.length === 0) {
      setSelectedBrands([...brandIds])
    }
  }, [brandIds, selectedBrands.length])

  const toggleBrand = (id: BrandName) => {
    setSelectedBrands(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id])
  }

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
    <div className="space-y-5">
      {/* Hero banner — compact horizontal layout */}
      <div className={`rounded-xl border p-4 flex items-start gap-4 ${nicheReady ? 'bg-stone-50 border-stone-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className={`p-2.5 rounded-lg flex-shrink-0 ${nicheReady ? 'bg-stone-900' : 'bg-gray-300'}`}>
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Full Auto Mode</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            We'll discover a trending story in your niche, polish it into viral format, source images, compose the slideshow, and create the reel — all automatically.
          </p>
        </div>
      </div>

      {/* Niche — read-only, derived from Content DNA */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Niche</label>
        {nicheReady ? (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-lg">
            <span className="text-sm text-gray-900 font-medium">{niche}</span>
            <span className="text-[10px] text-gray-400 ml-auto">from Content DNA</span>
          </div>
        ) : (
          <div className="flex items-start gap-3 px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">
              No niche configured. Go to <span className="font-medium">Brands → Content DNA</span> to set it up before using Full Auto mode.
            </p>
          </div>
        )}
      </div>

      {/* Brand Selection — dimmed when niche is not configured */}
      <div className={!nicheReady ? 'opacity-40 pointer-events-none select-none' : ''}>
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
                  onChange={() => toggleBrand(brand.id)}
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
      <button
        onClick={handleGenerate}
        disabled={generateMutation.isPending || selectedBrands.length === 0 || !nicheReady}
        className="w-full py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors text-sm"
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
