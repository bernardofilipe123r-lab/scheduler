import { useState, useEffect } from 'react'
import { Loader2, Upload, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDynamicBrands } from '@/features/brands'
import { useGenerateTextVideo } from './api/use-text-video'
import type { BrandName } from '@/shared/types'

export function TextVideoManual() {
  const { brandIds, isLoading: brandsLoading } = useDynamicBrands()
  const generateMutation = useGenerateTextVideo()

  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([])
  const [thumbnailTitle, setThumbnailTitle] = useState('')
  const [reelText, setReelText] = useState('')
  const [imageQueries, setImageQueries] = useState<string[]>(['', '', ''])
  const [platforms] = useState<string[]>(['instagram'])

  // Auto-select all brands on load
  useEffect(() => {
    if (brandIds.length > 0 && selectedBrands.length === 0) {
      setSelectedBrands([...brandIds])
    }
  }, [brandIds, selectedBrands.length])

  const handleGenerate = async () => {
    if (!thumbnailTitle.trim() || !reelText.trim()) {
      toast.error('Title and reel text are required')
      return
    }
    if (selectedBrands.length === 0) {
      toast.error('Select at least one brand')
      return
    }

    const reel_lines = reelText.split('\n').filter(l => l.trim())
    const queries = imageQueries.filter(q => q.trim())

    try {
      await generateMutation.mutateAsync({
        mode: 'manual',
        brands: selectedBrands,
        platforms,
        thumbnail_title: thumbnailTitle,
        reel_lines,
        image_queries: queries.length > 0 ? queries : undefined,
      })
      toast.success('Text-video reel generation started!')
      setThumbnailTitle('')
      setReelText('')
      setImageQueries(['', '', ''])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      toast.error(message)
    }
  }

  const addImageQuery = () => setImageQueries(prev => [...prev, ''])
  const removeImageQuery = (idx: number) => setImageQueries(prev => prev.filter((_, i) => i !== idx))
  const updateImageQuery = (idx: number, val: string) => {
    setImageQueries(prev => prev.map((q, i) => i === idx ? val : q))
  }

  if (brandsLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  return (
    <div className="space-y-6">
      {/* Thumbnail Title */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Thumbnail Title</label>
        <textarea
          value={thumbnailTitle}
          onChange={e => setThumbnailTitle(e.target.value)}
          placeholder={"ELON MUSK\nJUST BOUGHT\nTIKTOK"}
          rows={3}
          className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 outline-none text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">ALL CAPS, one line per row (max 4 lines)</p>
      </div>

      {/* Reel Text */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Reel Script</label>
        <textarea
          value={reelText}
          onChange={e => setReelText(e.target.value)}
          placeholder={"In a move nobody saw coming...\nElon Musk just acquired TikTok for $50 billion.\nThis could reshape social media forever.\nHere's what it means for creators..."}
          rows={5}
          className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 outline-none text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">One line per row. Each line shows as a text overlay on the slideshow.</p>
      </div>

      {/* Image Queries */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-300">Image Search Queries</label>
          <button onClick={addImageQuery} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        <div className="space-y-2">
          {imageQueries.map((q, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={q}
                onChange={e => updateImageQuery(i, e.target.value)}
                placeholder={`Image ${i + 1} search query...`}
                className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500/50 outline-none text-sm"
              />
              {imageQueries.length > 1 && (
                <button onClick={() => removeImageQuery(i)} className="text-gray-500 hover:text-red-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">We'll search for images matching these queries. Leave empty for AI-generated images.</p>
      </div>

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
      <button
        onClick={handleGenerate}
        disabled={generateMutation.isPending || !thumbnailTitle.trim() || !reelText.trim()}
        className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
      >
        {generateMutation.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
        ) : (
          <><Upload className="w-4 h-4" /> Generate Text-Video Reel</>
        )}
      </button>
    </div>
  )
}
