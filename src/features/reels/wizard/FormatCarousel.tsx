import { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { REEL_FORMATS, type ReelFormat } from '../formats'

interface FormatCarouselProps {
  onSelect: (formatId: string) => void
}

export function FormatCarousel({ onSelect }: FormatCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState, { passive: true })
    return () => el.removeEventListener('scroll', updateScrollState)
  }, [updateScrollState])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = () => {
      const cardWidth = el.firstElementChild?.getBoundingClientRect().width ?? 180
      const gap = 16
      const idx = Math.round(el.scrollLeft / (cardWidth + gap))
      setActiveIndex(Math.min(idx, REEL_FORMATS.length - 1))
    }
    el.addEventListener('scrollend', handler, { passive: true })
    let timeout: ReturnType<typeof setTimeout>
    const scrollHandler = () => {
      clearTimeout(timeout)
      timeout = setTimeout(handler, 100)
    }
    el.addEventListener('scroll', scrollHandler, { passive: true })
    return () => {
      el.removeEventListener('scrollend', handler)
      el.removeEventListener('scroll', scrollHandler)
      clearTimeout(timeout)
    }
  }, [])

  const scrollTo = (direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const cardWidth = el.firstElementChild?.getBoundingClientRect().width ?? 180
    const gap = 16
    const offset = direction === 'left' ? -(cardWidth + gap) : (cardWidth + gap)
    el.scrollBy({ left: offset, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      {canScrollLeft && (
        <button
          onClick={() => scrollTo('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-9 h-9 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={() => scrollTo('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-9 h-9 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      )}

      {/* Scrollable card row — centered */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 justify-center"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {REEL_FORMATS.map((format) => (
          <FormatCard key={format.id} format={format} onSelect={onSelect} />
        ))}
      </div>

      {REEL_FORMATS.length > 2 && (
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {REEL_FORMATS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === activeIndex
                  ? 'w-5 h-1.5 bg-stone-800'
                  : 'w-1.5 h-1.5 bg-gray-300'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FormatCard({ format, onSelect }: { format: ReelFormat; onSelect: (id: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseEnter = () => {
    setIsHovering(true)
    const v = videoRef.current
    if (v) {
      v.currentTime = 0
      v.play().catch(() => {})
    }
  }

  const handleMouseLeave = () => {
    setIsHovering(false)
    const v = videoRef.current
    if (v) {
      v.pause()
      v.currentTime = 0
    }
  }

  return (
    <button
      onClick={() => onSelect(format.id)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="flex-shrink-0 snap-center group cursor-pointer focus:outline-none"
    >
      <div className="rounded-2xl overflow-hidden border-2 border-gray-200 hover:border-gray-400 transition-all duration-200 hover:shadow-xl hover:-translate-y-1 bg-white w-[180px]">
        {/* 9:16 video preview area */}
        <div className="relative w-full overflow-hidden rounded-t-2xl" style={{ aspectRatio: '9/16' }}>
          {/* Gradient fallback */}
          <div className={`absolute inset-0 bg-gradient-to-br ${format.previewGradient}`} />

          {/* Video element */}
          <video
            ref={videoRef}
            src={format.previewVideo}
            muted
            loop
            playsInline
            preload="metadata"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              isHovering ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Play hint overlay (shown when not hovering) */}
          {!isHovering && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
              </div>
              <span className="text-[10px] font-semibold text-white/80 tracking-wider uppercase">Hover to preview</span>
            </div>
          )}

          {/* Tagline badge */}
          <div className="absolute top-2.5 left-2.5 right-2.5">
            <span className="inline-block text-[9px] font-bold text-white tracking-wider uppercase bg-black/30 backdrop-blur-sm px-2 py-1 rounded-md">
              {format.tagline}
            </span>
          </div>
        </div>

        {/* Info area below the video */}
        <div className="p-3 space-y-2">
          <div>
            <h3 className="text-xs font-bold text-gray-900 leading-tight">{format.label}</h3>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{format.description}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {format.features.map(f => (
              <span
                key={f}
                className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  )
}
