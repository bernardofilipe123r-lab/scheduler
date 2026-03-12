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

function getCarouselSlides(item: PipelineItem): string[] {
  return getFirstBrandOutput(item)?.carousel_paths ?? []
}

function variantLabel(item: PipelineItem): string {
  if (item.variant === 'threads') return 'Thread'
  if (item.content_format === 'carousel') return 'Carousel'
  if (item.variant === 'format_b') return 'Reel B'
  if (item.variant === 'dark') return 'Reel A'
  if (item.variant === 'post') return 'Post'
  return item.variant
}

type ContentMode = 'reel' | 'carousel' | 'thread' | 'post' | 'unknown'

function getContentMode(item: PipelineItem): ContentMode {
  if (item.variant === 'threads') return 'thread'
  const output = getFirstBrandOutput(item)
  if ((output?.carousel_paths?.length ?? 0) > 0 || item.content_format === 'carousel') return 'carousel'
  if (['dark', 'light', 'format_b'].includes(item.variant) && output?.video_path) return 'reel'
  if (item.variant === 'post') return 'post'
  return 'unknown'
}

/* ───── Reel: thumbnail left + video right ───── */
function ReelContent({
  item,
  videoRef,
  muted,
  setMuted,
}: {
  item: PipelineItem
  videoRef: React.RefObject<HTMLVideoElement>
  muted: boolean
  setMuted: (fn: (m: boolean) => boolean) => void
}) {
  const videoUrl = getVideoUrl(item)!
  const thumbnail = getThumbnail(item)

  return (
    <div className="flex gap-1 w-full">
      {/* Thumbnail (left) */}
      <div className="flex-1 min-w-0 aspect-[9/16] max-h-[60vh] rounded-l-2xl overflow-hidden bg-gray-900">
        {thumbnail ? (
          <img src={thumbnail} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">
            No thumbnail
          </div>
        )}
      </div>
      {/* Video (right) */}
      <div className="flex-1 min-w-0 aspect-[9/16] max-h-[60vh] rounded-r-2xl overflow-hidden bg-black relative">
        <video
          ref={videoRef}
          key={videoUrl}
          src={videoUrl}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          loop
          muted={muted}
          preload="auto"
        />
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
      </div>
    </div>
  )
}

/* ───── Carousel: slide viewer with arrows ───── */
function CarouselContent({ item }: { item: PipelineItem }) {
  const slides = getCarouselSlides(item)
  const [slideIdx, setSlideIdx] = useState(0)

  // Reset slide index when item changes
  useEffect(() => { setSlideIdx(0) }, [item.job_id])

  if (slides.length === 0) {
    return (
      <div className="aspect-[4/5] max-h-[60vh] rounded-2xl bg-gray-900 flex items-center justify-center text-white/30 text-sm">
        No slides available
      </div>
    )
  }

  return (
    <div className="relative aspect-[4/5] max-h-[60vh] rounded-2xl overflow-hidden bg-gray-900">
      <img
        src={slides[slideIdx]}
        alt={`Slide ${slideIdx + 1}`}
        className="w-full h-full object-contain"
      />
      {/* Slide counter */}
      <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-full">
        {slideIdx + 1}/{slides.length}
      </div>
      {/* Prev slide */}
      {slideIdx > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setSlideIdx(i => i - 1) }}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {/* Next slide */}
      {slideIdx < slides.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); setSlideIdx(i => i + 1) }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
      {/* Slide dots */}
      <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); setSlideIdx(i) }}
            className={clsx(
              'w-2 h-2 rounded-full transition-all',
              i === slideIdx ? 'bg-white scale-110' : 'bg-white/40',
            )}
          />
        ))}
      </div>
    </div>
  )
}

/* ───── Thread: text content ───── */
function ThreadContent({ item }: { item: PipelineItem }) {
  const output = getFirstBrandOutput(item)
  const text = output?.caption || item.caption || item.content_lines?.join('\n') || ''

  return (
    <div className="aspect-[3/4] max-h-[60vh] rounded-2xl overflow-hidden bg-gradient-to-b from-gray-900 to-gray-950 p-6 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xs font-bold">
          T
        </div>
        <span className="text-white/60 text-xs">{item.brands[0] ?? 'Thread'}</span>
      </div>
      <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
        <p className="text-white/90 text-sm leading-relaxed whitespace-pre-line">{text}</p>
      </div>
    </div>
  )
}

/* ───── Post / fallback: single image ───── */
function PostContent({ item }: { item: PipelineItem }) {
  const thumbnail = getThumbnail(item)
  const videoUrl = getVideoUrl(item)

  return (
    <div className="aspect-[9/16] max-h-[60vh] rounded-2xl overflow-hidden bg-gray-900">
      {thumbnail ? (
        <img src={thumbnail} alt={item.title} className="w-full h-full object-contain" />
      ) : videoUrl ? (
        <video src={videoUrl} className="w-full h-full object-contain" autoPlay playsInline loop muted preload="auto" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">
          No preview available
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════ */
/*                   REVIEW MODAL                     */
/* ═══════════════════════════════════════════════════ */

export function ReviewModal({ items: externalItems, initialIndex, onApprove, onReject, onEdit, onClose }: Props) {
  const [queue, setQueue] = useState<PipelineItem[]>(() => externalItems.slice(initialIndex))
  const [currentIdx, setCurrentIdx] = useState(0)
  const totalOriginal = externalItems.length
  const processedCount = totalOriginal - queue.length

  const [direction, setDirection] = useState<'left' | 'right' | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [muted, setMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)

  const item = queue[currentIdx]
  const contentMode = item ? getContentMode(item) : 'unknown'

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
    v.play().catch(() => {})
  }, [currentIdx, item?.job_id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  if (!item) return null

  const remaining = queue.length - currentIdx
  // Wider modal for reels (side-by-side), narrower for everything else
  const modalWidth = contentMode === 'reel' ? 'max-w-3xl' : 'max-w-md'

  return (
    <div className="fixed inset-0 z-50 mt-0 flex items-center justify-center">
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
        className={clsx('relative z-10 flex flex-col items-center w-full mx-4', modalWidth)}
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

        {/* Content card with swipe animation */}
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
            className="relative w-full"
          >
            {/* Content-type-specific media */}
            {contentMode === 'reel' && (
              <ReelContent item={item} videoRef={videoRef} muted={muted} setMuted={setMuted} />
            )}
            {contentMode === 'carousel' && <CarouselContent item={item} />}
            {contentMode === 'thread' && <ThreadContent item={item} />}
            {(contentMode === 'post' || contentMode === 'unknown') && <PostContent item={item} />}

            {/* Meta bar below media */}
            <div className="mt-2 flex items-center gap-2 px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
                {variantLabel(item)}
              </span>
              {item.quality_score != null && (
                <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                  <Star className="w-3 h-3" />
                  {item.quality_score}
                </span>
              )}
              {item.brands.length > 0 && (
                <span className="text-[10px] bg-white/10 text-white/60 px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                  {item.brands[0]}
                </span>
              )}
            </div>
            <p className="mt-1 text-white font-semibold text-sm leading-snug line-clamp-2 px-1">
              {item.title || 'Untitled'}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Action buttons */}
        <div className="mt-4 flex items-center gap-4">
          <button onClick={handleDecline} disabled={isAnimating} className="group flex flex-col items-center gap-1">
            <div className="w-14 h-14 rounded-full border-2 border-red-400/60 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all duration-200 hover:scale-110">
              <X className="w-7 h-7" />
            </div>
            <span className="text-[10px] text-white/50 group-hover:text-white/70 transition-colors">Decline</span>
          </button>

          <button onClick={handleEdit} className="group flex flex-col items-center gap-1">
            <div className="w-11 h-11 rounded-full border-2 border-white/30 flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white hover:border-white/60 transition-all duration-200 hover:scale-110">
              <Pencil className="w-5 h-5" />
            </div>
            <span className="text-[10px] text-white/50 group-hover:text-white/70 transition-colors">Edit</span>
          </button>

          <button onClick={handleAccept} disabled={isAnimating} className="group flex flex-col items-center gap-1">
            <div className="w-14 h-14 rounded-full border-2 border-emerald-400/60 flex items-center justify-center text-emerald-400 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all duration-200 hover:scale-110">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <span className="text-[10px] text-white/50 group-hover:text-white/70 transition-colors">Accept</span>
          </button>
        </div>

        <p className="mt-2 text-[10px] text-white/25">
          ← Decline &nbsp;·&nbsp; → Accept &nbsp;·&nbsp; E Edit &nbsp;·&nbsp; M Mute &nbsp;·&nbsp; Esc Close
        </p>
      </motion.div>
    </div>
  )
}
