import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, X, Pencil, ChevronLeft, ChevronRight, Star, Volume2, VolumeX } from 'lucide-react'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'
import type { PipelineItem } from '../model/types'

interface Props {
  items: PipelineItem[]
  initialIndex: number
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onEdit: (item: PipelineItem) => void
  onClose: () => void
}

function getVideoUrl(item: PipelineItem): string | null {
  const output = Object.values(item.brand_outputs ?? {})[0]
  return output?.video_path ?? null
}

function getThumbnail(item: PipelineItem): string | null {
  const output = Object.values(item.brand_outputs ?? {})[0]
  return output?.thumbnail_path ?? null
}

function variantLabel(item: PipelineItem): string {
  if (item.variant === 'threads') return 'Thread'
  if (item.content_format === 'carousel') return 'Carousel'
  if (item.variant === 'format_b') return 'Reel B'
  if (item.variant === 'dark') return 'Reel A'
  if (item.variant === 'post') return 'Post'
  return item.variant
}

export function ReviewModal({ items, initialIndex, onApprove, onReject, onEdit, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [direction, setDirection] = useState<'left' | 'right' | null>(null)
  const [muted, setMuted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const item = items[currentIndex]

  // Close when no more items
  useEffect(() => {
    if (!item || items.length === 0) {
      onClose()
    }
  }, [item, items.length, onClose])

  // Auto-play video when item changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => { /* autoplay blocked */ })
    }
  }, [currentIndex])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'a') handleAccept()
      else if (e.key === 'ArrowLeft' || e.key === 'd') handleDecline()
      else if (e.key === 'e') handleEdit()
      else if (e.key === 'm') setMuted(m => !m)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const advanceToNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      onClose()
    }
  }, [currentIndex, items.length, onClose])

  const handleAccept = useCallback(() => {
    if (!item) return
    setDirection('right')
    onApprove(item.job_id)
    // Small delay for animation then advance
    setTimeout(() => {
      setDirection(null)
      advanceToNext()
    }, 300)
  }, [item, onApprove, advanceToNext])

  const handleDecline = useCallback(() => {
    if (!item) return
    setDirection('left')
    onReject(item.job_id)
    setTimeout(() => {
      setDirection(null)
      advanceToNext()
    }, 300)
  }, [item, onReject, advanceToNext])

  const handleEdit = useCallback(() => {
    if (!item) return
    onEdit(item)
    onClose()
  }, [item, onEdit, onClose])

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1)
  }, [currentIndex])

  const goToNext = useCallback(() => {
    if (currentIndex < items.length - 1) setCurrentIndex(prev => prev + 1)
  }, [currentIndex, items.length])

  if (!item) return null

  const videoUrl = getVideoUrl(item)
  const thumbnail = getThumbnail(item)
  const remaining = items.length - currentIndex

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative z-10 flex flex-col items-center max-h-[95vh] w-full max-w-md mx-4"
      >
        {/* Counter */}
        <div className="mb-3 flex items-center gap-3">
          <span className="text-white/90 text-sm font-medium">
            {currentIndex + 1} of {items.length}
          </span>
          <span className="text-white/50 text-xs">
            {remaining} left to review
          </span>
        </div>

        {/* Progress dots */}
        <div className="mb-4 flex gap-1 max-w-xs overflow-hidden">
          {items.slice(Math.max(0, currentIndex - 4), currentIndex + 5).map((_, i) => {
            const actualIndex = Math.max(0, currentIndex - 4) + i
            return (
              <div
                key={actualIndex}
                className={clsx(
                  'h-1 rounded-full transition-all duration-300',
                  actualIndex === currentIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/30',
                )}
              />
            )
          })}
        </div>

        {/* Video card with swipe animation */}
        <AnimatePresence mode="wait">
          <motion.div
            key={item.job_id}
            initial={{ opacity: 0, x: direction === 'right' ? -100 : direction === 'left' ? 100 : 0, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{
              opacity: 0,
              x: direction === 'right' ? 200 : direction === 'left' ? -200 : 0,
              scale: 0.9,
              transition: { duration: 0.25 },
            }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full bg-black rounded-2xl overflow-hidden shadow-2xl"
          >
            {/* Video/preview area */}
            <div className="relative aspect-[9/16] max-h-[60vh] bg-black">
              {videoUrl ? (
                <video
                  ref={videoRef}
                  key={videoUrl}
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  autoPlay
                  playsInline
                  loop
                  muted={muted}
                  preload="auto"
                />
              ) : thumbnail ? (
                <img src={thumbnail} alt={item.title} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">
                  No preview available
                </div>
              )}

              {/* Mute toggle */}
              {videoUrl && (
                <button
                  onClick={() => setMuted(m => !m)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-colors"
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              )}

              {/* Navigation arrows */}
              {currentIndex > 0 && (
                <button
                  onClick={goToPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {currentIndex < items.length - 1 && (
                <button
                  onClick={goToNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-white transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}

              {/* Bottom gradient with meta */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pt-16 pb-4 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                    {variantLabel(item)}
                  </span>
                  {item.quality_score != null && (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                      <Star className="w-3 h-3" />
                      {item.quality_score}
                    </span>
                  )}
                  {item.brands.length > 0 && (
                    <span className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                      {item.brands[0]}
                    </span>
                  )}
                </div>
                <p className="text-white font-semibold text-sm leading-snug line-clamp-2">
                  {item.title || 'Untitled'}
                </p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Action buttons */}
        <div className="mt-5 flex items-center gap-4">
          {/* Decline */}
          <button
            onClick={handleDecline}
            className="group flex flex-col items-center gap-1"
          >
            <div className="w-14 h-14 rounded-full border-2 border-red-400/60 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all duration-200 hover:scale-110">
              <X className="w-7 h-7" />
            </div>
            <span className="text-[10px] text-white/50 group-hover:text-white/70 transition-colors">Decline</span>
          </button>

          {/* Edit */}
          <button
            onClick={handleEdit}
            className="group flex flex-col items-center gap-1"
          >
            <div className="w-11 h-11 rounded-full border-2 border-white/30 flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white hover:border-white/60 transition-all duration-200 hover:scale-110">
              <Pencil className="w-5 h-5" />
            </div>
            <span className="text-[10px] text-white/50 group-hover:text-white/70 transition-colors">Edit</span>
          </button>

          {/* Accept */}
          <button
            onClick={handleAccept}
            className="group flex flex-col items-center gap-1"
          >
            <div className="w-14 h-14 rounded-full border-2 border-emerald-400/60 flex items-center justify-center text-emerald-400 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all duration-200 hover:scale-110">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <span className="text-[10px] text-white/50 group-hover:text-white/70 transition-colors">Accept</span>
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="mt-3 text-[10px] text-white/25">
          ← Decline &nbsp;·&nbsp; → Accept &nbsp;·&nbsp; E Edit &nbsp;·&nbsp; M Mute &nbsp;·&nbsp; Esc Close
        </p>
      </motion.div>
    </div>
  )
}
