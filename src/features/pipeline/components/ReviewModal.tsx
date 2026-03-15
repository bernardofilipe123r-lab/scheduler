import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, X, Pencil, ChevronLeft, ChevronRight, Star, Volume2, VolumeX, Trash2, Download } from 'lucide-react'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'
import type { PipelineItem } from '../model/types'
import { getFirstBrandOutput } from '../model/types'
import { useDynamicBrands } from '@/features/brands/hooks/use-dynamic-brands'

interface Props {
  items: PipelineItem[]
  initialIndex: number
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onEdit: (item: PipelineItem) => void
  onDelete?: (id: string) => void
  onClose: () => void
  autoSchedule?: boolean
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

  // Preload all slide images so navigation is instant
  useEffect(() => {
    slides.forEach((src) => {
      const img = new Image()
      img.src = src
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.job_id])

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
   THREAD — Real Threads-like preview with connected posts
   ─────────────────────────────────────────────────── */

function ThreadActionIcons({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center gap-5 text-gray-300', className)}>
      {/* Heart */}
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M16 7.53c0-2-.35-3.63-2.35-3.63-.91 0-1.63.42-2.2 1-.35.36-.65.79-.89 1.23a.65.65 0 0 1-1.13 0 6.5 6.5 0 0 0-.89-1.23c-.57-.59-1.29-1-2.2-1C4.34 3.9 2.99 5.52 2.99 7.53c0 2.24 1.63 4.41 6 8.49 4.37-4.08 7.01-6.25 7.01-8.49Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
      {/* Comment */}
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M1.08 10.32C.58 5.3 4.79 1.08 9.82 1.58c3.79.39 6.83 3.47 7.12 7.3.13 1.58-.22 3.07-.89 4.34l.87 3.42a.65.65 0 0 1-.79.79l-3.42-.87a7.46 7.46 0 0 1-4.34.89c-3.79-.28-6.9-3.33-7.29-7.13Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
      {/* Repost */}
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M6.41 1.24a.65.65 0 0 1 .88-.08l2.67 2.25a.65.65 0 0 1-.04.98L7.32 6.82a.65.65 0 1 1-.83-1.0l1.5-1.39H5.2A2.75 2.75 0 0 0 2.45 7.26v4.5a2.75 2.75 0 0 0 2.75 2.75.63.63 0 0 1 0 1.25 4 4 0 0 1-4-4v-4.5a4 4 0 0 1 4-4h2.65L6.49 2.12a.65.65 0 0 1-.08-.88Z" fill="currentColor"/><path d="M11.59 17.79a.65.65 0 0 1-.88.08l-2.67-2.25a.65.65 0 0 1 .04-.98l2.67-2.47a.65.65 0 0 1 .83 1.0l-1.5 1.39h2.72a2.75 2.75 0 0 0 2.75-2.75v-4.5a2.75 2.75 0 0 0-2.75-2.75.63.63 0 1 1 0-1.25 4 4 0 0 1 4 4v4.5a4 4 0 0 1-4 4h-2.65l1.36 1.15a.65.65 0 0 1 .08.88Z" fill="currentColor"/></svg>
      {/* Share */}
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M14.53 2.85H3.71c-.77 0-1.4.07-1.71.32a.94.94 0 0 0-.38.94c.11.18.32.42.63.78l3.23 3.2 4.35-2.03L7.28 9.5l1.14 4.78c.24.45.44.69.63.78.15.01.22-.01.38-.14.18-.14.31-.41.51-.77l5.58-9.41c.27-.51.35-.78.38-.97a.56.56 0 0 0-.18-.49.94.94 0 0 0-.69-.17h-.06c-.23.02-.56.02-1.04.02h-.36Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  )
}

function ThreadContent({ item, brandImageUrl }: { item: PipelineItem; brandImageUrl?: string }) {
  const output = getFirstBrandOutput(item)
  const brandName = item.brands[0] ?? 'Thread'
  const handle = brandName.toLowerCase().replace(/\s/g, '')

  // Collect all thread parts
  const parts: string[] = []
  if (output?.chain_parts && output.chain_parts.length > 0) {
    parts.push(...output.chain_parts)
  } else {
    const text = output?.caption || item.caption || item.content_lines?.join('\n') || ''
    if (text) parts.push(text)
  }

  if (parts.length === 0) {
    parts.push('No content preview')
  }

  return (
    <div
      className="rounded-2xl overflow-hidden bg-white shadow-lg mx-auto flex flex-col"
      style={{ maxHeight: 'min(60vh, 500px)', width: '100%', maxWidth: 480 }}
    >
      {/* Threads header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <span className="text-[15px] font-semibold text-gray-900">Threads Preview</span>
      </div>

      {/* Scrollable thread body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {parts.map((text, idx) => {
          const isLast = idx === parts.length - 1
          return (
            <div key={idx} className="flex gap-3">
              {/* Avatar + connector line */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {brandImageUrl ? (
                    <img src={brandImageUrl} alt={brandName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xs font-bold">
                      {brandName[0].toUpperCase()}
                    </span>
                  )}
                </div>
                {!isLast && (
                  <div className="w-0.5 flex-1 bg-gray-200 my-1 min-h-[16px]" />
                )}
              </div>
              {/* Post content */}
              <div className={clsx('flex-1 min-w-0', isLast ? 'pb-4' : 'pb-2')}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-gray-900">{handle}</span>
                  <span className="text-[11px] text-gray-400">now</span>
                </div>
                <p className="text-[14px] leading-[1.45] text-gray-800 whitespace-pre-line mt-0.5">
                  {text}
                </p>
                <ThreadActionIcons className="mt-2" />
              </div>
            </div>
          )
        })}
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
        <video src={videoUrl} className="w-full h-full object-contain" autoPlay playsInline loop muted preload="metadata" />
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

export function ReviewModal({ items: externalItems, initialIndex, onApprove, onReject, onEdit, onDelete, onClose, autoSchedule = true }: Props) {
  const { brands: dynamicBrands } = useDynamicBrands()
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
  const isPending = item?.lifecycle === 'pending_review'

  // Preload next item's thumbnail only (metadata for video)
  // Using preload="metadata" downloads ~100KB headers instead of full video (~5-20MB)
  useEffect(() => {
    preloadRef.current.forEach(v => { v.src = ''; v.load() })
    preloadRef.current = []

    const next = queue[currentIdx + 1]
    if (!next) return

    const videoUrl = getVideoUrl(next)
    if (videoUrl) {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      v.src = videoUrl
      preloadRef.current.push(v)
    }
    const thumb = getThumbnail(next)
    if (thumb) {
      const img = new Image()
      img.src = thumb
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
      else if (e.key === 'ArrowRight' && isPending) { if (autoSchedule) handleAccept(); else handleDownload() }
      else if (e.key === 'ArrowLeft' && isPending) handleDecline()
      else if ((e.key === 'e' || e.key === 'E') && isPending) handleEdit()
      else if ((e.key === 'd' || e.key === 'D') && !isPending) handleDeleteItem()
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

  const handleDownload = useCallback(() => {
    if (!item) return
    const output = getFirstBrandOutput(item)
    const url = output?.video_path ?? output?.carousel_paths?.[0] ?? output?.thumbnail_path
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `${item.title || item.job_id}.${url.includes('.mp4') ? 'mp4' : 'jpg'}`
    a.click()
  }, [item])

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

  const handleDeleteItem = useCallback(() => {
    if (!item || isAnimating || !onDelete) return
    setIsAnimating(true)
    setDirection('left')
    onDelete(item.job_id)
    setTimeout(() => {
      setDirection(null)
      setIsAnimating(false)
      removeCurrentFromQueue()
    }, 250)
  }, [item, isAnimating, onDelete, removeCurrentFromQueue])

  if (!item) return null

  const remaining = queue.length - currentIdx
  const modalWidth = contentMode === 'reel' ? 'max-w-[80vw] lg:max-w-3xl' : contentMode === 'thread' ? 'max-w-lg' : 'max-w-sm'

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
            {isPending ? `${remaining} left to review` : `viewing ${remaining} items`}
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
            {contentMode === 'thread' && (
              <ThreadContent
                item={item}
                brandImageUrl={dynamicBrands.find(b => b.id === item.brands[0])?.profile_image_url}
              />
            )}
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
          {isPending ? (
            <>
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

              <button onClick={autoSchedule ? handleAccept : handleDownload} disabled={isAnimating} className="group flex flex-col items-center gap-1">
                <div className={clsx(
                  'w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all duration-200 hover:scale-110',
                  autoSchedule
                    ? 'border-emerald-400/60 text-emerald-400 hover:bg-emerald-500 hover:text-white hover:border-emerald-500'
                    : 'border-blue-400/60 text-blue-400 hover:bg-blue-500 hover:text-white hover:border-blue-500'
                )}>
                  {autoSchedule ? <CheckCircle2 className="w-7 h-7" /> : <Download className="w-7 h-7" />}
                </div>
                <span className="text-[10px] text-white/50 group-hover:text-white/70 transition-colors">{autoSchedule ? 'Accept' : 'Download'}</span>
              </button>
            </>
          ) : (
            <button onClick={handleDeleteItem} disabled={isAnimating || !onDelete} className="group flex flex-col items-center gap-1">
              <div className="w-14 h-14 rounded-full border-2 border-red-400/60 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all duration-200 hover:scale-110">
                <Trash2 className="w-7 h-7" />
              </div>
              <span className="text-[10px] text-white/50 group-hover:text-white/70 transition-colors">Delete</span>
            </button>
          )}
        </div>

        <p className="mt-2 text-[10px] text-white/25">
          {isPending
            ? autoSchedule
              ? '← Decline · → Accept · E Edit · M Mute · Esc Close'
              : '← Decline · → Download · E Edit · M Mute · Esc Close'
            : 'D Delete · M Mute · Esc Close'}
        </p>
      </motion.div>
    </div>
  )

  // Portal to body to escape any parent CSS (space-y-5, overflow, etc.)
  return createPortal(modal, document.body)
}
