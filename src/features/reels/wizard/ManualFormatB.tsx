import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ImagePlus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useGenerateFormatB, useUploadImages } from '../api/use-format-b'
import type { BrandName } from '@/shared/types'

const MAX_IMAGES = 10

interface ManualFormatBProps {
  brands: BrandName[]
  platforms: string[]
  onComplete: () => void
}

export function ManualFormatB({ brands, platforms, onComplete }: ManualFormatBProps) {
  const navigate = useNavigate()
  const generateMutation = useGenerateFormatB()
  const uploadMutation = useUploadImages()

  const [thumbnailTitle, setThumbnailTitle] = useState('')
  const [reelText, setReelText] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

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

    try {
      // 1. Upload images
      const paths = await uploadMutation.mutateAsync(images)

      // 2. Generate reel
      const result = await generateMutation.mutateAsync({
        mode: 'manual',
        brands,
        platforms,
        thumbnail_title: thumbnailTitle,
        reel_lines: reelText.split('\n').filter(l => l.trim()),
        image_paths: paths,
      })

      toast.success(
        (t) => (
          <span className="cursor-pointer" onClick={() => { toast.dismiss(t.id); navigate(`/job/${result.job_id}`) }}>
            Format B reel started! <u>View Job →</u>
          </span>
        ),
        { duration: 6000 }
      )
      onComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed')
    }
  }

  const busy = uploadMutation.isPending || generateMutation.isPending

  return (
    <div className="space-y-4">
      {/* Thumbnail Title */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Thumbnail Title</label>
        <textarea
          value={thumbnailTitle}
          onChange={e => setThumbnailTitle(e.target.value)}
          placeholder={"ELON MUSK\nJUST BOUGHT\nTIKTOK"}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent resize-none text-sm"
        />
        <p className="text-[10px] text-gray-400 mt-1">ALL CAPS, one line per row (max 4 lines)</p>
      </div>

      {/* Reel Script */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reel Script</label>
        <textarea
          value={reelText}
          onChange={e => setReelText(e.target.value)}
          placeholder={"In a move nobody saw coming...\nElon Musk just acquired TikTok.\nThis could reshape social media forever."}
          rows={4}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent resize-none text-sm"
        />
        <p className="text-[10px] text-gray-400 mt-1">One line per row — each becomes a text overlay</p>
      </div>

      {/* Image Upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Images <span className="text-gray-400 font-normal">({images.length}/{MAX_IMAGES})</span>
        </label>

        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center cursor-pointer hover:border-stone-400 hover:bg-stone-50/30 transition-colors"
        >
          <ImagePlus className="w-7 h-7 text-gray-400 mx-auto mb-1.5" />
          <p className="text-sm text-gray-600">Click or drag images</p>
          <p className="text-[10px] text-gray-400 mt-0.5">JPG, PNG, WebP — max {MAX_IMAGES}, 10 MB each</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={e => e.target.files && addFiles(e.target.files)}
          />
        </div>

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

      {/* Generate */}
      <button
        onClick={handleGenerate}
        disabled={busy || !thumbnailTitle.trim() || !reelText.trim() || images.length === 0}
        className="w-full py-3.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors text-sm"
      >
        {busy ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> {uploadMutation.isPending ? 'Uploading...' : 'Generating...'}</>
        ) : (
          <>🎬 Generate Format B Reel</>
        )}
      </button>
    </div>
  )
}
