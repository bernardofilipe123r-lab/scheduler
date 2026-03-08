import { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
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

  // Track which card is centered after scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = () => {
      const cardWidth = el.firstElementChild?.getBoundingClientRect().width ?? 280
      const gap = 16
      const idx = Math.round(el.scrollLeft / (cardWidth + gap))
      setActiveIndex(Math.min(idx, REEL_FORMATS.length - 1))
    }
    el.addEventListener('scrollend', handler, { passive: true })
    // Fallback for browsers without scrollend
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
    const cardWidth = el.firstElementChild?.getBoundingClientRect().width ?? 280
    const gap = 16
    const offset = direction === 'left' ? -(cardWidth + gap) : (cardWidth + gap)
    el.scrollBy({ left: offset, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      {/* Scroll arrows */}
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

      {/* Scrollable card row */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 -mx-1 px-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style>{`[data-format-carousel]::-webkit-scrollbar { display: none; }`}</style>
        {REEL_FORMATS.map((format) => (
          <FormatCard key={format.id} format={format} onSelect={onSelect} />
        ))}
      </div>

      {/* Dot indicators */}
      {REEL_FORMATS.length > 1 && (
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
  const Icon = format.icon

  return (
    <button
      onClick={() => onSelect(format.id)}
      className="flex-shrink-0 snap-center w-[280px] group cursor-pointer"
    >
      {/* Card */}
      <div className="rounded-2xl overflow-hidden border-2 border-gray-200 hover:border-gray-400 transition-all duration-200 hover:shadow-lg hover:-translate-y-1 bg-white">
        {/* Visual preview area */}
        <div className={`relative h-44 bg-gradient-to-br ${format.previewGradient} flex items-center justify-center overflow-hidden`}>
          {/* Decorative elements */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-4 left-4 w-20 h-3 rounded-full bg-white/60" />
            <div className="absolute top-10 left-4 w-32 h-3 rounded-full bg-white/40" />
            <div className="absolute top-16 left-4 w-24 h-3 rounded-full bg-white/30" />
            <div className="absolute bottom-6 right-4 w-16 h-16 rounded-xl bg-white/20 rotate-12" />
            <div className="absolute bottom-14 right-20 w-10 h-10 rounded-lg bg-white/15 -rotate-6" />
          </div>

          {/* Phone mockup */}
          <div className="relative w-24 h-40 rounded-xl bg-black/30 backdrop-blur-sm border border-white/30 flex flex-col items-center justify-center gap-2 shadow-xl group-hover:scale-105 transition-transform duration-200">
            <Icon className="w-8 h-8 text-white/90" />
            <div className="space-y-1 w-full px-3">
              <div className="h-1.5 w-full rounded-full bg-white/40" />
              <div className="h-1.5 w-3/4 rounded-full bg-white/30" />
              <div className="h-1.5 w-1/2 rounded-full bg-white/20" />
            </div>
          </div>

          {/* Sparkle badge */}
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-white/20 backdrop-blur-sm">
            <Sparkles className="w-3 h-3 text-white" />
            <span className="text-[10px] font-semibold text-white tracking-wide uppercase">{format.tagline}</span>
          </div>
        </div>

        {/* Info area */}
        <div className="p-4 space-y-2.5">
          <div>
            <h3 className="text-sm font-bold text-gray-900">{format.label}</h3>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{format.description}</p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-1.5">
            {format.features.map(f => (
              <span
                key={f}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
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
