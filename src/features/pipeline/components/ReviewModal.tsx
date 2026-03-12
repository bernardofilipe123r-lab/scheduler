import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

/* ───────────────────────────────────────────────────
   REEL — Thumbnail left + Video right, 9:16 tall
   Height-driven: we fix height, width auto from ratio
   ─────────────────────────────────────────────────── */
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
    <div className="flex gap-1.5 justify-center w-full" style={{ height: '65vh' }}>
      {/* Thumbnail panel */}
      <div
        className="h-full rounded-2xl overflow-hidden bg-gray-900 shadow-lg flex-shrink-0"
        style={{ aspectRatio: '9/16' }}
      >
        {thumbnail ? (
          <img src={thumbnail} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">
            No thumbnail
          </div>
        )}
      </div>
      {/* Video panel */}
      <div
        className="h-full rounded-2xl overflow-hidden bg-black shadow-lg flex-shrink-0 relative"
        style={{ aspectRatio: '9/16' }}
      >
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
        {/* Mute toggle */}
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
        {/* "Video" label */}
        <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm text-white/80 text-[10px] font-medium px-2 py-0.5 rounded-full">
          Video
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────
   CAROUSEL — Slide viewer with internal arrows + dots
   ─────────────────────────────────────────────────── */
function CarouselContent({ item }: { item: PipelineItem }) {
  const slides = getCarouselSlides(item)
  const [slideIdx, setSlideIdx] = useState(0)

  useEffect(() => { setSlideIdx(0) }, [item.job_id])

  if (slides.length === 0) {
    return (
      <div
        className="rounded-2xl bg-gray-900 flex items-center justify-center text-white/30 text-sm mx-auto"
        style={{ height: '65vh', aspectRatio: '4/5' }}
      >
        No slides available
      </div>
    )
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-gray-900 shadow-lg mx-auto"
      style={{ height: '65vh', aspectRatio: '4/5' }}
    >
      <img
        src={slides[slideIdx]}
        alt={`Slide ${slideIdx + 1}`}
        className="w-full h-full object-contain"
      />
      {/* Slide counter badge */}
      <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full">
        {slideIdx + 1} / {slides.length}
      </div>
      {/* Prev */}
      {slideIdx > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setSlideIdx(i => i - 1) }}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/90 hover:bg-black/70 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {/* Next */}
      {slideIdx < slides.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); setSlideIdx(i => i + 1) }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/90 hover:bg-black/70 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
      {/* Dot indicators */}
      <div className="absolute bottom-4 inset-x-0 flex justify-center gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); setSlideIdx(i) }}
            className={clsx(
              'rounded-full transition-all',
              i === slideIdx ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/40 hover:bg-white/60',
            )}
          />
        ))}
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────
   THREAD — Styled text preview
   ─────────────────────────────────────────────────── */
function ThreadContent({ item }: { item: PipelineItem }) {
  const output = getFirstBrandOutput(item)
  const text = output?.caption || item.caption || item.content_lines?.join('\n') || ''

  return (
    <div
      className="rounded-2xl overflow-hidden bg-[#15202b] shadow-lg mx-auto flex flex-col"
      style={{ height: '65vh', aspectRatio: '9/16' }}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3 border-b border-white/5">
        <div className="w-9 h-9 rounded-full bg-sky-500/20 flex items-center justify-center">
          <span className="text-sky-400 text-sm font-bold">
            {(item.brands[0] ?? 'T')[0].toUpperCase()}
          </span>
        </div>
        <div>
          <span className="text-white/90 text-sm font-semibold">{item.brands[0] ?? 'Thread'}</span>
          <span className="text-white/30 text-[10px] block">@{(item.brands[0] ?? 'thread').toLowerCase().replace(/\s/g, '')}</span>
        </div>
      </div>
      {/* Text body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
        <p className="text-white/90 text-[13px] leading-relaxed whitespace-pre-line">{text}</p>
      </div>
      {/* Action bar mock */}
      <div className="flex items-center justify-around px-5 py-3 border-t border-white/5 text-white/25">
        <span className="text-[10px]">Reply</span>
        <span className="text-[10px]">Repost</span>
        <span className="text-[10px]">Like</span>
        <span className="text-[10px]">Share</span>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────
   POST — Single AI-generated image, 9:16 tall
   ─────────────────────────────────────────────────── */
function PostContent({ item }: { item: PipelineItem }) {
  const thumbnail = getThumbnail(item)
  const videoUrl = getVideoUrl(item)

  return (
    <div
      className="rounded-2xl overflow-hidden bg-gray-900 shadow-lg mx-auto"
      style={{ height: '65vh', aspectRatio: '9/16' }}
    >
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

/* ═══════════════════════════════════════════════════════
   REVIEW MODAL — Portaled to body to escape space-y-5
   ═══════════════════════════════════════════════════════ */

export function ReviewModal({ items: externalItems, initialIndex, onApprove, onReject, onEdit, onClose }: Props) {
  const [queue, setQueue] = useState<PipelineItem[]>(() => externalItems.slice(initialIndex))
  const [currentIdx, setCurrentIdx] = useState(0)
  const totalOriginal = externalItems.length
  const processedCount = totalOriginal - queue.length

  const [direction, setDirection] = useState<'left' | 'right' | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [muted, setMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const preloadRef = useRef<HTMLVideoElement[]>([])

  const item = queue[currentIdx]
  const contentMode = item ? getContentMode(item) : 'unknown'

  // Preload next 2 items' videos + thumbnails in background
  useEffect(() => {
    // Clean up old preload elements
    preloadRef.current.forEach(v => { v.src = ''; v.load() })
    preloadRef.current = []

    const upcoming = queue.slice(currentIdx + 1, currentIdx + 3)
    for (const next of upcoming) {
      const videoUrl = getVideoUrl(next)
      if (videoUrl) {
        const v = document.createElement('video')
        v.preload = 'auto'
        v.muted = true
        v.src = videoUrl
        v.load()
        preloadRef.current.push(v)
      }
      const thumb = getThumbnail(next)
      if (thumb) {
        const img = new Image()
        img.src = thumb
      }
    }
    return () => {
      preloadRef.current.forEach(v => { v.src = ''; v.load() })
      preloadRef.current = []
    }
  }, [currentIdx, queue])

  useEffect(() => {
    if (queue.length === 0) onClose()
  }, [queue.length, onClose])

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
  const modalWidth = contentMode === 'reel' ? 'max-w-[80vw] lg:max-w-3xl' : 'max-w-sm'

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ margin: 0 }}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={clsx('relative z-10 flex flex-col items-center w-full px-4', modalWidth)}
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

        {/* Content card */}
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
            className="w-full"
          >
            {contentMode === 'reel' && (
              <ReelContent item={item} videoRef={videoRef} muted={muted} setMuted={setMuted} />
            )}
            {contentMode === 'carousel' && <CarouselContent item={item} />}
            {contentMode === 'thread' && <ThreadContent item={item} />}
            {(contentMode === 'post' || contentMode === 'unknown') && <PostContent item={item} />}

            {/* Meta */}
            <div className="mt-2 flex items-center gap-2 justify-center">
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
                <span className="text-[10px] bg-white/10 text-white/60 px-1.5 py-0.5 rounded-md">
                  {item.brands[0]}
                </span>
              )}
            </div>
            <p className="mt-1 text-white font-semibold text-sm leading-snug line-clamp-1 text-center">
              {item.title || 'Untitled'}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-4">
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

  // Portal to body to escape any parent CSS (space-y-5, overflow, etc.)
  return createPortal(modal, document.body)
}
