import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Upload, X, ImagePlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDynamicBrands } from '@/features/brands'
import { useGenerateFormatB, useUploadImages } from '../api/use-format-b'
import type { BrandName } from '@/shared/types'

const MAX_IMAGES = 10

export function FormatBManual() {
  const { brands: dynamicBrands, brandIds, isLoading: brandsLoading } = useDynamicBrands()
  const generateMutation = useGenerateFormatB()
  const uploadMutation = useUploadImages()

  const [selectedBrands, setSelectedBrands] = useState<BrandName[]>([])
  const [thumbnailTitle, setThumbnailTitle] = useState('')
  const [reelText, setReelText] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [platforms] = useState<string[]>(['instagram'])
  const fileRef = useRef<HTMLInputElement>(null)

  // Auto-select all brands on load
  useEffect(() => {
    if (brandIds.length > 0 && selectedBrands.length === 0) {
      setSelectedBrands([...brandIds])
    }
  }, [brandIds, selectedBrands.length])

  // Generate preview URLs
  useEffect(() => {
    const urls = images.map(f => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [images])

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (arr.length === 0) return
    setImages(prev => {
      const combined = [...prev, ...arr]
      if (combined.length > MAX_IMAGES) {
        toast.error(`Maximum ${MAX_IMAGES} images`)
        return combined.slice(0, MAX_IMAGES)
      }
      return combined
    })
  }, [])

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx))

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const handleGenerate = async () => {
    if (!thumbnailTitle.trim() || !reelText.trim()) {
      toast.error('Title and reel text are required')
      return
    }
    if (images.length === 0) {
      toast.error('Upload at least one image')
      return
    }
    if (selectedBrands.length === 0) {
      toast.error('Select at least one brand')
      return
    }

    try {
      // 1. Upload images to server
      const paths = await uploadMutation.mutateAsync(images)

      // 2. Generate reel with the returned paths
      await generateMutation.mutateAsync({
        mode: 'manual',
        brands: selectedBrands,
        platforms,
        thumbnail_title: thumbnailTitle,
        reel_lines: reelText.split('\n').filter(l => l.trim()),
        image_paths: paths,
      })
      toast.success('Format B reel generation started!')
      setThumbnailTitle('')
      setReelText('')
      setImages([])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      toast.error(message)
    }
  }

  const busy = uploadMutation.isPending || generateMutation.isPending

  if (brandsLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  return (
    <div className="space-y-6">
      {/* Thumbnail Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Thumbnail Title</label>
        <textarea
          value={thumbnailTitle}
          onChange={e => setThumbnailTitle(e.target.value)}
          placeholder={"ELON MUSK\nJUST BOUGHT\nTIKTOK"}
          rows={3}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 outline-none text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">ALL CAPS, one line per row (max 4 lines)</p>
      </div>

      {/* Reel Text */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Reel Script</label>
        <textarea
          value={reelText}
          onChange={e => setReelText(e.target.value)}
          placeholder={"In a move nobody saw coming...\nElon Musk just acquired TikTok for $50 billion.\nThis could reshape social media forever.\nHere's what it means for creators..."}
          rows={5}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 outline-none text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">One line per row. Each line shows as a text overlay on the slideshow.</p>
      </div>

      {/* Image Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Images <span className="text-gray-400 font-normal">({images.length}/{MAX_IMAGES})</span>
        </label>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors"
        >
          <ImagePlus className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Click or drag images here</p>
          <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP — up to 10 images, 10 MB each</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={e => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {/* Thumbnails */}
        {previews.length > 0 && (
          <div className="grid grid-cols-5 gap-2 mt-3">
            {previews.map((url, i) => (
              <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                <img src={url} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
                <span className="absolute bottom-1 left-1 text-[10px] bg-black/50 text-white px-1 rounded">{i + 1}</span>
              </div>
            ))}
          </div>
        )}
      </div>

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
      <button
        onClick={handleGenerate}
        disabled={busy || !thumbnailTitle.trim() || !reelText.trim() || images.length === 0}
        className="w-full py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors text-sm"
      >
        {busy ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> {uploadMutation.isPending ? 'Uploading images...' : 'Generating...'}</>
        ) : (
          <><Upload className="w-4 h-4" /> Generate Format B Reel</>
        )}
      </button>
    </div>
  )
}
