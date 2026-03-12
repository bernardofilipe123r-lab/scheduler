import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, X, Pencil, ChevronLeft, ChevronRight, Star, Volume2, VolumeX } from 'lucide-react'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'
import type { PipelineItem } from '../model/types'
import { getFirstBrandOutput } from '../model/types'

interface Props {
  items: PipelineItem[]
  initialIndex: number
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onEdit: (item: PipelineItem) => void
  onClose: () => void
}

function getVideoUrl(item: PipelineItem): string | null {
  return getFirstBrandOutput(item)?.video_path ?? null
}

function getThumbnail(item: PipelineItem): string | null {
  return getFirstBrandOutput(item)?.thumbnail_path ?? null
}

function variantLabel(item: PipelineItem): string {
  if (item.variant === 'threads') return 'Thread'
  if (item.content_format === 'carousel') return 'Carousel'
  if (item.variant === 'format_b') return 'Reel B'
  if (item.variant === 'dark') return 'Reel A'
  if (item.variant === 'post') return 'Post'
  return item.variant
}

export function ReviewModal({ items: externalItems, initialIndex, onApprove, onReject, onEdit, onClose }: Props) {
  // Internal queue: items that haven't been accepted/declined yet
  const [queue, setQueue] = useState<PipelineItem[]>(() => {
    // Start from initialIndex, keep only items from that point forward
    return externalItems.slice(initialIndex)
  })
  const [currentIdx, setCurrentIdx] = useState(0)
  const totalOriginal = externalItems.length
  const processedCount = totalOriginal - queue.length

  const [direction, setDirection] = useState<'left' | 'right' | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [muted, setMuted] = useState(true) // Start muted so autoplay works
  const videoRef = useRef<HTMLVideoElement>(null)

  const item = queue[currentIdx]

  // Close when queue is empty
  useEffect(() => {
    if (queue.length === 0) onClose()
  }, [queue.length, onClose])

  // Auto-play video when item changes
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = 0
    v.muted = muted
    v.play().catch(() => { /* autoplay policy */ })
  }, [currentIdx, item?.job_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync muted state to video element
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isAnimating) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') handleAccept()
      else if (e.key === 'ArrowLeft') handleDecline()
      else if (e.key === 'e' || e.key === 'E') handleEdit()
      else if (e.key === 'm' || e.key === 'M') setMuted(m => !m)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const removeCurrentFromQueue = useCallback(() => {
    setQueue(prev => {
      const next = [...prev]
      next.splice(currentIdx, 1)
      return next
    })
    // If we removed the last item in queue, currentIdx may be out of bounds — clamp it
    setCurrentIdx(prev => {
      const newLen = queue.length - 1
      if (newLen <= 0) return 0
      return Math.min(prev, newLen - 1)
    })
  }, [currentIdx, queue.length])

  const handleAccept = useCallback(() => {
    if (!item || isAnimating) return
    setIsAnimating(true)
    setDirection('right')
    onApprove(item.job_id)
    // Animate out, then remove from queue
    setTimeout(() => {
      setDirection(null)
      setIsAnimating(false)
      removeCurrentFromQueue()
    }, 250)
  }, [item, isAnimating, onApprove, removeCurrentFromQueue])

  const handleDecline = useCallback(() => {
    if (!item || isAnimating) return
    setIsAnimating(true)
    setDirection('left')
    onReject(item.job_id)
    setTimeout(() => {
      setDirection(null)
      setIsAnimating(false)
      removeCurrentFromQueue()
    }, 250)
  }, [item, isAnimating, onReject, removeCurrentFromQueue])

  const handleEdit = useCallback(() => {
    if (!item) return
    onEdit(item)
    onClose()
  }, [item, onEdit, onClose])

  const goToPrev = useCallback(() => {
    if (currentIdx > 0 && !isAnimating) setCurrentIdx(prev => prev - 1)
  }, [currentIdx, isAnimating])

  const goToNext = useCallback(() => {
    if (currentIdx < queue.length - 1 && !isAnimating) setCurrentIdx(prev => prev + 1)
  }, [currentIdx, queue.length, isAnimating])

  if (!item) return null

  const videoUrl = getVideoUrl(item)
  const thumbnail = getThumbnail(item)
  const remaining = queue.length - currentIdx

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content — centered with no extra margin */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative z-10 flex flex-col items-center w-full max-w-md"
      >
        {/* Counter */}
        <div className="mb-2 flex items-center gap-3">
          <span className="text-white/90 text-sm font-medium">
            {processedCount + currentIdx + 1} of {totalOriginal}
          </span>
          <span className="text-white/50 text-xs">
            {remaining} left to review
          </span>
        </div>

        {/* Progress dots */}
        <div className="mb-3 flex gap-1 max-w-xs overflow-hidden">
          {queue.slice(Math.max(0, currentIdx - 4), currentIdx + 5).map((q, i) => {
            const actualIndex = Math.max(0, currentIdx - 4) + i
            return (
              <div
                key={q.job_id}
                className={clsx(
                  'h-1 rounded-full transition-all duration-300',
                  actualIndex === currentIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/30',
                )}
              />
            )
          })}
        </div>

        {/* Video card with swipe animation */}
        <AnimatePresence mode="popLayout">
          <motion.div
            key={item.job_id}
            initial={{ opacity: 0, x: direction === 'right' ? -80 : direction === 'left' ? 80 : 0, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{
              opacity: 0,
              x: direction === 'right' ? 200 : direction === 'left' ? -200 : 0,
              scale: 0.9,
              transition: { duration: 0.2 },
            }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="relative w-full bg-black rounded-2xl overflow-hidden shadow-2xl"
          >
            {/* Video/preview area */}
            <div className="relative aspect-[9/16] max-h-[55vh] bg-black">
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

              {/* Mute toggle — prominent when muted */}
              {videoUrl && (
                <button
                  onClick={() => setMuted(m => !m)}
                  className={clsx(
                    'absolute top-3 right-3 rounded-full backdrop-blur-sm flex items-center justify-center transition-all',
                    muted
                      ? 'w-10 h-10 bg-white/20 text-white hover:bg-white/30'
                      : 'w-8 h-8 bg-black/40 text-white/80 hover:text-white',
                  )}
                >
                  {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-4 h-4" />}
                </button>
              )}

              {/* Navigation arrows */}
              {currentIdx > 0 && (
                <button
                  onClick={goToPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {currentIdx < queue.length - 1 && (
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
        <div className="mt-4 flex items-center gap-4">
          {/* Decline */}
          <button
            onClick={handleDecline}
            disabled={isAnimating}
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
            disabled={isAnimating}
            className="group flex flex-col items-center gap-1"
          >
            <div className="w-14 h-14 rounded-full border-2 border-emerald-400/60 flex items-center justify-center text-emerald-400 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all duration-200 hover:scale-110">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <span className="text-[10px] text-white/50 group-hover:text-white/70 transition-colors">Accept</span>
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="mt-2 text-[10px] text-white/25">
          ← Decline &nbsp;·&nbsp; → Accept &nbsp;·&nbsp; E Edit &nbsp;·&nbsp; M Mute &nbsp;·&nbsp; Esc Close
        </p>
      </motion.div>
    </div>
  )
}
